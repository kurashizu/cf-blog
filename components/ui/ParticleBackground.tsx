"use client";

import { useEffect, useRef } from "react";

const GROUPS = ["ku", "ra", "shi", "zu"];
const FONT_SIZE = 20;
const OPACITY_MIN = 0.1;
const OPACITY_MAX = 0.18;
const SPEED_MIN = 0.4;
const SPEED_MAX = 1.0;

interface Particle {
  x: number;
  y: number;
  text: string;
  speed: number;
  opacity: number;
  opacityDir: number;
}

export function ParticleBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

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
    });

    const initParticles = () => {
      particles.length = 0;
      const cols = Math.ceil(canvas.width / (FONT_SIZE * 6));
      for (let i = 0; i < cols; i++) {
        const p = createParticle(
          i * (FONT_SIZE * 6) + Math.random() * FONT_SIZE * 3,
          -FONT_SIZE * (Math.random() * 30)
        );
        particles.push(p);
      }
    };

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Frosted glass overlay - darker to make particles more visible
      ctx.fillStyle = "rgba(8, 8, 12, 0.95)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      for (const p of particles) {
        p.y += p.speed;
        p.opacity += p.opacityDir * 0.0008;

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

        ctx.font = `${FONT_SIZE}px monospace`;
        ctx.fillStyle = `rgba(255, 107, 53, ${p.opacity})`;
        ctx.fillText(p.text, p.x, p.y);
      }

      animationId = requestAnimationFrame(draw);
    };

    resize();
    initParticles();
    draw();

    window.addEventListener("resize", () => {
      resize();
      initParticles();
    });

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", resize);
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