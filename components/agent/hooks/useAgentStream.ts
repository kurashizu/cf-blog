/**
 * useAgentStream — sends a message to /api/chat and updates a streamed
 * response into a `Message` slot, one event at a time.
 *
 * Returns the streaming callbacks and the active streaming model-id (so the
 * UI can mark the right message as "thinking").
 *
 * SSE event types are documented in `types.ts`. This hook is the only place
 * that needs to know the wire format — components consume `Message`/`ToolStep`
 * shapes.
 */
"use client";

import { useCallback, useRef, useState } from "react";
import { AGENT_API } from "../config";
import type { Message, StreamEvent, ToolStep } from "../types";

interface UseAgentStreamOptions {
    /** Read the current messages snapshot — used to append + update in place. */
    getMessages: () => Message[];
    setMessages: (updater: (prev: Message[]) => Message[]) => void;
    /** Set the loading flag in the parent component. */
    setIsLoading: (loading: boolean) => void;
    /** Callback invoked once per finished response with the user input —
     *  used to set the conversation title on first message. */
    onFirstMessage?: (userInput: string) => void;
}

export function useAgentStream({
    getMessages,
    setMessages,
    setIsLoading,
    onFirstMessage,
}: UseAgentStreamOptions) {
    const [streamingMessageId, setStreamingMessageId] = useState<string>("");
    const isFirstResponseRef = useRef<boolean>(false);

    const genId = useCallback((): string => {
        // SSR-safe: crypto is available everywhere we run this hook.
        return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }, []);

    const send = useCallback(
        async (input: string, sessionId: string) => {
            if (!input.trim() || !sessionId) return;

            // First-message title generation
            if (!isFirstResponseRef.current) {
                isFirstResponseRef.current = true;
                onFirstMessage?.(input);
            }

            const userMessage: Message = {
                id: genId(),
                role: "user",
                parts: [{ text: input }],
            };
            const modelId = genId();
            setStreamingMessageId(modelId);
            setMessages((prev) => [
                ...prev,
                userMessage,
                {
                    id: modelId,
                    role: "model",
                    parts: [{ text: "" }],
                    toolSteps: [],
                },
            ]);
            setIsLoading(true);

            const updateModel = (updates: Partial<Message>) => {
                setMessages((prev) =>
                    prev.map((m) =>
                        m.id === modelId ? { ...m, ...updates } : m,
                    ),
                );
            };

            try {
                const response = await fetch(AGENT_API, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        session_id: sessionId,
                        message: input,
                        options: { stream: true },
                    }),
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                const reader = response.body?.getReader();
                if (!reader) throw new Error("No response body");

                let fullText = "";
                let fullThink = "";
                let toolSteps: ToolStep[] = [];
                let currentError: string | undefined;

                const applyEvent = (event: StreamEvent) => {
                    switch (event.type) {
                        case "start_think":
                            fullThink = event.content || "";
                            fullText = "";
                            updateModel({
                                thinkContent: fullThink,
                                isThinking: true,
                                parts: [{ text: "" }],
                            });
                            break;
                        case "think":
                            fullThink += event.content || "";
                            updateModel({ thinkContent: fullThink });
                            break;
                        case "end_think":
                            updateModel({ isThinking: false });
                            break;
                        case "start_text":
                            fullText = event.content || "";
                            updateModel({
                                parts: [{ text: fullText }],
                                isThinking: false,
                            });
                            break;
                        case "text":
                            fullText += event.content || "";
                            updateModel({
                                parts: [{ text: fullText }],
                                isThinking: false,
                            });
                            break;
                        case "end_text":
                            break;
                        case "start_tool":
                        case "tool_start": {
                            const step: ToolStep = {
                                tool: event.tool,
                                args: event.args || {},
                                status: "in_progress",
                                iteration: event.iteration ?? 0,
                            };
                            toolSteps = [...toolSteps, step];
                            updateModel({ toolSteps });
                            break;
                        }
                        case "tool_result": {
                            const idx = toolSteps.findIndex(
                                (s) => s.status === "in_progress",
                            );
                            if (idx !== -1) {
                                toolSteps = toolSteps.map((s, i) =>
                                    i === idx
                                        ? {
                                              ...s,
                                              status:
                                                  event.success !== false
                                                      ? "completed"
                                                      : "error",
                                              result: event.result,
                                          }
                                        : s,
                                );
                            }
                            updateModel({ toolSteps });
                            break;
                        }
                        case "end_tool": {
                            toolSteps = toolSteps.map((s) =>
                                s.status === "in_progress"
                                    ? { ...s, status: "completed" as const }
                                    : s,
                            );
                            updateModel({ toolSteps });
                            break;
                        }
                        case "end_process":
                        case "done":
                            setIsLoading(false);
                            if (toolSteps.some((s) => s.status === "in_progress")) {
                                toolSteps = toolSteps.map((s) =>
                                    s.status === "in_progress"
                                        ? { ...s, status: "completed" as const }
                                        : s,
                                );
                                updateModel({ toolSteps });
                            }
                            break;
                        case "error":
                            currentError =
                                event.content ||
                                event.message ||
                                "Unknown error";
                            updateModel({ error: currentError });
                            setIsLoading(false);
                            break;
                    }
                };

                const decoder = new TextDecoder();
                let buffer = "";
                // read() loop
                // eslint-disable-next-line no-constant-condition
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split("\n");
                    buffer = lines.pop() ?? "";

                    for (const line of lines) {
                        if (!line.startsWith("data: ")) continue;
                        try {
                            const data = JSON.parse(line.slice(6)) as StreamEvent;
                            applyEvent(data);
                        } catch {
                            /* skip malformed lines */
                        }
                    }
                }

                // Empty-response fallback: keep the placeholder we created.
                if (!getMessages().find((m) => m.id === modelId)) {
                    setMessages((prev) => [
                        ...prev,
                        {
                            id: modelId,
                            role: "model",
                            parts: [
                                { text: fullText || "No response received." },
                            ],
                            toolSteps: toolSteps.length ? toolSteps : undefined,
                            thinkContent: fullThink || undefined,
                            isThinking: false,
                            error: currentError,
                        },
                    ]);
                }
            } catch (err) {
                const message =
                    err instanceof Error ? err.message : "Network error";
                updateModel({
                    parts: [{ text: "Sorry, something went wrong." }],
                    error: message,
                });
            } finally {
                setIsLoading(false);
                setStreamingMessageId("");
            }
        },
        [genId, getMessages, setMessages, setIsLoading, onFirstMessage],
    );

    return { send, streamingMessageId, resetFirstFlag: () => (isFirstResponseRef.current = false) };
}
