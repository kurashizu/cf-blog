"use client";

import { useEffect, useRef } from "react";
import { MODAL_LOCK_EVENT, isModalLocked } from "@/components/hooks/useModalLock";

interface TrailDot {
    x: number;
    y: number;
    opacity: number;
    size: number;
    vx: number;
    vy: number;
}

const MAX_DOTS = 50;

export function MouseTrail() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const dotsRef = useRef<TrailDot[]>([]);
    const accentRef = useRef("255, 107, 53");

    useEffect(() => {
        const canvas = canvasRef.current;
        const context = canvas?.getContext("2d");
        if (!canvas || !context) return;

        const parseAccent = () => {
            const value = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
            const hex = value.replace("#", "");
            if (/^[0-9a-f]{6}$/i.test(hex)) {
                accentRef.current = [0, 2, 4]
                    .map((offset) => parseInt(hex.slice(offset, offset + 2), 16))
                    .join(", ");
            }
        };
        const resize = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };

        let animationId: number | null = null;
        const cancelLoop = () => {
            if (animationId !== null) {
                cancelAnimationFrame(animationId);
                animationId = null;
            }
        };
        const schedule = () => {
            if (animationId === null && !document.hidden && !isModalLocked()) {
                animationId = requestAnimationFrame(animate);
            }
        };
        const animate = () => {
            animationId = null;
            if (document.hidden || isModalLocked()) return;

            const dots = dotsRef.current;
            context.clearRect(0, 0, canvas.width, canvas.height);
            let writeIndex = 0;
            for (const dot of dots) {
                dot.x += dot.vx;
                dot.y += dot.vy;
                dot.opacity -= 0.025;
                dot.size *= 0.97;
                if (dot.opacity <= 0) continue;

                context.beginPath();
                context.arc(dot.x, dot.y, dot.size * 2, 0, Math.PI * 2);
                context.fillStyle = `rgba(${accentRef.current}, ${dot.opacity * 0.15})`;
                context.fill();
                context.beginPath();
                context.arc(dot.x, dot.y, dot.size, 0, Math.PI * 2);
                context.fillStyle = `rgba(${accentRef.current}, ${dot.opacity * 0.6})`;
                context.fill();
                dots[writeIndex++] = dot;
            }
            dots.length = Math.min(writeIndex, MAX_DOTS);
            if (dots.length > 0) schedule();
        };
        const handleMove = (event: MouseEvent) => {
            // No dots while a modal is open — the canvas sits under the
            // modal's backdrop-blur, so every paint forces a re-blur.
            if (isModalLocked()) return;
            dotsRef.current.push({
                x: event.clientX + (Math.random() - 0.5) * 4,
                y: event.clientY + (Math.random() - 0.5) * 4,
                opacity: 1,
                size: 1.5 + Math.random() * 1.5,
                vx: (Math.random() - 0.5) * 0.5,
                vy: (Math.random() - 0.5) * 0.5,
            });
            if (dotsRef.current.length > MAX_DOTS) dotsRef.current.splice(0, dotsRef.current.length - MAX_DOTS);
            schedule();
        };
        const handleVisibility = () => (document.hidden ? cancelLoop() : schedule());
        const handleModalLock = () => {
            if (isModalLocked()) {
                cancelLoop();
                // Drop the fading dots and clear the canvas so no stale
                // frame lingers under the modal.
                dotsRef.current.length = 0;
                context.clearRect(0, 0, canvas.width, canvas.height);
            }
        };

        parseAccent();
        resize();
        window.addEventListener("resize", resize);
        window.addEventListener("mousemove", handleMove, { passive: true });
        window.addEventListener("themechange", parseAccent);
        window.addEventListener(MODAL_LOCK_EVENT, handleModalLock);
        document.addEventListener("visibilitychange", handleVisibility);

        return () => {
            cancelLoop();
            window.removeEventListener("resize", resize);
            window.removeEventListener("mousemove", handleMove);
            window.removeEventListener("themechange", parseAccent);
            window.removeEventListener(MODAL_LOCK_EVENT, handleModalLock);
            document.removeEventListener("visibilitychange", handleVisibility);
        };
    }, []);

    // z-[90]: above page content, below every modal (all at z-[100]) so the
    // trail never paints over modal content.
    return <canvas ref={canvasRef} aria-hidden="true" className="fixed inset-0 pointer-events-none z-[90]" />;
}
