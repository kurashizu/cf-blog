"use client";

import { useState } from "react";
import { GuestbookForm } from "./GuestbookForm";
import { Button } from "@/components/ui/Button";

export function GuestbookWidget() {
    const [isOpen, setIsOpen] = useState(false);
    const [closing, setClosing] = useState(false);

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

    return (
        <>
            {/* Floating button */}
            <button
                onClick={toggleOpen}
                className="fixed bottom-6 left-6 w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-110 z-50 overflow-hidden"
                style={{ padding: 0 }}
                aria-label="Leave a message"
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
                    <div className="w-full h-full bg-bg-card border border-border flex items-center justify-center">
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
                )}
            </button>

            {/* Form panel */}
            {(isOpen || closing) && (
                <div className={`fixed bottom-24 left-6 w-80 sm:w-96 bg-bg-card border border-border rounded-2xl shadow-2xl overflow-hidden z-50 ${closing ? 'animate-slideDown' : 'animate-slideUp'}`}>
                    <div className="p-4 border-b border-border bg-bg-secondary">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-text-primary">
                                Leave a Message
                            </h3>
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
                    </div>
                    <div className="p-4">
                        <GuestbookForm onSuccess={() => setIsOpen(false)} />
                    </div>
                </div>
            )}
        </>
    );
}