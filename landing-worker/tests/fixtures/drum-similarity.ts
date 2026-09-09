import fs from 'node:fs';
const SR = 44100;

/* Similarity between a rendered drum and its physical reference.
 *
 * Fixed frequency bands were the wrong instrument for this: the low band ends
 * at 200 Hz, so a tom tuned to 207 read 0.04 "low" while its 198 Hz sibling
 * read 0.86 -- a cliff that says nothing about whether either sounds like a
 * drum. These measure shape instead.
 */

/** Log-spaced spectral envelope: 32 bands from 30 Hz to 16 kHz, power summed. */
export function spectrum(a: ArrayLike<number>, off: number, bands = 32): number[] {
  const N = 4096;
  const lo = 30, hi = 16000;
  const edges: number[] = [];
  for (let i = 0; i <= bands; i++) edges.push(lo * Math.pow(hi / lo, i / bands));
  const out = new Array(bands).fill(0);
  for (let bin = 1; bin < N / 2; bin++) {
    const f = bin * SR / N;
    if (f < lo || f > hi) continue;
    let re = 0, im = 0;
    for (let n = 0; n < N; n++) {
      const x = a[off + n] || 0, ang = -2 * Math.PI * bin * n / N;
      re += x * Math.cos(ang); im += x * Math.sin(ang);
    }
    const p = re * re + im * im;
    for (let b = 0; b < bands; b++) if (f >= edges[b] && f < edges[b + 1]) { out[b] += p; break; }
  }
  const tot = out.reduce((s, x) => s + x, 0) || 1e-12;
  // dB, normalised: perceptually the right domain, and it stops one loud band
  // from deciding the whole correlation.
  return out.map(x => Math.log10(x / tot + 1e-8));
}

/** Amplitude envelope in dB, resampled to a fixed length. */
export function envelope(a: ArrayLike<number>, off: number, points = 64, span = 2.0): number[] {
  const W = 256;
  const n = Math.floor(span * SR / W);
  const raw: number[] = [];
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = 0; k < W; k++) { const v = a[off + i * W + k] || 0; s += v * v; }
    raw.push(Math.sqrt(s / W));
  }
  const peak = Math.max(...raw, 1e-12);
  const out: number[] = [];
  for (let i = 0; i < points; i++) {
    out.push(20 * Math.log10(raw[Math.floor(i * raw.length / points)] / peak + 1e-6));
  }
  return out;
}

export function peakIndex(a: ArrayLike<number>): number {
  let pk = 0, off = 0;
  for (let i = 0; i < a.length; i++) { const m = Math.abs(a[i]); if (m > pk) { pk = m; off = i; } }
  return off;
}

/** Pearson correlation, the standard measure of "same shape". */
export function corr(x: ArrayLike<number>, y: ArrayLike<number>): number {
  const n = Math.min(x.length, y.length);
  let mx = 0, my = 0;
  for (let i = 0; i < n; i++) { mx += x[i]; my += y[i]; }
  mx /= n; my /= n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    const a = x[i] - mx, b = y[i] - my;
    num += a * b; dx += a * a; dy += b * b;
  }
  return num / (Math.sqrt(dx * dy) || 1e-12);
}

/** Normalised cross-correlation of the two envelopes -- how alike the decays
 *  are as shapes over time, which is what convolution measures here. */
export function convMatch(x: ArrayLike<number>, y: ArrayLike<number>): number {
  const n = Math.min(x.length, y.length);
  let best = -1;
  for (let lag = 0; lag <= 4; lag++) {
    let num = 0, ex = 0, ey = 0;
    for (let i = 0; i + lag < n; i++) {
      const a = x[i + lag], b = y[i];
      num += a * b; ex += a * a; ey += b * b;
    }
    best = Math.max(best, num / (Math.sqrt(ex * ey) || 1e-12));
  }
  return best;
}
