"use client";

/**
 * Visual frame around the canvas that JSNES injects into `containerRef`.
 * Does not own the Browser lifecycle — that's NESPanel's job. This component
 * is purely presentational: it draws the screen bezel, the loading overlay,
 * and the empty state.
 */
import { forwardRef } from "react";
import type { LoadStatus } from "./types";

interface NESBrowserProps {
    status: LoadStatus;
    currentRomTitle?: string;
}

export const NESBrowser = forwardRef<HTMLDivElement, NESBrowserProps>(
    function NESBrowser({ status, currentRomTitle }, ref) {
        return (
            <div className="nes-screen">
                <div
                    ref={ref}
                    className="nes-screen-canvas"
                    aria-label="NES screen"
                />
                {status.kind === "loading" && (
                    <div className="nes-loading">Loading ROM…</div>
                )}
                {status.kind === "error" && (
                    <div className="nes-loading nes-loading-error">
                        {status.message}
                    </div>
                )}
                {status.kind === "ready" && currentRomTitle && (
                    <div className="nes-screen-title" title={currentRomTitle}>
                        {currentRomTitle}
                    </div>
                )}
            </div>
        );
    },
);
