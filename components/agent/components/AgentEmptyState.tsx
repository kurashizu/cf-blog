"use client";

/** Shown inside the chat scroll area when no messages exist yet. */
export function AgentEmptyState() {
    return (
        <div className="flex flex-col items-center justify-center h-full text-center gap-3">
            <div className="w-12 h-12 bg-accent/10 rounded-2xl flex items-center justify-center">
                <svg
                    className="w-6 h-6 text-accent"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                    />
                </svg>
            </div>
            <div>
                <p className="text-sm font-medium text-text-primary">
                    KurAgent ready
                </p>
                <p className="text-xs text-text-muted mt-1 max-w-[240px]">
                    Try asking about time, web content, or calculations
                </p>
            </div>
        </div>
    );
}
