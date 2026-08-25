"use client";

import { useEffect, useRef } from "react";
import { MODAL_LOCK_EVENT, isModalLocked } from "@/components/hooks/useModalLock";

const GROUPS = ["ku", "ra", "shi", "zu"] as const;
const FONTS = ["monospace", "serif", "sans-serif", "cursive", "fantasy"] as const;
const FRAME_MS = 33; // ~30 FPS is enough for ambient background motion.
const MAX_PARTICLES = 80;
const FONT_SIZE_MIN = 16;
const FONT_SIZE_RANGE = 12;
const OPACITY_MIN = 0.18;
const OPACITY_MAX = 0.48;
const SPEED_MIN = 0.2;
const SPEED_RANGE = 1.3;
const SIDE_DRIFT_MIN = 0.25;
const SIDE_DRIFT_RANGE = 0.45;
const COLOR_SHIFT = 22;

type SpawnEdge = "top" | "left" | "right";
type Rgb = [number, number, number];

interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    text: string;
    color: string;
    opacity: number;
    opacityDirection: 1 | -1;
    phase: number;
    rotation: number;
    font: string;
}

function parseHex(value: string, fallback: Rgb): Rgb {
    const hex = value.replace("#", "").trim();
    if (!/^[0-9a-f]{6}$/i.test(hex)) return fallback;
    return [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16),
    ];
}

function rgba([r, g, b]: Rgb, alpha: number): string {
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function ParticleBackground() {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        const context = canvas?.getContext("2d", { alpha: false });
        if (!canvas || !context) return;

        let accent: Rgb = [184, 149, 106];
        let background: Rgb = [26, 23, 20];
        let timer: ReturnType<typeof setInterval> | null = null;
        const particles: Particle[] = [];
        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

        const updateColors = () => {
            const styles = getComputedStyle(document.documentElement);
            const accentValue = styles.getPropertyValue("--accent-hover").trim() || styles.getPropertyValue("--accent").trim();
            const backgroundValue = styles.getPropertyValue("--bg-primary").trim();
            accent = parseHex(accentValue, accent);
            background = parseHex(backgroundValue, background);
        };

        const chooseEdge = (): SpawnEdge => {
            const value = Math.random();
            return value < 0.55 ? "top" : value < 0.775 ? "left" : "right";
        };

        const resetParticle = (particle: Particle, edge: SpawnEdge = chooseEdge()) => {
            const fontSize = FONT_SIZE_MIN + Math.random() * FONT_SIZE_RANGE;
            particle.text = GROUPS[Math.floor(Math.random() * GROUPS.length)];
            particle.font = `${fontSize}px ${FONTS[Math.floor(Math.random() * FONTS.length)]}`;
            particle.vy = SPEED_MIN + Math.random() * SPEED_RANGE;
            particle.vx = 0;
            particle.rotation = (-30 + Math.random() * 60) * (Math.PI / 180);
            particle.opacity = OPACITY_MIN + Math.random() * (OPACITY_MAX - OPACITY_MIN);
            particle.opacityDirection = Math.random() > 0.5 ? 1 : -1;
            particle.phase = Math.random() * Math.PI * 2;

            const size = fontSize;
            if (edge === "top") {
                particle.x = Math.random() * canvas.width;
                particle.y = -size * (5 + Math.random() * 40);
            } else if (edge === "left") {
                particle.x = -size * (2 + Math.random() * 4);
                particle.y = -size * 2 + Math.random() * (canvas.height + size * 4);
                particle.vx = SIDE_DRIFT_MIN + Math.random() * SIDE_DRIFT_RANGE;
            } else {
                particle.x = canvas.width + size * (2 + Math.random() * 4);
                particle.y = -size * 2 + Math.random() * (canvas.height + size * 4);
                particle.vx = -(SIDE_DRIFT_MIN + Math.random() * SIDE_DRIFT_RANGE);
            }

            const color: Rgb = accent.map((channel) =>
                Math.max(0, Math.min(255, channel + (Math.random() - 0.5) * COLOR_SHIFT * 2)),
            ) as Rgb;
            particle.color = `rgb(${color.join(",")})`;
        };

        const createParticle = (): Particle => {
            const particle = {
                x: 0,
                y: 0,
                vx: 0,
                vy: 0,
                text: "",
                color: "",
                opacity: 0,
                opacityDirection: 1 as const,
                phase: 0,
                rotation: 0,
                font: "16px monospace",
            } satisfies Particle;
            resetParticle(particle);
            return particle;
        };

        const resize = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            particles.length = 0;
            const averageFontSize = FONT_SIZE_MIN + FONT_SIZE_RANGE / 2;
            const count = Math.min(
                MAX_PARTICLES,
                Math.ceil(canvas.width / (averageFontSize * 2.4)),
            );
            for (let i = 0; i < count; i++) particles.push(createParticle());
        };

        const draw = () => {
            context.fillStyle = rgba(background, 0.92);
            context.fillRect(0, 0, canvas.width, canvas.height);

            for (const particle of particles) {
                particle.x += particle.vx;
                particle.y += particle.vy;
                particle.phase += 0.02;
                particle.opacity += particle.opacityDirection * 0.0006;

                if (particle.opacity <= OPACITY_MIN) {
                    particle.opacity = OPACITY_MIN;
                    particle.opacityDirection = 1;
                } else if (particle.opacity >= OPACITY_MAX) {
                    particle.opacity = OPACITY_MAX;
                    particle.opacityDirection = -1;
                }

                if (
                    particle.y > canvas.height + 32 ||
                    particle.x < -64 ||
                    particle.x > canvas.width + 64
                ) {
                    resetParticle(particle);
                    continue;
                }

                context.save();
                context.globalAlpha = particle.opacity;
                context.translate(particle.x + Math.sin(particle.phase) * 3, particle.y);
                context.rotate(particle.rotation);
                context.font = particle.font;
                context.fillStyle = particle.color;
                context.fillText(particle.text, 0, 0);
                context.restore();
            }
        };

        const start = () => {
            if (
                timer === null &&
                !document.hidden &&
                !reducedMotion.matches &&
                !isModalLocked()
            )
                timer = setInterval(draw, FRAME_MS);
        };
        const stop = () => {
            if (timer !== null) {
                clearInterval(timer);
                timer = null;
            }
        };
        const handleVisibility = () => (document.hidden ? stop() : start());
        // Pause while any full-screen modal is open: repainting under the
        // modal's backdrop-blur re-blurs every frame and steals frame time
        // from foreground work (worst case: the NES emulator).
        const handleModalLock = () => (isModalLocked() ? stop() : start());
        // React to the OS setting changing mid-session, not just at mount.
        const handleReducedMotion = () =>
            reducedMotion.matches ? stop() : start();
        const handleResize = () => {
            resize();
            draw();
        };

        updateColors();
        resize();
        draw();
        start();
        window.addEventListener("resize", handleResize);
        window.addEventListener("themechange", updateColors);
        window.addEventListener(MODAL_LOCK_EVENT, handleModalLock);
        document.addEventListener("visibilitychange", handleVisibility);
        reducedMotion.addEventListener("change", handleReducedMotion);

        return () => {
            stop();
            window.removeEventListener("resize", handleResize);
            window.removeEventListener("themechange", updateColors);
            window.removeEventListener(MODAL_LOCK_EVENT, handleModalLock);
            document.removeEventListener("visibilitychange", handleVisibility);
            reducedMotion.removeEventListener("change", handleReducedMotion);
        };
    }, []);

    return <canvas ref={canvasRef} aria-hidden="true" className="fixed inset-0 w-full h-full pointer-events-none -z-10" />;
}
