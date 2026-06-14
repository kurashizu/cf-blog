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

export function MouseTrail() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const dotsRef = useRef<TrailDot[]>([]);
    const accentRef = useRef("255, 107, 53");

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d")!;

        const parseAccent = () => {
            const c = getComputedStyle(document.documentElement)
                .getPropertyValue("--accent")
                .trim();
            if (c.startsWith("#")) {
                const hex = c.slice(1);
                const r = parseInt(hex.slice(0, 2), 16);
                const g = parseInt(hex.slice(2, 4), 16);
                const b = parseInt(hex.slice(4, 6), 16);
                accentRef.current = `${r}, ${g}, ${b}`;
            }
        };
        parseAccent();

        const resize = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };
        resize();
        window.addEventListener("resize", resize);

        const onMove = (e: MouseEvent) => {
            dotsRef.current.push({
                x: e.clientX + (Math.random() - 0.5) * 4,
                y: e.clientY + (Math.random() - 0.5) * 4,
                opacity: 1,
                size: 1.5 + Math.random() * 1.5,
                vx: (Math.random() - 0.5) * 0.5,
                vy: (Math.random() - 0.5) * 0.5,
            });
        };
        window.addEventListener("mousemove", onMove);

        const onThemeChange = () => parseAccent();
        window.addEventListener("themechange", onThemeChange);

        const MAX_DOTS = 50;

        let animId: number;
        const animate = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            const dots = dotsRef.current;
            const rgb = accentRef.current;

            // Update + draw + compact in a single pass
            let writeIdx = 0;
            for (let i = 0; i < dots.length; i++) {
                const dot = dots[i];
                dot.x += dot.vx;
                dot.y += dot.vy;
                dot.opacity -= 0.025;
                dot.size *= 0.97;

                if (dot.opacity <= 0) continue;

                const { x, y, opacity, size } = dot;

                // Glow layer (larger, faint) — replaces shadowBlur
                ctx.beginPath();
                ctx.arc(x, y, size * 2, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(${rgb}, ${opacity * 0.15})`;
                ctx.fill();

                // Core layer (smaller, opaque)
                ctx.beginPath();
                ctx.arc(x, y, size, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(${rgb}, ${opacity * 0.6})`;
                ctx.fill();

                // Keep this dot (compact in-place)
                dots[writeIdx++] = dot;
            }

            // Trim to max and drop dead dots
            dots.length = Math.min(writeIdx, MAX_DOTS);

            animId = requestAnimationFrame(animate);
        };
        animId = requestAnimationFrame(animate);

        return () => {
            window.removeEventListener("resize", resize);
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("themechange", onThemeChange);
            cancelAnimationFrame(animId);
        };
    }, []);

    return (
        <canvas
            ref={canvasRef}
            className="fixed inset-0 pointer-events-none z-[100]"
        />
    );
}
