"use client";

import { useEffect, useRef } from "react";

const GROUPS = ["ku", "ra", "shi", "zu"];
const FONT_SIZE_BASE = 16;
const FONT_SIZE_VARIANCE = 12;
const OPACITY_MIN = 0.18;
const OPACITY_MAX = 0.48;
const SPEED_MIN = 0.2;
const SPEED_MAX = 1.5;
const DRIFT_MIN = 0.25;
const DRIFT_MAX = 0.7;
const ROTATION_MIN = -30;
const ROTATION_MAX = 30;
// Per-particle RGB jitter in absolute 0-255 units. Kept small so the field
// stays in the muted paper palette — no fluorescence, just organic warmth.
const COLOR_SHIFT = 22;

type SpawnEdge = "top" | "left" | "right";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  text: string;
  opacity: number;
  opacityDir: number;
  phase: number;
  rotation: number;
  fontSize: number;
  fontStyle: string;
  // Per-channel offset added to the accent RGB when drawing this particle.
  colorOffset: [number, number, number];
  spawnEdge: SpawnEdge;
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

    const pickEdge = (): SpawnEdge => {
      const r = Math.random();
      // 55% top, 22.5% left, 22.5% right
      if (r < 0.55) return "top";
      if (r < 0.775) return "left";
      return "right";
    };

    const randomColorOffset = (): [number, number, number] => [
      (Math.random() - 0.5) * 2 * COLOR_SHIFT,
      (Math.random() - 0.5) * 2 * COLOR_SHIFT,
      (Math.random() - 0.5) * 2 * COLOR_SHIFT,
    ];

    const createParticle = (edge?: SpawnEdge): Particle => {
      const fontSize = FONT_SIZE_BASE + Math.random() * FONT_SIZE_VARIANCE;
      const spawnEdge = edge ?? pickEdge();
      const vy = SPEED_MIN + Math.random() * (SPEED_MAX - SPEED_MIN);

      let x: number;
      let y: number;
      let vx: number;

      if (spawnEdge === "top") {
        x = Math.random() * canvas.width;
        y = -fontSize * (5 + Math.random() * 40);
        vx = 0;
      } else if (spawnEdge === "left") {
        x = -fontSize * (2 + Math.random() * 4);
        y = -fontSize * 2 + Math.random() * (canvas.height + fontSize * 4);
        vx = DRIFT_MIN + Math.random() * (DRIFT_MAX - DRIFT_MIN);
      } else {
        // right
        x = canvas.width + fontSize * (2 + Math.random() * 4);
        y = -fontSize * 2 + Math.random() * (canvas.height + fontSize * 4);
        vx = -(DRIFT_MIN + Math.random() * (DRIFT_MAX - DRIFT_MIN));
      }

      return {
        x,
        y,
        vx,
        vy,
        text: GROUPS[Math.floor(Math.random() * GROUPS.length)],
        opacity: OPACITY_MIN + Math.random() * (OPACITY_MAX - OPACITY_MIN),
        opacityDir: Math.random() > 0.5 ? 1 : -1,
        phase: Math.random() * Math.PI * 2,
        rotation: ROTATION_MIN + Math.random() * (ROTATION_MAX - ROTATION_MIN),
        fontSize,
        fontStyle: FONTS[Math.floor(Math.random() * FONTS.length)],
        colorOffset: randomColorOffset(),
        spawnEdge,
      };
    };

    const initParticles = () => {
      particles.length = 0;
      const avgSize = FONT_SIZE_BASE + FONT_SIZE_VARIANCE / 2;
      // Density: ~1 particle per 2.4× avgSize (was 5×) — almost 2× denser.
      const count = Math.ceil(canvas.width / (avgSize * 2.4));
      for (let i = 0; i < count; i++) {
        particles.push(createParticle());
      }
    };

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = `rgba(${bgColorRef.current}, 0.92)`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const accent = accentColorRef.current;
      const [ar, ag, ab] = accent.split(",").map(Number);

      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.opacity += p.opacityDir * 0.0006;
        p.phase += 0.02;

        if (p.opacity <= OPACITY_MIN) {
          p.opacity = OPACITY_MIN;
          p.opacityDir = 1;
        } else if (p.opacity >= OPACITY_MAX) {
          p.opacity = OPACITY_MAX;
          p.opacityDir = -1;
        }

        // Off-screen → fully respawn (new edge, new color jitter, new drift).
        if (
            p.y > canvas.height + p.fontSize * 2 ||
            p.x < -p.fontSize * 4 ||
            p.x > canvas.width + p.fontSize * 4
        ) {
            const fresh = createParticle();
            p.x = fresh.x;
            p.y = fresh.y;
            p.vx = fresh.vx;
            p.vy = fresh.vy;
            p.text = fresh.text;
            p.opacity = fresh.opacity;
            p.opacityDir = fresh.opacityDir;
            p.phase = fresh.phase;
            p.rotation = fresh.rotation;
            p.fontSize = fresh.fontSize;
            p.fontStyle = fresh.fontStyle;
            p.colorOffset = fresh.colorOffset;
            p.spawnEdge = fresh.spawnEdge;
            continue;
        }

        const wobble = Math.sin(p.phase) * 3;
        ctx.save();
        ctx.translate(p.x + wobble, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.font = `${p.fontSize}px ${p.fontStyle}`;
        const r = Math.max(0, Math.min(255, ar + p.colorOffset[0]));
        const g = Math.max(0, Math.min(255, ag + p.colorOffset[1]));
        const b = Math.max(0, Math.min(255, ab + p.colorOffset[2]));
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${p.opacity})`;
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