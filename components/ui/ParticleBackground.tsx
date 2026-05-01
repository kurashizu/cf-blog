"use client";

import { useEffect, useRef } from "react";

const CHARS = ["k", "u", "r", "a", "s", "h", "i", "z", "u"];
const FONT_SIZE = 16;
const OPACITY_MIN = 0.03;
const OPACITY_MAX = 0.08;
const SPEED_MIN = 0.3;
const SPEED_MAX = 0.8;

interface Particle {
  x: number;
  y: number;
  char: string;
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
      char: CHARS[Math.floor(Math.random() * CHARS.length)],
      speed: SPEED_MIN + Math.random() * (SPEED_MAX - SPEED_MIN),
      opacity: OPACITY_MIN + Math.random() * (OPACITY_MAX - OPACITY_MIN),
      opacityDir: Math.random() > 0.5 ? 1 : -1,
    });

    const initParticles = () => {
      particles.length = 0;
      const cols = Math.ceil(canvas.width / (FONT_SIZE * 8));
      for (let i = 0; i < cols; i++) {
        const p = createParticle(i * (FONT_SIZE * 8) + Math.random() * FONT_SIZE * 4, -FONT_SIZE * (Math.random() * 50));
        p.y = p.y; // spread initial positions
        particles.push(p);
      }
    };

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Semi-transparent overlay for frosted glass effect
      ctx.fillStyle = "rgba(10, 10, 15, 0.85)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      for (const p of particles) {
        // Update position
        p.y += p.speed;
        p.opacity += p.opacityDir * 0.0005;

        if (p.opacity <= OPACITY_MIN) {
          p.opacity = OPACITY_MIN;
          p.opacityDir = 1;
        } else if (p.opacity >= OPACITY_MAX) {
          p.opacity = OPACITY_MAX;
          p.opacityDir = -1;
        }

        // Reset if off screen
        if (p.y > canvas.height + FONT_SIZE) {
          p.y = -FONT_SIZE;
          p.x = Math.random() * canvas.width;
        }

        // Draw character
        ctx.font = `${FONT_SIZE}px monospace`;
        ctx.fillStyle = `rgba(255, 107, 53, ${p.opacity})`;
        ctx.fillText(p.char, p.x, p.y);
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
      className="fixed inset-0 w-full h-full pointer-events-none z-[-2]"
      style={{ opacity: 0.6 }}
    />
  );
}