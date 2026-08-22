import React, { useEffect, useRef } from 'react';

export interface WebGLBackgroundProps {
  theme: 'obsidian' | 'chalk' | 'sage' | 'terracotta';
}

const VERTEX_SHADER = `
attribute vec2 position;
varying vec2 vUv;
void main() {
  vUv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `
precision highp float;
uniform vec2 uResolution;
uniform vec2 uMouse;
uniform float uTime;
uniform float uScroll;
uniform vec3 uColorBase;
uniform vec3 uColorGrid;
uniform vec3 uColorAccent;
varying vec2 vUv;

// Hash for discrete digital pulses
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

void main() {
  vec2 screenCoords = gl_FragCoord.xy;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 uv = vUv * aspect;
  vec2 mouse = uMouse * aspect;

  float t = uTime;

  // 1. High-Tech Discrete Orthogonal Grid (48px primary grid, 12px sub-grid)
  vec2 primaryGrid = fract(screenCoords / 48.0);
  vec2 subGrid = fract(screenCoords / 12.0);

  // Hairline grid lines (0.75px)
  vec2 dPrimary = fwidth(screenCoords / 48.0);
  vec2 linePrimary = step(1.0 - dPrimary * 0.75, primaryGrid) + step(primaryGrid, dPrimary * 0.75);
  float isPrimaryLine = max(linePrimary.x, linePrimary.y);

  vec2 dSub = fwidth(screenCoords / 12.0);
  vec2 lineSub = step(1.0 - dSub * 0.45, subGrid) + step(subGrid, dSub * 0.45);
  float isSubLine = max(lineSub.x, lineSub.y);

  // 2. Discrete Grid Intersections / Data Nodes
  vec2 cellId = floor(screenCoords / 48.0);
  float cellHash = hash(cellId);

  // 3. Proximity Radar / Crosshair Scan from Cursor
  float distToMouse = length(uv - mouse);
  float mouseRadar = smoothstep(0.45, 0.0, distToMouse);

  // Orthogonal cursor tracking cross-lines
  vec2 mouseScreen = uMouse * uResolution;
  float cursorCrossX = smoothstep(1.2, 0.0, abs(screenCoords.x - mouseScreen.x));
  float cursorCrossY = smoothstep(1.2, 0.0, abs(screenCoords.y - mouseScreen.y));
  float cursorCross = max(cursorCrossX, cursorCrossY) * 0.12;

  // 4. Digital Pulse Packets traveling strictly along grid axes
  float pulseX = step(0.96, fract(cellId.x * 0.1 + t * 0.8 + cellHash * 2.0)) * isPrimaryLine;
  float pulseY = step(0.96, fract(cellId.y * 0.1 - t * 0.6 + cellHash * 3.0)) * isPrimaryLine;
  float pulse = max(pulseX, pulseY) * 0.28;

  // 5. CRT Phosphor Pitch (1.5px vertical pitch)
  float scanline = sin(screenCoords.y * 2.094) * 0.015;

  // Composite Color
  vec3 color = uColorBase;

  // Add sub-grid (very faint)
  color = mix(color, uColorGrid, isSubLine * 0.035);

  // Add primary grid
  color = mix(color, uColorGrid, isPrimaryLine * 0.09);

  // Add mouse radar halo & cursor cross
  color = mix(color, uColorAccent, mouseRadar * 0.06 + cursorCross);

  // Add digital pulse packets
  color = mix(color, uColorAccent, pulse);

  // Apply CRT scanline
  color -= vec3(scanline);

  // Grain dither for zero digital color banding
  float grain = hash(screenCoords + vec2(t * 0.01));
  color += (grain - 0.5) * 0.012;

  gl_FragColor = vec4(color, 1.0);
}
`;

const THEME_DATA: Record<string, { base: number[]; grid: number[]; accent: number[] }> = {
  obsidian: {
    base: [0.058, 0.066, 0.082],     // #0f1115
    grid: [0.45, 0.52, 0.60],        // #738499
    accent: [0.70, 0.41, 0.37],      // #b36a5e
  },
  chalk: {
    base: [0.917, 0.905, 0.878],     // #eae7e0
    grid: [0.40, 0.42, 0.46],        // #666b75
    accent: [0.61, 0.33, 0.28],      // #9c5448
  },
  sage: {
    base: [0.062, 0.082, 0.070],     // #101512
    grid: [0.55, 0.63, 0.56],        // #8ca18f
    accent: [0.46, 0.57, 0.49],      // #75927c
  },
  terracotta: {
    base: [0.086, 0.074, 0.066],     // #161311
    grid: [0.62, 0.55, 0.52],        // #9e8c85
    accent: [0.77, 0.46, 0.41],      // #c47668
  },
};

export const WebGLBackground: React.FC<WebGLBackgroundProps> = ({ theme }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl', { antialias: false, alpha: false });
    if (!gl) return;

    const createShader = (type: number, src: string) => {
      const s = gl.createShader(type);
      if (!s) return null;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };

    const vs = createShader(gl.VERTEX_SHADER, VERTEX_SHADER);
    const fs = createShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    if (!vs || !fs) return;

    const prog = gl.createProgram();
    if (!prog) return;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.useProgram(prog);

    const posBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );

    const posAttr = gl.getAttribLocation(prog, 'position');
    gl.enableVertexAttribArray(posAttr);
    gl.vertexAttribPointer(posAttr, 2, gl.FLOAT, false, 0, 0);

    const uResLoc = gl.getUniformLocation(prog, 'uResolution');
    const uMouseLoc = gl.getUniformLocation(prog, 'uMouse');
    const uTimeLoc = gl.getUniformLocation(prog, 'uTime');
    const uScrollLoc = gl.getUniformLocation(prog, 'uScroll');
    const uBaseLoc = gl.getUniformLocation(prog, 'uColorBase');
    const uGridLoc = gl.getUniformLocation(prog, 'uColorGrid');
    const uAccLoc = gl.getUniformLocation(prog, 'uColorAccent');

    let mouseX = 0.5;
    let mouseY = 0.5;
    let targetMouseX = 0.5;
    let targetMouseY = 0.5;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uResLoc, canvas.width, canvas.height);
    };

    resize();
    window.addEventListener('resize', resize);

    const handleMouseMove = (e: MouseEvent) => {
      targetMouseX = e.clientX / window.innerWidth;
      targetMouseY = 1.0 - e.clientY / window.innerHeight;
    };
    window.addEventListener('mousemove', handleMouseMove, { passive: true });

    let animId: number;
    const startTime = performance.now();

    const render = (now: number) => {
      animId = requestAnimationFrame(render);
      const elapsed = (now - startTime) * 0.001;

      mouseX += (targetMouseX - mouseX) * 0.1;
      mouseY += (targetMouseY - mouseY) * 0.1;

      gl.uniform2f(uMouseLoc, mouseX, mouseY);
      gl.uniform1f(uTimeLoc, elapsed);
      gl.uniform1f(uScrollLoc, window.scrollY);

      const colors = THEME_DATA[theme] || THEME_DATA.obsidian;
      gl.uniform3fv(uBaseLoc, colors.base);
      gl.uniform3fv(uGridLoc, colors.grid);
      gl.uniform3fv(uAccLoc, colors.accent);

      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [theme]);

  return (
    <div className="fixed inset-0 pointer-events-none -z-10 select-none overflow-hidden" aria-hidden="true">
      <canvas ref={canvasRef} className="w-full h-full block" />
    </div>
  );
};
