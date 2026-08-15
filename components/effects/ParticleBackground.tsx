"use client";

import { useEffect, useRef } from "react";

const GROUPS = ["ku", "ra", "shi", "zu"];
const FONT_SIZE_BASE = 16;
const FONT_SIZE_VARIANCE = 12;
const OPACITY_MIN = 0.18;
const OPACITY_MAX = 0.48;
const SPEED_MIN = 0.2;
const SPEED_MAX = 1.5;
const ROTATION_MIN = -30;
const ROTATION_MAX = 30;

interface Particle {
  x: number;
  y: number;
  text: string;
  speed: number;
  opacity: number;
  opacityDir: number;
  phase: number;
  rotation: number;
  fontSize: number;
  fontStyle: string;
}

const FONTS = ["monospace", "serif", "sans-serif", "cursive", "fantasy"];

export function ParticleBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const accentColorRef = useRef("184, 149, 106");
  const bgColorRef = useRef("26, 23, 20");

  useEffect(() => {
    const parseHex = (hex: string): string => {
      const h = hex.replace("#", "").trim();
      const r = parseInt(h.slice(0, 2), 16);
      const g = parseInt(h.slice(2, 4), 16);
      const b = parseInt(h.slice(4, 6), 16);
      return `${r}, ${g}, ${b}`;
    };

    const updateColors = () => {
      const style = getComputedStyle(document.documentElement);
      // Particles use --accent-hover (one shade lighter) so they read on the
      // muted dark paper without fluorescing.
      const accentHover = style.getPropertyValue("--accent-hover").trim();
      if (accentHover.startsWith("#")) {
        accentColorRef.current = parseHex(accentHover);
      } else {
        // Fallback: match --accent directly.
        const accent = style.getPropertyValue("--accent").trim();
        if (accent.startsWith("#")) accentColorRef.current = parseHex(accent);
      }
      // Canvas clear tracks --bg-primary so trails blend into the page bg.
      const bgPrimary = style.getPropertyValue("--bg-primary").trim();
      if (bgPrimary.startsWith("#")) {
        bgColorRef.current = parseHex(bgPrimary);
      }
    };

    updateColors();
    window.addEventListener("themechange", updateColors);
    return () => window.removeEventListener("themechange", updateColors);
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

    const createParticle = (x?: number, y?: number): Particle => {
      const fontSize = FONT_SIZE_BASE + Math.random() * FONT_SIZE_VARIANCE;
      return {
        x: x ?? Math.random() * canvas.width,
        y: y ?? -fontSize,
        text: GROUPS[Math.floor(Math.random() * GROUPS.length)],
        speed: SPEED_MIN + Math.random() * (SPEED_MAX - SPEED_MIN),
        opacity: OPACITY_MIN + Math.random() * (OPACITY_MAX - OPACITY_MIN),
        opacityDir: Math.random() > 0.5 ? 1 : -1,
        phase: Math.random() * Math.PI * 2,
        rotation: ROTATION_MIN + Math.random() * (ROTATION_MAX - ROTATION_MIN),
        fontSize,
        fontStyle: FONTS[Math.floor(Math.random() * FONTS.length)],
      };
    };

    const initParticles = () => {
      particles.length = 0;
      const avgSize = FONT_SIZE_BASE + FONT_SIZE_VARIANCE / 2;
      const cols = Math.ceil(canvas.width / (avgSize * 5));
      for (let i = 0; i < cols; i++) {
        const p = createParticle(
          i * (avgSize * 5) + Math.random() * avgSize * 2,
          -avgSize * (5 + Math.random() * 40)
        );
        particles.push(p);
      }
    };

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = `rgba(${bgColorRef.current}, 0.92)`;
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

        if (p.y > canvas.height + p.fontSize * 2) {
          p.y = -p.fontSize * 2;
          p.x = Math.random() * canvas.width;
        }

        const wobble = Math.sin(p.phase) * 3;
        ctx.save();
        ctx.translate(p.x + wobble, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.font = `${p.fontSize}px ${p.fontStyle}`;
        ctx.fillStyle = `rgba(${accent}, ${p.opacity})`;
        ctx.fillText(p.text, 0, 0);
        ctx.restore();
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