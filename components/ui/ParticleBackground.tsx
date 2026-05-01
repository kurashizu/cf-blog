"use client";

import { useEffect, useRef } from "react";

const GROUPS = ["ku", "ra", "shi", "zu"];
const FONT_SIZE = 18;
const OPACITY_MIN = 0.08;
const OPACITY_MAX = 0.16;
const SPEED_MIN = 0.5;
const SPEED_MAX = 1.2;

interface Particle {
  x: number;
  y: number;
  text: string;
  speed: number;
  opacity: number;
  opacityDir: number;
  phase: number;
}

export function ParticleBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const accentColorRef = useRef("255, 107, 53");

  useEffect(() => {
    const updateAccentColor = () => {
      const style = getComputedStyle(document.documentElement);
      const accent = style.getPropertyValue("--accent").trim();
      if (accent.includes("#ff6b35")) {
        accentColorRef.current = "255, 107, 53";
      } else if (accent.includes("#4a9eff")) {
        accentColorRef.current = "74, 158, 255";
      }
    };

    updateAccentColor();
    window.addEventListener("themechange", updateAccentColor);
    return () => window.removeEventListener("themechange", updateAccentColor);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;
    const particles: Particle[] = [];

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    const createParticle = (x?: number, y?: number): Particle => ({
      x: x ?? Math.random() * canvas.width,
      y: y ?? -FONT_SIZE,
      text: GROUPS[Math.floor(Math.random() * GROUPS.length)],
      speed: SPEED_MIN + Math.random() * (SPEED_MAX - SPEED_MIN),
      opacity: OPACITY_MIN + Math.random() * (OPACITY_MAX - OPACITY_MIN),
      opacityDir: Math.random() > 0.5 ? 1 : -1,
      phase: Math.random() * Math.PI * 2,
    });

    const initParticles = () => {
      particles.length = 0;
      const cols = Math.ceil(canvas.width / (FONT_SIZE * 5));
      for (let i = 0; i < cols; i++) {
        const p = createParticle(
          i * (FONT_SIZE * 5) + Math.random() * FONT_SIZE * 2,
          -FONT_SIZE * (5 + Math.random() * 40)
        );
        particles.push(p);
      }
    };

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = "rgba(8, 8, 12, 0.93)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const accent = accentColorRef.current;

      for (const p of particles) {
        p.y += p.speed;
        p.opacity += p.opacityDir * 0.0006;
        p.phase += 0.02;

        if (p.opacity <= OPACITY_MIN) {
          p.opacity = OPACITY_MIN;
          p.opacityDir = 1;
        } else if (p.opacity >= OPACITY_MAX) {
          p.opacity = OPACITY_MAX;
          p.opacityDir = -1;
        }

        if (p.y > canvas.height + FONT_SIZE * 2) {
          p.y = -FONT_SIZE * 2;
          p.x = Math.random() * canvas.width;
        }

        const wobble = Math.sin(p.phase) * 2;
        ctx.font = `${FONT_SIZE}px monospace`;
        ctx.fillStyle = `rgba(${accent}, ${p.opacity})`;
        ctx.fillText(p.text, p.x + wobble, p.y);
      }

      animationId = requestAnimationFrame(draw);
    };

    resize();
    initParticles();
    draw();

    const handleResize = () => {
      resize();
      initParticles();
    };

    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 w-full h-full pointer-events-none -z-10"
      style={{ opacity: 1 }}
    />
  );
}