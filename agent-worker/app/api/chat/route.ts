import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { checkBurst, checkDailyKV, getIP } from "@/lib/ratelimiter";
import {
    streamWithFallback,
    getModelPool,
    getDefaultModel,
} from "@/lib/model-pool";
import { executeTool, FUNCTION_DECLARATIONS } from "@/lib/tools";
import type { AgentEnv } from "../../../../lib/types/env";

const SYSTEM_PROMPT = `You are KurAgent, an AI assistant powered by kurashizu, running on Cloudflare.

Identity:
- You are KurAgent
- Created by kurashizu (GitHub: https://github.com/kurashizu)

Guidelines:
- Be helpful, technical, and concise
- Use tools when needed to answer questions accurately
- When calling tools, provide clear context in your thought process
- If a tool fails, try alternative approaches or acknowledge the limitation
- Respond directly to the user. Do NOT describe or echo the user's input back to them.
- You may use markdown formatting when it helps clarity

Tool Commands:
- When a user message starts with @tool-name (e.g., "@get_time Europe/Berlin"), immediately execute that tool with the provided arguments and return the result.
- Parse the tool name after @ and any arguments provided.`;

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

/** Result from parsing an SSE stream. */
interface StreamParseResult {
    text: string;
    functionCall?: { name: string; args: Record<string, unknown> };
}

async function parseSSEStream(
    response: Response,
    state: { current: State },
    controller: ReadableStreamDefaultController,
): Promise<StreamParseResult> {
    const body = response.body;
    if (!body) throw new Error("No response body");

    const reader = body.getReader();
    const decoder = new TextDecoder();
    let lineBuffer = "";
    const acc = { value: "" };
    let functionCall:
        | { name: string; args: Record<string, unknown> }
        | undefined;

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

                const candidates = json.candidates?.[0]?.content?.parts;
                if (Array.isArray(candidates)) {
                    for (const part of candidates) {
                        // Function call → capture and stop streaming text
                        if (part.functionCall) {
                            functionCall = {
                                name: part.functionCall.name,
                                args: part.functionCall.args ?? {},
                            };
                            break;
                        }

                        // Thought / text blocks
                        if (part.thought === true && part.text !== undefined) {
                            handlePart(
                                { thought: true, text: part.text },
                                state,
                                controller,
                                acc,
                            );
                        } else if (part.text !== undefined && !functionCall) {
                            handlePart(
                                { text: part.text },
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

    return { text: acc.value, functionCall };
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
        const ctx = getCloudflareContext();
        const env = ctx.env as unknown as AgentEnv;

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
                    // Single streaming call with function declarations
                    const { response: streamResp } = await streamWithFallback(
                        env.GEMINI_API_KEY,
                        modelPool,
                        contents,
                        { ...options, model: defaultModel },
                        undefined,
                        SYSTEM_PROMPT,
                        [{ functionDeclarations: FUNCTION_DECLARATIONS }],
                    );

                    if (!streamResp.ok)
                        throw new Error(
                            `Stream error ${streamResp.status}: ${await streamResp.text()}`,
                        );

                    state.current = State.START;
                    const result = await parseSSEStream(
                        streamResp,
                        state,
                        controller,
                    );

                    // Tool call → execute, push to history, loop
                    if (result.functionCall) {
                        const fc = result.functionCall;
                        emitStateEnd(controller, state.current);
                        controller.enqueue(
                            new TextEncoder().encode(
                                `data: ${JSON.stringify({
                                    type: "tool_start",
                                    tool: fc.name,
                                    args: fc.args,
                                    iteration: iteration + 1,
                                })}\n\n`,
                            ),
                        );

                        const toolResult = await executeTool(fc.name, fc.args);

                        controller.enqueue(
                            new TextEncoder().encode(
                                `data: ${JSON.stringify({
                                    type: "tool_result",
                                    tool: fc.name,
                                    result: toolResult,
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
                            name: fc.name,
                            args: fc.args,
                            result: toolResult,
                        });

                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        contents.push({
                            role: "model",
                            parts: [
                                {
                                    functionCall: {
                                        name: fc.name,
                                        args: fc.args,
                                    },
                                },
                            ] as any,
                        });
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        contents.push({
                            role: "user",
                            parts: [
                                {
                                    functionResponse: {
                                        name: fc.name,
                                        response: { result: toolResult },
                                    },
                                },
                            ] as any,
                        });

                        continue;
                    }

                    // No tool call → final text answer
                    const finalText = result.text;
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

                // Hit iteration limit — no more calls, just close
                emitEvent(
                    controller,
                    "end_process",
                    `done, hitIterationLimit: true, toolCalls: ${toolCalls.length}`,
                );
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
