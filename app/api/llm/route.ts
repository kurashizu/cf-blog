import { NextRequest, NextResponse } from "next/server";
import {
    type GeminiMessage,
    type GeminiGenerateOptions,
    SYSTEM_PROMPT,
} from "@/lib/llm-prompt";
import { checkBurst, checkDailyKV, getIP } from "@/lib/ratelimiter";
import {
    callWithFallback,
    streamWithFallback,
    getModelPool,
    getDefaultModel,
} from "@/lib/model-pool";

const MAX_MESSAGE_LENGTH = 10000;
const MAX_MESSAGES = 50;
const MAX_TOKENS = 8192;
const MAX_TEMPERATURE = 1.5;
const BURST_LIMIT = 2;
const BURST_PERIOD = 10;
const DAILY_LIMIT = 200;

interface GeminiPart {
    thought?: boolean;
    text?: string;
}

/**
 * Concatenate text from Gemini response parts. Skips `thought: true` parts
 * (the model's internal monologue) so the Kurashizu AI chat only ever shows
 * the final reply — never the model's "thinking out loud" text.
 */
function extractResponseText(parts: GeminiPart[] | undefined): string {
    if (!Array.isArray(parts)) return "";
    let text = "";
    for (const part of parts) {
        if (part?.thought === true) continue;
        if (typeof part?.text === "string") text += part.text;
    }
    return text;
}

function sanitizeMessage(msg: GeminiMessage): GeminiMessage {
    return {
        role: msg.role === "user" || msg.role === "model" ? msg.role : "user",
        parts: Array.isArray(msg.parts)
            ? msg.parts
                  .filter((p) => p && typeof p.text === "string")
                  .slice(0, 10)
                  .map((p) => ({
                      text: String(p.text).slice(0, MAX_MESSAGE_LENGTH),
                  }))
            : [],
    };
}

function sanitizeOptions(
    options?: GeminiGenerateOptions,
): GeminiGenerateOptions | undefined {
    if (!options) return undefined;
    return {
        model: options.model || "gemini-2.5-flash-lite",
        temperature:
            typeof options.temperature === "number"
                ? Math.min(Math.max(options.temperature, 0), MAX_TEMPERATURE)
                : 0.9,
        maxTokens:
            typeof options.maxTokens === "number"
                ? Math.min(Math.max(options.maxTokens, 1), MAX_TOKENS)
                : MAX_TOKENS,
        topP:
            typeof options.topP === "number"
                ? Math.min(Math.max(options.topP, 0), 1)
                : 0.95,
        topK:
            typeof options.topK === "number"
                ? Math.min(Math.max(options.topK, 1), 100)
                : 40,
    };
}

export async function POST(request: NextRequest) {
    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ctx = (
            await import("@opennextjs/cloudflare")
        ).getCloudflareContext() as any;
        const env = ctx.env as {
            LLM_RATE_LIMIT?: RateLimit;
            SESSION_KV: KVNamespace;
            GEMINI_API_KEY: string;
            GEMINI_MODELS?: string;
        };

        const ip = getIP(request);

        // 1. CF Rate Limiter burst check (2/10s)
        const burstResp = await checkBurst(
            env.LLM_RATE_LIMIT,
            ip,
            BURST_LIMIT,
            BURST_PERIOD,
        );
        if (burstResp) return burstResp;

        // 2. KV daily check (200/IP)
        const dailyResp = await checkDailyKV(
            env.SESSION_KV,
            "llm",
            ip,
            DAILY_LIMIT,
        );
        if (dailyResp) return dailyResp;

        const body = await request.json();
        const { messages, stream, options } = body as {
            messages?: GeminiMessage[];
            stream?: boolean;
            options?: GeminiGenerateOptions;
        };

        if (!messages || !Array.isArray(messages)) {
            return NextResponse.json(
                { error: "messages is required and must be an array" },
                { status: 400 },
            );
        }

        if (messages.length > MAX_MESSAGES) {
            return NextResponse.json(
                { error: `Maximum ${MAX_MESSAGES} messages allowed` },
                { status: 400 },
            );
        }

        const sanitizedMessages = messages
            .map(sanitizeMessage)
            .filter((m) => m.parts.length > 0);

        if (sanitizedMessages.length === 0) {
            return NextResponse.json(
                {
                    error: "At least one valid message with text content is required",
                },
                { status: 400 },
            );
        }

        const sanitizedOptions = sanitizeOptions(options);
        const modelPool = getModelPool(env);
        const defaultModel = getDefaultModel(env);

        // Gemma 4 26B/31B is unstable in single-turn conversations — without
        // any prior turns the model often emits only a thought part and no
        // reply. Inject a brief synthetic opener so the model treats the
        // request as a continuation of a real conversation.
        const contents: Array<{ role: string; parts: { text: string }[] }> = [
            { role: "user", parts: [{ text: "Hi" }] },
            {
                role: "model",
                parts: [
                    {
                        text: "Hi! I'm Kurashizu's AI assistant. How can I help you today?",
                    },
                ],
            },
            ...sanitizedMessages.map((m) => ({
                role: m.role,
                parts: m.parts,
            })),
        ];

        if (stream) {
            // Mirror KurAgent's flow: streaming call, then parse the SSE
            // stream with a state machine that only forwards non-thought
            // text to the client. This keeps the streaming UX while
            // suppressing the model's internal monologue.
            const { response: streamResp } = await streamWithFallback(
                env.GEMINI_API_KEY,
                modelPool,
                contents,
                {
                    ...sanitizedOptions,
                    model: sanitizedOptions?.model || defaultModel,
                },
                env.SESSION_KV,
                SYSTEM_PROMPT,
            );

            if (!streamResp.ok) {
                const errBody = await streamResp
                    .clone()
                    .json()
                    .catch(() => ({}));
                return NextResponse.json(
                    {
                        error: `Gemini API error ${streamResp.status}: ${JSON.stringify(errBody)}`,
                    },
                    { status: 500 },
                );
            }

            const streamBody = streamResp.body;
            return new Response(
                new ReadableStream({
                    async start(controller) {
                        if (!streamBody) {
                            controller.close();
                            return;
                        }
                        const reader = streamBody.getReader();
                        const decoder = new TextDecoder();
                        let buffer = "";
                        // State machine: only text emitted to client.
                        // mode "text" → accumulating the final reply
                        // mode "skip" → previous chunks had only thought
                        //               parts, the next non-thought text
                        //               part will be the start of the
                        //               reply
                        let mode: "skip" | "text" = "skip";
                        let fullText = "";

                        while (true) {
                            const { done, value } = await reader.read();
                            if (done) break;
                            buffer += decoder.decode(value, {
                                stream: true,
                            });
                            const lines = buffer.split("\n");
                            buffer = lines.pop() ?? "";

                            for (const line of lines) {
                                if (!line.startsWith("data: ")) continue;
                                try {
                                    const json = JSON.parse(line.slice(6));
                                    const candidates =
                                        json.candidates?.[0]?.content?.parts;
                                    if (!Array.isArray(candidates)) continue;

                                    for (const part of candidates) {
                                        if (part?.thought === true) {
                                            mode = "skip";
                                            continue;
                                        }
                                        if (typeof part?.text !== "string")
                                            continue;
                                        // First non-thought text after
                                        // thought(s) resets the accumulator
                                        // so we don't leak a thought chunk
                                        // into the reply.
                                        if (mode === "skip") {
                                            mode = "text";
                                            fullText = part.text;
                                        } else {
                                            fullText += part.text;
                                        }
                                        controller.enqueue(
                                            new TextEncoder().encode(
                                                `data: ${JSON.stringify({ text: fullText })}\n\n`,
                                            ),
                                        );
                                    }
                                } catch {
                                    // Skip malformed lines
                                }
                            }
                        }
                        controller.close();
                    },
                }),
                {
                    headers: {
                        "Content-Type": "text/event-stream",
                        "Cache-Control": "no-cache",
                        Connection: "keep-alive",
                    },
                },
            );
        }

        const { response: resp, model } = await callWithFallback(
            env.GEMINI_API_KEY,
            modelPool,
            contents,
            {
                ...sanitizedOptions,
                model: sanitizedOptions?.model || defaultModel,
            },
            env.SESSION_KV,
            SYSTEM_PROMPT,
        );

        if (!resp.ok) {
            const errBody = await resp
                .clone()
                .json()
                .catch(() => ({}));
            return NextResponse.json(
                {
                    error: `Gemini API error ${resp.status}: ${JSON.stringify(errBody)}`,
                },
                { status: 500 },
            );
        }

        const data = (await resp.json()) as {
            candidates?: { content: { parts: GeminiPart[] } }[];
            usageMetadata?: {
                promptTokenCount: number;
                candidatesTokenCount: number;
                totalTokenCount: number;
            };
        };

        const text = extractResponseText(data.candidates?.[0]?.content?.parts);

        return NextResponse.json({
            text,
            model,
            usage: data.usageMetadata
                ? {
                      promptTokens: data.usageMetadata.promptTokenCount,
                      candidatesTokens: data.usageMetadata.candidatesTokenCount,
                      totalTokens: data.usageMetadata.totalTokenCount,
                  }
                : undefined,
        });
    } catch (error) {
        console.error("LLM route error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Unknown error" },
            { status: 500 },
        );
    }
}
