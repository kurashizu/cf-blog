import React, { useEffect, useRef, useState, useCallback } from 'react';

export type CanvasTheme = 'obsidian' | 'chalk' | 'sage' | 'auto';

export interface CanvasBackgroundProps {
  /**
   * Current color theme. If 'auto', detects active theme from document class or prefers-color-scheme.
   */
  theme?: CanvasTheme;
  /**
   * Toggle visibility of lattice interconnecting lines (default: true).
   */
  showGrid?: boolean;
  /**
   * Additional CSS classes for container.
   */
  className?: string;
  /**
   * Interaction sensitivity multiplier (default: 1.0).
   */
  intensity?: number;
}

interface PointNode {
  /** Original resting X position */
  ox: number;
  /** Original resting Y position */
  oy: number;
  /** Current X position */
  x: number;
  /** Current Y position */
  y: number;
  /** X velocity for spring physics */
  vx: number;
  /** Y velocity for spring physics */
  vy: number;
  /** Grid column index */
  col: number;
  /** Grid row index */
  row: number;
  /** Phase offset for procedural wave perturbation */
  phase: number;
  /** Current 3D height / displacement */
  z: number;
}

interface RippleRing {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  strength: number;
  life: number; // 1.0 -> 0.0
}

interface ThemePalette {
  bg: string;
  gridBase: string;
  gridActive: string;
  pointBase: string;
  pointHighlight: string;
  rippleStroke: string;
  accentGlow: string;
}

const PALETTES: Record<'obsidian' | 'chalk' | 'sage', ThemePalette> = {
  obsidian: {
    bg: '#0e1013',
    gridBase: 'rgba(255, 255, 255, 0.038)',
    gridActive: 'rgba(157, 178, 164, 0.18)',
    pointBase: 'rgba(157, 178, 164, 0.45)',
    pointHighlight: 'rgba(236, 238, 237, 0.9)',
    rippleStroke: 'rgba(157, 178, 164, 0.22)',
    accentGlow: 'rgba(157, 178, 164, 0.12)',
  },
  chalk: {
    bg: '#eceae5',
    gridBase: 'rgba(0, 0, 0, 0.045)',
    gridActive: 'rgba(72, 92, 82, 0.22)',
    pointBase: 'rgba(72, 92, 82, 0.4)',
    pointHighlight: 'rgba(26, 27, 30, 0.85)',
    rippleStroke: 'rgba(72, 92, 82, 0.24)',
    accentGlow: 'rgba(72, 92, 82, 0.1)',
  },
  sage: {
    bg: '#111513',
    gridBase: 'rgba(160, 190, 170, 0.05)',
    gridActive: 'rgba(139, 179, 154, 0.25)',
    pointBase: 'rgba(139, 179, 154, 0.5)',
    pointHighlight: 'rgba(225, 232, 227, 0.95)',
    rippleStroke: 'rgba(139, 179, 154, 0.28)',
    accentGlow: 'rgba(139, 179, 154, 0.15)',
  },
};

export const CanvasBackground: React.FC<CanvasBackgroundProps> = ({
  theme = 'auto',
  showGrid = true,
  className = '',
  intensity = 1.0,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [resolvedTheme, setResolvedTheme] = useState<'obsidian' | 'chalk' | 'sage'>('obsidian');

  // Detect and resolve active theme
  const updateResolvedTheme = useCallback(() => {
    if (theme !== 'auto') {
      setResolvedTheme(theme);
      return;
    }

    if (typeof document !== 'undefined') {
      const root = document.documentElement;
      if (root.classList.contains('theme-chalk')) {
        setResolvedTheme('chalk');
      } else if (root.classList.contains('theme-sage')) {
        setResolvedTheme('sage');
      } else {
        setResolvedTheme('obsidian');
      }
    }
  }, [theme]);

  useEffect(() => {
    updateResolvedTheme();

    if (theme === 'auto' && typeof document !== 'undefined') {
      const observer = new MutationObserver(updateResolvedTheme);
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class'],
      });
      return () => observer.disconnect();
    }
  }, [theme, updateResolvedTheme]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    let animationFrameId: number;
    let width = 0;
    let height = 0;
    let dpr = 1;

    // Check prefers-reduced-motion
    const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    let prefersReducedMotion = reducedMotionQuery.matches;

    const onMotionPreferenceChange = (e: MediaQueryListEvent) => {
      prefersReducedMotion = e.matches;
    };
    reducedMotionQuery.addEventListener('change', onMotionPreferenceChange);

    // Lattice Node Mesh Data
    let gridCols = 0;
    let gridRows = 0;
    let points: PointNode[] = [];
    const spacing = 42; // Ideal lattice node distance in px

    // Mouse Tracking with Easing Inertia
    const mouse = {
      targetX: -1000,
      targetY: -1000,
      currentX: -1000,
      currentY: -1000,
      radius: 140, // Repulsion influence radius
      isActive: false,
    };

    // Active Ripples Collection
    const ripples: RippleRing[] = [];

    // Initialize lattice grid nodes
    const buildGrid = (w: number, h: number) => {
      gridCols = Math.ceil(w / spacing) + 2;
      gridRows = Math.ceil(h / spacing) + 2;
      const totalPoints = gridCols * gridRows;
      points = new Array(totalPoints);

      const offsetX = ((gridCols - 1) * spacing - w) / 2;
      const offsetY = ((gridRows - 1) * spacing - h) / 2;

      let idx = 0;
      for (let r = 0; r < gridRows; r++) {
        for (let c = 0; c < gridCols; c++) {
          const ox = c * spacing - offsetX;
          const oy = r * spacing - offsetY;
          points[idx++] = {
            ox,
            oy,
            x: ox,
            y: oy,
            vx: 0,
            vy: 0,
            col: c,
            row: r,
            phase: Math.sin(c * 0.4) + Math.cos(r * 0.35),
            z: 0,
          };
        }
      }
    };

    // Handle HiDPI Canvas Resizing
    const handleResize = () => {
      if (!canvas || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      width = Math.floor(rect.width);
      height = Math.floor(rect.height);
      dpr = Math.min(window.devicePixelRatio || 1, 2);

      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      ctx.resetTransform();
      ctx.scale(dpr, dpr);

      buildGrid(width, height);
    };

    handleResize();

    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    // Mouse & Touch Event Listeners
    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      mouse.targetX = e.clientX - rect.left;
      mouse.targetY = e.clientY - rect.top;
      mouse.isActive = true;
    };

    const handleMouseLeave = () => {
      mouse.isActive = false;
      mouse.targetX = -1000;
      mouse.targetY = -1000;
    };

    const handleClick = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      if (ripples.length < 8) {
        ripples.push({
          x: clickX,
          y: clickY,
          radius: 4,
          maxRadius: Math.max(width, height) * 0.65,
          strength: 24 * intensity,
          life: 1.0,
        });
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0 && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        mouse.targetX = e.touches[0].clientX - rect.left;
        mouse.targetY = e.touches[0].clientY - rect.top;
        mouse.isActive = true;
      }
    };

    const handleTouchEnd = () => {
      mouse.isActive = false;
      mouse.targetX = -1000;
      mouse.targetY = -1000;
    };

    const container = containerRef.current;
    if (container) {
      container.addEventListener('mousemove', handleMouseMove, { passive: true });
      container.addEventListener('mouseleave', handleMouseLeave, { passive: true });
      container.addEventListener('click', handleClick, { passive: true });
      container.addEventListener('touchmove', handleTouchMove, { passive: true });
      container.addEventListener('touchend', handleTouchEnd, { passive: true });
    }

    // Main 60fps Physics & Render Loop
    let lastTime = performance.now();
    let isVisible = true;

    const onVisibilityChange = () => {
      isVisible = !document.hidden;
      if (isVisible) {
        lastTime = performance.now();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    const render = (now: number) => {
      animationFrameId = requestAnimationFrame(render);
      if (!isVisible) return;

      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;
      const t = now * 0.001;

      // Smooth mouse interpolation
      if (mouse.isActive) {
        mouse.currentX += (mouse.targetX - mouse.currentX) * 0.18;
        mouse.currentY += (mouse.targetY - mouse.currentY) * 0.18;
      } else {
        mouse.currentX += (-1000 - mouse.currentX) * 0.1;
        mouse.currentY += (-1000 - mouse.currentY) * 0.1;
      }

      // Update ripples
      for (let i = ripples.length - 1; i >= 0; i--) {
        const r = ripples[i];
        r.radius += dt * 320;
        r.life = Math.max(0, 1 - r.radius / r.maxRadius);
        if (r.life <= 0 || r.radius >= r.maxRadius) {
          ripples.splice(i, 1);
        }
      }

      const palette = PALETTES[resolvedTheme] || PALETTES.obsidian;

      // Clear Canvas with Matte Background
      ctx.fillStyle = palette.bg;
      ctx.fillRect(0, 0, width, height);

      // Simulation Physics Settings
      const springK = 0.055;
      const damping = 0.86;
      const mouseForceMult = 48 * intensity;
      const motionScale = prefersReducedMotion ? 0.15 : 1.0;

      // 1. Update Nodes Physics (Wave Harmonics + Mouse Repulsion + Ripples)
      const numPoints = points.length;
      for (let i = 0; i < numPoints; i++) {
        const p = points[i];

        // Harmonic ambient wave displacement (sine/cosine perturbation field)
        const waveX = Math.sin(p.ox * 0.012 + t * 1.4 + p.phase) * 6 * motionScale;
        const waveY = Math.cos(p.oy * 0.014 + t * 1.1 + p.phase) * 5 * motionScale;
        const targetRestX = p.ox + waveX;
        const targetRestY = p.oy + waveY;

        // Mouse Repulsion Force
        let forceX = 0;
        let forceY = 0;

        const dx = p.x - mouse.currentX;
        const dy = p.y - mouse.currentY;
        const distSq = dx * dx + dy * dy;
        const rSq = mouse.radius * mouse.radius;

        if (distSq < rSq && distSq > 0.01) {
          const dist = Math.sqrt(distSq);
          const norm = (1 - dist / mouse.radius);
          const push = norm * norm * mouseForceMult;
          forceX += (dx / dist) * push;
          forceY += (dy / dist) * push;
        }

        // Ripple Wave Packets
        let rippleZ = 0;
        for (let j = 0; j < ripples.length; j++) {
          const rip = ripples[j];
          const rdx = p.x - rip.x;
          const rdy = p.y - rip.y;
          const rdist = Math.sqrt(rdx * rdx + rdy * rdy);
          const delta = Math.abs(rdist - rip.radius);
          const waveWidth = 45;

          if (delta < waveWidth) {
            const factor = Math.cos((delta / waveWidth) * (Math.PI / 2));
            const push = factor * rip.strength * rip.life;
            if (rdist > 0.01) {
              forceX += (rdx / rdist) * push * 0.6;
              forceY += (rdy / rdist) * push * 0.6;
            }
            rippleZ += push;
          }
        }

        // Spring-Damper Velocity Integration
        const ax = (targetRestX - p.x) * springK + forceX;
        const ay = (targetRestY - p.y) * springK + forceY;

        p.vx = (p.vx + ax) * damping;
        p.vy = (p.vy + ay) * damping;

        p.x += p.vx;
        p.y += p.vy;

        // Calculate elevation / displacement magnitude
        const dispX = p.x - p.ox;
        const dispY = p.y - p.oy;
        p.z = Math.sqrt(dispX * dispX + dispY * dispY) + rippleZ;
      }

      // 2. Render Lattice Interconnecting Lines (Subtle schematic grid)
      if (showGrid) {
        ctx.beginPath();
        ctx.strokeStyle = palette.gridBase;
        ctx.lineWidth = 1;

        for (let r = 0; r < gridRows; r++) {
          for (let c = 0; c < gridCols; c++) {
            const idx = r * gridCols + c;
            const p = points[idx];
            if (!p) continue;

            // Horizontal segment
            if (c < gridCols - 1) {
              const right = points[idx + 1];
              if (right) {
                ctx.moveTo(p.x, p.y);
                ctx.lineTo(right.x, right.y);
              }
            }

            // Vertical segment
            if (r < gridRows - 1) {
              const bottom = points[idx + gridCols];
              if (bottom) {
                ctx.moveTo(p.x, p.y);
                ctx.lineTo(bottom.x, bottom.y);
              }
            }
          }
        }
        ctx.stroke();

        // Highlight highly perturbed lattice segments
        ctx.beginPath();
        ctx.strokeStyle = palette.gridActive;
        ctx.lineWidth = 1.2;
        let hasActiveLines = false;

        for (let i = 0; i < numPoints; i++) {
          const p = points[i];
          if (p.z > 8) {
            // Check right neighbor
            if (p.col < gridCols - 1) {
              const right = points[i + 1];
              if (right && right.z > 8) {
                ctx.moveTo(p.x, p.y);
                ctx.lineTo(right.x, right.y);
                hasActiveLines = true;
              }
            }
            // Check bottom neighbor
            if (p.row < gridRows - 1) {
              const bottom = points[i + gridCols];
              if (bottom && bottom.z > 8) {
                ctx.moveTo(p.x, p.y);
                ctx.lineTo(bottom.x, bottom.y);
                hasActiveLines = true;
              }
            }
          }
        }
        if (hasActiveLines) {
          ctx.stroke();
        }
      }

      // 3. Render Lattice Nodes (Micro Dots with Elevation Opacity)
      for (let i = 0; i < numPoints; i++) {
        const p = points[i];
        const isElevated = p.z > 5;
        const radius = isElevated ? 1.8 : 1.2;

        ctx.fillStyle = isElevated ? palette.pointHighlight : palette.pointBase;
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
        ctx.fill();
      }

      // 4. Render Subtle Expanding Ripples
      for (let i = 0; i < ripples.length; i++) {
        const rip = ripples[i];
        ctx.beginPath();
        ctx.strokeStyle = palette.rippleStroke;
        ctx.lineWidth = 1.5;
        ctx.arc(rip.x, rip.y, rip.radius, 0, Math.PI * 2);
        ctx.stroke();
      }
    };

    animationFrameId = requestAnimationFrame(render);

    // Cleanup resources on unmount
    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      reducedMotionQuery.removeEventListener('change', onMotionPreferenceChange);
      document.removeEventListener('visibilitychange', onVisibilityChange);

      if (container) {
        container.removeEventListener('mousemove', handleMouseMove);
        container.removeEventListener('mouseleave', handleMouseLeave);
        container.removeEventListener('click', handleClick);
        container.removeEventListener('touchmove', handleTouchMove);
        container.removeEventListener('touchend', handleTouchEnd);
      }
    };
  }, [resolvedTheme, showGrid, intensity]);

  return (
    <div
      ref={containerRef}
      className={`fixed inset-0 pointer-events-auto select-none overflow-hidden transition-colors duration-300 ${className}`}
      style={{ zIndex: 0 }}
      aria-hidden="true"
    >
      <canvas
        ref={canvasRef}
        className="block w-full h-full"
      />
    </div>
  );
};

export default CanvasBackground;
