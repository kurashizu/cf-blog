"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/Button";

interface GuestbookFormProps {
    onSuccess?: () => void;
}

export function GuestbookForm({ onSuccess }: GuestbookFormProps) {
    const [name, setName] = useState("");
    const [content, setContent] = useState("");
    const [email, setEmail] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const honeypotRef = useRef<HTMLInputElement>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!name.trim() || name.trim().length > 100) {
            setError("Name must be 1-100 characters");
            return;
        }
        if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            setError("Valid email is required");
            return;
        }
        if (!content.trim() || content.trim().length > 2000) {
            setError("Content must be 1-2000 characters");
            return;
        }

        setLoading(true);
        try {
            const res = await fetch("/api/guestbook", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: name.trim(),
                    content: content.trim(),
                    email: email.trim(),
                    website: honeypotRef.current?.value,
                }),
            });

            const data = await res.json() as { error?: string; message?: unknown };

            if (!res.ok) {
                setError(data.error || "Failed to post message");
                return;
            }

            setName("");
            setContent("");
            setEmail("");
            onSuccess?.();
        } catch {
            setError("Network error. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-3">
            <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                placeholder="Your name *"
                required
                className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
            />
            <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Your email *"
                required
                className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
            />
            <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                maxLength={2000}
                placeholder="Leave a message... *"
                required
                rows={3}
                className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors resize-none"
            />
            {/* Honeypot */}
            <input
                ref={honeypotRef}
                type="text"
                name="website"
                tabIndex={-1}
                autoComplete="off"
                className="hidden"
            />
            {error && (
                <p className="text-xs text-red-500 bg-red-500/10 px-3 py-2 rounded-lg">{error}</p>
            )}
            <Button type="submit" disabled={loading} className="w-full">
                {loading ? "Posting..." : "Post Message"}
            </Button>
        </form>
    );
}