import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { checkBurst, checkDailyKV, getIP } from "@/lib/ratelimiter";
import {
    callWithFallback,
    streamWithFallback,
    getModelPool,
    getDefaultModel,
} from "@/lib/model-pool";
import { executeTool, FUNCTION_DECLARATIONS } from "@/lib/tools";

const SYSTEM_PROMPT = `You are KurAgent, an AI assistant powered by kurashizu.

Identity:
- You are KurAgent, running on Cloudflare
- Created by kurashizu (GitHub: https://github.com/kurashizu)

Guidelines:
- Be helpful, technical, and concise
- Use tools when needed to answer questions accurately
- When calling tools, provide clear context in your thought process
- If a tool fails, try alternative approaches or acknowledge the limitation
- Reply in clear, well-structured text

Tool Commands:
- When a user message starts with @tool-name (e.g., "@get_time Europe/Berlin"), immediately execute that tool with the provided arguments and return the result.
- Parse the tool name after @ and any arguments provided.

<|channel|>thought
<channel|>`;

const MAX_TOOL_CALLS = 5;
const MAX_HISTORY_TURNS = 20;
const SESSION_TTL = 3600;
const BURST_LIMIT = 2;
const BURST_PERIOD = 10;
const DAILY_LIMIT = 100;

interface Message {
    role: "user" | "model" | "system";
    parts: { text: string }[];
}

interface KVSession {
    messages: Message[];
    version: number;
}

enum State {
    START = "START",
    THINK = "THINK",
    TEXT = "TEXT",
    TOOL = "TOOL",
    END = "END",
}

function trimHistory(messages: Message[]): Message[] {
    const limit = MAX_HISTORY_TURNS * 2;
    if (messages.length <= limit) return messages;
    const firstRole = messages[0]?.role;
    if (firstRole === "system") {
        const [first, ...rest] = messages;
        return [first, ...rest.slice(-(limit - 1))];
    }
    return messages.slice(-limit);
}

function emitEvent(
    controller: ReadableStreamDefaultController,
    type: string,
    content: string,
) {
    controller.enqueue(
        new TextEncoder().encode(
            `data: ${JSON.stringify({ type, content })}\n\n`,
        ),
    );
}

function emitStateEnd(
    controller: ReadableStreamDefaultController,
    state: State,
) {
    if (state === State.THINK) emitEvent(controller, "end_think", "");
    if (state === State.TEXT) emitEvent(controller, "end_text", "");
    if (state === State.TOOL)
        emitEvent(controller, "end_tool", "tool executed");
}

function handlePart(
    part: { thought?: boolean; text?: string },
    state: { current: State },
    controller: ReadableStreamDefaultController,
    acc: { value: string },
): void {
    if (part.thought === true) {
        const content = (part.text ?? "").trim();
        if (!content) return;
        if (state.current !== State.THINK) {
            emitStateEnd(controller, state.current);
            emitEvent(controller, "start_think", part.text ?? "");
            state.current = State.THINK;
        } else {
            emitEvent(controller, "think", part.text ?? "");
        }
    } else if (part.text !== undefined && part.thought === undefined) {
        const content = part.text ?? "";
        if (!content) return;
        if (state.current !== State.TEXT) {
            emitStateEnd(controller, state.current);
            emitEvent(controller, "start_text", content);
            state.current = State.TEXT;
        } else {
            emitEvent(controller, "text", content);
        }
        acc.value += content;
    }
}

async function parseSSEStream(
    response: Response,
    state: { current: State },
    controller: ReadableStreamDefaultController,
): Promise<string> {
    const body = response.body;
    if (!body) throw new Error("No response body");

    const reader = body.getReader();
    const decoder = new TextDecoder();
    let lineBuffer = "";
    const acc = { value: "" };

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        lineBuffer += decoder.decode(value, { stream: true });

        const lines = lineBuffer.split("\n");
        lineBuffer = lines.pop() ?? "";

        for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
                const json = JSON.parse(line.slice(6));

                let text: string | undefined;
                let thought: boolean | undefined;

                const candidates = json.candidates?.[0]?.content?.parts;
                if (Array.isArray(candidates)) {
                    for (const part of candidates) {
                        if (part.thought === true) {
                            text = part.text;
                            thought = true;
                        } else if (part.text !== undefined) {
                            text = part.text;
                        }
                        if (text !== undefined) {
                            handlePart(
                                { thought, text },
                                state,
                                controller,
                                acc,
                            );
                        }
                    }
                }
            } catch {
                /* skip malformed */
            }
        }
    }

    return acc.value;
}

export async function OPTIONS() {
    return new Response(null, {
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        },
    });
}

export async function POST(request: NextRequest) {
    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ctx = getCloudflareContext() as any;
        const env = ctx.env as {
            GEMINI_API_KEY: string;
            SESSION_KV: KVNamespace;
            CHAT_RATE_LIMIT?: RateLimit;
            GEMINI_MODELS?: string;
        };

        if (!env.GEMINI_API_KEY) {
            return NextResponse.json(
                { error: "GEMINI_API_KEY not configured" },
                { status: 500 },
            );
        }

        const ip = getIP(request);
        const burstResp = await checkBurst(
            env.CHAT_RATE_LIMIT,
            ip,
            BURST_LIMIT,
            BURST_PERIOD,
        );
        if (burstResp) return burstResp;

        const dailyResp = await checkDailyKV(
            env.SESSION_KV,
            "chat",
            ip,
            DAILY_LIMIT,
        );
        if (dailyResp) return dailyResp;

        const body = (await request.json()) as {
            session_id?: string;
            message?: string;
            options?: {
                model?: string;
                temperature?: number;
                maxTokens?: number;
                topP?: number;
                topK?: number;
                stream?: boolean;
            };
        };

        if (body.session_id && body.message) {
            return handleSessionChat(
                env,
                body.session_id,
                body.message,
                body.options,
            );
        }

        return NextResponse.json(
            { error: "{ session_id, message } is required" },
            { status: 400 },
        );
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Unknown error" },
            { status: 500 },
        );
    }
}

// ─── Session-based chat ───────────────────────────────────────────────────────

async function handleSessionChat(
    env: {
        GEMINI_API_KEY: string;
        SESSION_KV: KVNamespace;
        GEMINI_MODELS?: string;
    },
    session_id: string,
    message: string,
    options?: {
        model?: string;
        temperature?: number;
        maxTokens?: number;
        topP?: number;
        topK?: number;
        stream?: boolean;
    },
) {
    let stored: KVSession | null = null;
    try {
        const raw = await env.SESSION_KV.get(session_id, "json");
        if (raw) stored = raw as KVSession;
    } catch {
        /* KV read failure — start fresh */
    }

    const messages: Message[] = stored?.messages ?? [];
    const version = stored?.version ?? 0;

    messages.push({
        role: "user",
        parts: [{ text: String(message).slice(0, 10000) }],
    });
    const contents = messages.map((m) => ({ role: m.role, parts: m.parts }));

    const stream = new ReadableStream({
        async start(controller) {
            const toolCalls: {
                name: string;
                args: Record<string, unknown>;
                result: unknown;
            }[] = [];
            const state = { current: State.START };
            const modelPool = getModelPool(env);
            const defaultModel = options?.model || getDefaultModel(env);

            emitEvent(controller, "start_process", "");

            try {
                for (
                    let iteration = 0;
                    iteration < MAX_TOOL_CALLS;
                    iteration++
                ) {
                    const { response: resp } = await callWithFallback(
                        env.GEMINI_API_KEY,
                        modelPool,
                        contents,
                        { ...options, model: defaultModel },
                        undefined,
                        SYSTEM_PROMPT,
                        [{ functionDeclarations: FUNCTION_DECLARATIONS }],
                    );

                    if (!resp.ok)
                        throw new Error(
                            `Gemini API error ${resp.status}: ${await resp.text()}`,
                        );

                    const data = (await resp.json()) as Record<string, unknown>;

                    const candidates = data.candidates as Array<{
                        content?: {
                            parts?: Array<{
                                thought?: boolean;
                                text?: string;
                                functionCall?: {
                                    name: string;
                                    args: Record<string, unknown>;
                                };
                            }>;
                        };
                    }>;
                    const parts: Array<{
                        thought?: boolean;
                        text?: string;
                        functionCall?: {
                            name: string;
                            args: Record<string, unknown>;
                        };
                    }> = candidates?.[0]?.content?.parts ?? [];

                    let hasToolCall = false;

                    for (const part of parts) {
                        // functionCall handled separately
                        if (part.functionCall) {
                            if (state.current !== State.TOOL) {
                                emitStateEnd(controller, state.current);
                                // Emit tool_start with structured data for frontend
                                controller.enqueue(
                                    new TextEncoder().encode(
                                        `data: ${JSON.stringify({
                                            type: "tool_start",
                                            tool: part.functionCall.name,
                                            args: part.functionCall.args,
                                            iteration: iteration + 1,
                                        })}\n\n`,
                                    ),
                                );
                                const result = await executeTool(
                                    part.functionCall.name,
                                    part.functionCall.args,
                                );
                                // Emit tool_result with result data
                                controller.enqueue(
                                    new TextEncoder().encode(
                                        `data: ${JSON.stringify({
                                            type: "tool_result",
                                            tool: part.functionCall.name,
                                            result,
                                            success: true,
                                        })}\n\n`,
                                    ),
                                );
                                emitEvent(
                                    controller,
                                    "end_tool",
                                    "tool executed successfully",
                                );
                                toolCalls.push({
                                    name: part.functionCall.name,
                                    args: part.functionCall.args,
                                    result,
                                });
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                contents.push({
                                    role: "model",
                                    parts: [
                                        {
                                            functionCall: {
                                                name: part.functionCall.name,
                                                args: part.functionCall.args,
                                            },
                                        } as any,
                                    ],
                                });
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                contents.push({
                                    role: "user",
                                    parts: [
                                        {
                                            functionResponse: {
                                                name: part.functionCall.name,
                                                response: { result },
                                            },
                                        } as any,
                                    ],
                                });
                                state.current = State.START;
                            }
                            hasToolCall = true;
                            break;
                        }
                    }

                    if (hasToolCall) continue;

                    // No tool call — stream final text
                    // Reset state to START so parseSSEStream starts fresh
                    state.current = State.START;

                    // Only inject prompt if tools were actually called
                    if (toolCalls.length > 0) {
                        contents.push({
                            role: "user",
                            parts: [
                                {
                                    text: "Based on the tool results above, provide your final answer directly. Do not call any more tools.",
                                },
                            ],
                        });
                    }

                    const { response: streamResp } = await streamWithFallback(
                        env.GEMINI_API_KEY,
                        modelPool,
                        contents,
                        { ...options, model: defaultModel },
                        undefined,
                        SYSTEM_PROMPT,
                        undefined,
                    );

                    if (!streamResp.ok)
                        throw new Error(
                            `Stream error ${streamResp.status}: ${await streamResp.text()}`,
                        );

                    const finalText = await parseSSEStream(
                        streamResp,
                        state,
                        controller,
                    );

                    const hitIterationLimit = iteration >= MAX_TOOL_CALLS - 1;
                    emitEvent(
                        controller,
                        "end_process",
                        `done, hitIterationLimit: ${hitIterationLimit}, toolCalls: ${toolCalls.length}`,
                    );

                    if (finalText) {
                        messages.push({
                            role: "model",
                            parts: [{ text: finalText }],
                        });
                        await env.SESSION_KV.put(
                            session_id,
                            JSON.stringify({
                                messages: trimHistory(messages),
                                version: version + 1,
                            }),
                            { expirationTtl: SESSION_TTL },
                        );
                    }

                    controller.close();
                    return;
                }

                // Hit iteration limit
                emitStateEnd(controller, state.current);
                messages.push({
                    role: "user",
                    parts: [
                        {
                            text: "Please provide your answer based on the tool results gathered so far. Do not call any more tools.",
                        },
                    ],
                });
                const { response: finalRes } = await streamWithFallback(
                    env.GEMINI_API_KEY,
                    modelPool,
                    contents,
                    options,
                    undefined,
                    SYSTEM_PROMPT,
                    undefined,
                );
                if (!finalRes.ok)
                    throw new Error(
                        `Stream error ${finalRes.status}: ${await finalRes.text()}`,
                    );

                // Reset state and parse final text via SSE
                state.current = State.START;
                const acc = { value: "" };
                await parseSSEStream(finalRes, state, controller);

                emitEvent(
                    controller,
                    "end_process",
                    `done, hitIterationLimit: true, toolCalls: ${toolCalls.length}`,
                );

                if (acc.value) {
                    messages.push({
                        role: "model",
                        parts: [{ text: acc.value }],
                    });
                    await env.SESSION_KV.put(
                        session_id,
                        JSON.stringify({
                            messages: trimHistory(messages),
                            version: version + 1,
                        }),
                        { expirationTtl: SESSION_TTL },
                    );
                }

                controller.close();
            } catch (err) {
                emitEvent(
                    controller,
                    "error",
                    err instanceof Error ? err.message : "Unknown error",
                );
                controller.close();
            }
        },
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        },
    });
}
