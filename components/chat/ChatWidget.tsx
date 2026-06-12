"use client";

import Image from "next/image";
import { useState, useRef, useEffect } from "react";
import icon2Hover from "@/public/icons/icon2_128.png";
import icon3Hover from "@/public/icons/icon3_128.png";

interface Message {
    role: "user" | "model";
    parts: { text: string }[];
}

export function ChatWidget() {
    const [isOpen, setIsOpen] = useState(false);
    const [closing, setClosing] = useState(false);
    const [isHovered, setIsHovered] = useState(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const sendMessage = async () => {
        if (!input.trim() || isLoading) return;

        const userMessage: Message = { role: "user", parts: [{ text: input }] };
        setMessages((prev) => [...prev, userMessage]);
        setInput("");
        setIsLoading(true);

        try {
            const response = await fetch("/api/llm", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    messages: [...messages, userMessage],
                    stream: true,
                }),
            });

            if (!response.ok) throw new Error("Failed to get response");

            const reader = response.body?.getReader();
            if (!reader) throw new Error("No response body");

            const decoder = new TextDecoder();
            let fullText = "";
            let buffer = "";

            const modelMessage: Message = {
                role: "model",
                parts: [{ text: "" }],
            };
            setMessages((prev) => [...prev, modelMessage]);

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() ?? "";

                for (const line of lines) {
                    if (!line.startsWith("data: ")) continue;
                    try {
                        const data = JSON.parse(line.slice(6));
                        if (typeof data.text === "string") {
                            fullText += data.text;
                        }
                    } catch {
                        // Skip malformed SSE lines
                    }
                }

                setMessages((prev) => {
                    const updated = [...prev];
                    updated[updated.length - 1] = {
                        role: "model",
                        parts: [{ text: fullText }],
                    };
                    return updated;
                });
            }
        } catch (error) {
            setMessages((prev) => [
                ...prev,
                {
                    role: "model",
                    parts: [{ text: "Sorry, something went wrong." }],
                },
            ]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleClose = () => {
        setClosing(true);
        setTimeout(() => {
            setIsOpen(false);
            setClosing(false);
        }, 200);
    };

    const toggleOpen = () => {
        if (isOpen) {
            handleClose();
        } else {
            setIsOpen(true);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    return (
        <>
            {/* Floating button */}
            <button
                onClick={toggleOpen}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
                className="fixed bottom-6 right-6 w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-110 z-50 overflow-hidden"
                style={{ padding: 0 }}
                aria-label="Chat with AI"
            >
                {isOpen ? (
                    <div className="w-full h-full bg-bg-card flex items-center justify-center">
                        <svg
                            className="w-6 h-6 text-accent"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M6 18L18 6M6 6l12 12"
                            />
                        </svg>
                    </div>
                ) : (
                    <Image
                        src={isHovered ? icon2Hover : icon3Hover}
                        alt="Chat"
                        width={56}
                        height={56}
                        className="object-cover transition-opacity duration-200"
                    />
                )}
            </button>

            {/* Chat panel */}
            {(isOpen || closing) && (
                <div className={`fixed bottom-24 right-6 w-80 sm:w-96 h-[28rem] bg-bg-card border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden z-50 ${closing ? 'animate-slideDown' : 'animate-slideUp'}`}>
                    {/* Header */}
                    <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-bg-secondary">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-accent/20 rounded-full flex items-center justify-center">
                                <svg
                                    className="w-4 h-4 text-accent"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                                    />
                                </svg>
                            </div>
                            <div>
                                <h3 className="text-sm font-semibold text-text-primary">
                                    Kurashizu AI
                                </h3>
                                <p className="text-xs text-text-muted">
                                    Powered by Google
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={handleClose}
                            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-bg-elevated transition-colors"
                        >
                            <svg
                                className="w-5 h-5 text-text-muted"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M6 18L18 6M6 6l12 12"
                                />
                            </svg>
                        </button>
                    </div>

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                        {messages.length === 0 && (
                            <div className="text-center py-8">
                                <div className="w-12 h-12 bg-accent/10 rounded-full flex items-center justify-center mx-auto mb-3">
                                    <svg
                                        className="w-6 h-6 text-accent"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                                        />
                                    </svg>
                                </div>
                                <p className="text-sm text-text-secondary">
                                    Ask me anything!
                                </p>
                                <p className="text-xs text-text-muted mt-1">
                                    I know about kurashizu&rsquo;s projects and
                                    interests
                                </p>
                            </div>
                        )}

                        {messages.map((message, index) => (
                            <div
                                key={index}
                                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                            >
                                <div
                                    className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
                                        message.role === "user"
                                            ? "bg-accent text-white rounded-br-md"
                                            : "bg-bg-secondary text-text-secondary rounded-bl-md"
                                    }`}
                                >
                                    {message.parts[0].text ||
                                        (isLoading &&
                                        index === messages.length - 1
                                            ? "..."
                                            : "")}
                                </div>
                            </div>
                        ))}

                        {isLoading &&
                            messages[messages.length - 1]?.role !== "model" && (
                                <div className="flex justify-start">
                                    <div className="bg-bg-secondary text-text-secondary rounded-2xl rounded-bl-md px-4 py-2.5">
                                        <div className="flex gap-1">
                                            <span
                                                className="w-2 h-2 bg-accent rounded-full animate-bounce"
                                                style={{
                                                    animationDelay: "0ms",
                                                }}
                                            />
                                            <span
                                                className="w-2 h-2 bg-accent rounded-full animate-bounce"
                                                style={{
                                                    animationDelay: "150ms",
                                                }}
                                            />
                                            <span
                                                className="w-2 h-2 bg-accent rounded-full animate-bounce"
                                                style={{
                                                    animationDelay: "300ms",
                                                }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}

                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input */}
                    <div className="p-4 border-t border-border bg-bg-secondary">
                        <div className="flex items-center gap-2">
                            <textarea
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Type a message..."
                                className="flex-1 bg-bg-primary border border-border rounded-xl px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted resize-none focus:outline-none focus:border-accent transition-colors"
                                rows={1}
                            />
                            <button
                                onClick={sendMessage}
                                disabled={!input.trim() || isLoading}
                                className="w-10 h-10 bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed rounded-xl flex items-center justify-center transition-all"
                            >
                                <svg
                                    className="w-5 h-5 text-white"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                                    />
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
