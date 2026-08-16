"use client";

import { useEffect, useRef } from "react";

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
            if (animationId === null && !document.hidden) {
                animationId = requestAnimationFrame(animate);
            }
        };
        const animate = () => {
            animationId = null;
            if (document.hidden) return;

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

        parseAccent();
        resize();
        window.addEventListener("resize", resize);
        window.addEventListener("mousemove", handleMove, { passive: true });
        window.addEventListener("themechange", parseAccent);
        document.addEventListener("visibilitychange", handleVisibility);

        return () => {
            cancelLoop();
            window.removeEventListener("resize", resize);
            window.removeEventListener("mousemove", handleMove);
            window.removeEventListener("themechange", parseAccent);
            document.removeEventListener("visibilitychange", handleVisibility);
        };
    }, []);

    return <canvas ref={canvasRef} aria-hidden="true" className="fixed inset-0 pointer-events-none z-[100]" />;
}
