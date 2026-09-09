/* Reference drums synthesised from published physical models, so the targets
   below are derived rather than guessed. Written to JSON for the browser probe. */

// A circular membrane's modes are Bessel zeros j(m,n)/j(0,1) -- the ratios a
// real drum head rings at. Rossing, "Science of Percussion Instruments".
const MEMBRANE = [1.000, 1.594, 2.136, 2.296, 2.653, 2.918, 3.156, 3.501, 3.600, 4.060];
// A circular plate (cymbal) is far denser and inharmonic; measured spectra show
// energy spread over hundreds of partials with no perceived pitch.
function plateRatios(n, seed) {
  let s = seed >>> 0 || 1;
  const rnd = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; };
  const out = [];
  for (let i = 0; i < n; i++) out.push(1 + i * 0.61 + rnd() * 0.9);
  return out;
}

const SR = 44100;

function render(spec) {
  const N = Math.ceil(SR * spec.len);
  const a = new Float64Array(N);
  // Modal sum: each partial an exponentially decaying sine, higher ones dying
  // first, which is what damping physically is.
  for (const [i, r] of spec.ratios.entries()) {
    const f = spec.f0 * r;
    if (f > SR / 2) continue;
    const amp = spec.amp(i, r);
    const tau = spec.tau(i, r);
    const ph = Math.random() * Math.PI * 2;
    for (let n = 0; n < N; n++) {
      a[n] += amp * Math.sin(2 * Math.PI * f * n / SR + ph) * Math.exp(-n / SR / tau);
    }
  }
  // The strike: a short filtered noise burst, the contact between stick and head.
  if (spec.strike > 0) {
    let lp = 0;
    const k = Math.exp(-2 * Math.PI * spec.strikeTone / SR);
    for (let n = 0; n < N; n++) {
      const w = (Math.random() * 2 - 1) * Math.exp(-n / SR / spec.strikeTau);
      lp = w * (1 - k) + lp * k;
      a[n] += lp * spec.strike;
    }
  }
  // Snare wires / cymbal wash: broadband noise with its own envelope.
  if (spec.noise > 0) {
    let hp = 0, prev = 0;
    const k = Math.exp(-2 * Math.PI * spec.noiseHz / SR);
    for (let n = 0; n < N; n++) {
      const w = (Math.random() * 2 - 1) * Math.exp(-n / SR / spec.noiseTau);
      hp = k * (hp + w - prev); prev = w;
      a[n] += hp * spec.noise;
    }
  }
  let pk = 0; for (let n = 0; n < N; n++) pk = Math.max(pk, Math.abs(a[n]));
  if (pk > 0) for (let n = 0; n < N; n++) a[n] /= pk;
  return Array.from(a);
}

const DRUMS = {
  // Bass drum: large head, heavily damped, almost no wires.
  BASSDRUM:   { f0: 55,  ratios: MEMBRANE.slice(0, 5), len: 1.2, strike: 0.25, strikeTone: 900, strikeTau: 0.004,
                noise: 0.02, noiseHz: 3000, noiseTau: 0.01,
                amp: (i) => 1 / (i + 1) ** 1.6, tau: (i) => 0.30 / (1 + i * 0.7) },
  BASSDRUM2:  { f0: 62,  ratios: MEMBRANE.slice(0, 5), len: 1.0, strike: 0.28, strikeTone: 1100, strikeTau: 0.004,
                noise: 0.02, noiseHz: 3000, noiseTau: 0.01,
                amp: (i) => 1 / (i + 1) ** 1.6, tau: (i) => 0.26 / (1 + i * 0.7) },
  // Snare: tuned head plus wires, which carry a lot of the energy.
  SNARE:      { f0: 185, ratios: MEMBRANE.slice(0, 7), len: 0.9, strike: 0.30, strikeTone: 4000, strikeTau: 0.002,
                noise: 0.55, noiseHz: 1800, noiseTau: 0.11,
                amp: (i) => 1 / (i + 1) ** 1.3, tau: (i) => 0.16 / (1 + i * 0.8) },
  ELSNARE:    { f0: 210, ratios: MEMBRANE.slice(0, 7), len: 0.8, strike: 0.16, strikeTone: 2600, strikeTau: 0.002,
                noise: 0.60, noiseHz: 2200, noiseTau: 0.09,
                amp: (i) => 1 / (i + 1) ** 1.3, tau: (i) => 0.13 / (1 + i * 0.8) },
  // Toms: tuned heads, little noise, longer ring than a snare.
  FLOORTOM:   { f0: 82,  ratios: MEMBRANE.slice(0, 6), len: 1.6, strike: 0.22, strikeTone: 1400, strikeTau: 0.003,
                noise: 0.03, noiseHz: 2500, noiseTau: 0.02,
                amp: (i) => 1 / (i + 1) ** 1.5, tau: (i) => 0.55 / (1 + i * 0.6) },
  HIFLOORTOM: { f0: 98,  ratios: MEMBRANE.slice(0, 6), len: 1.5, strike: 0.22, strikeTone: 1500, strikeTau: 0.003,
                noise: 0.03, noiseHz: 2500, noiseTau: 0.02,
                amp: (i) => 1 / (i + 1) ** 1.5, tau: (i) => 0.50 / (1 + i * 0.6) },
  LOWTOM:     { f0: 118, ratios: MEMBRANE.slice(0, 6), len: 1.3, strike: 0.23, strikeTone: 1700, strikeTau: 0.003,
                noise: 0.03, noiseHz: 2600, noiseTau: 0.02,
                amp: (i) => 1 / (i + 1) ** 1.5, tau: (i) => 0.45 / (1 + i * 0.6) },
  LOMIDTOM:   { f0: 145, ratios: MEMBRANE.slice(0, 6), len: 1.2, strike: 0.24, strikeTone: 1900, strikeTau: 0.003,
                noise: 0.03, noiseHz: 2700, noiseTau: 0.02,
                amp: (i) => 1 / (i + 1) ** 1.5, tau: (i) => 0.40 / (1 + i * 0.6) },
  HIMIDTOM:   { f0: 175, ratios: MEMBRANE.slice(0, 6), len: 1.1, strike: 0.25, strikeTone: 2100, strikeTau: 0.003,
                noise: 0.03, noiseHz: 2800, noiseTau: 0.02,
                amp: (i) => 1 / (i + 1) ** 1.5, tau: (i) => 0.36 / (1 + i * 0.6) },
  HITOM:      { f0: 207, ratios: MEMBRANE.slice(0, 6), len: 1.0, strike: 0.13, strikeTone: 1500, strikeTau: 0.003,
                noise: 0.03, noiseHz: 2900, noiseTau: 0.02,
                amp: (i) => 1 / (i + 1) ** 1.5, tau: (i) => 0.32 / (1 + i * 0.6) },
  // Cymbals: dense inharmonic plates, dominated by high-frequency wash.
  CLHAT:      { f0: 400, ratios: plateRatios(60, 11), len: 0.4, strike: 0.10, strikeTone: 9000, strikeTau: 0.001,
                noise: 0.85, noiseHz: 6000, noiseTau: 0.035,
                amp: (i) => 0.5 / (i + 1) ** 0.35, tau: () => 0.05 },
  PEDHAT:     { f0: 400, ratios: plateRatios(60, 13), len: 0.5, strike: 0.10, strikeTone: 8500, strikeTau: 0.001,
                noise: 0.85, noiseHz: 5500, noiseTau: 0.05,
                amp: (i) => 0.5 / (i + 1) ** 0.35, tau: () => 0.07 },
  OPHAT:      { f0: 400, ratios: plateRatios(70, 17), len: 1.4, strike: 0.10, strikeTone: 8500, strikeTau: 0.001,
                noise: 0.85, noiseHz: 5000, noiseTau: 0.42,
                amp: (i) => 0.5 / (i + 1) ** 0.35, tau: () => 0.45 },
  CRASH:      { f0: 300, ratios: plateRatios(90, 19), len: 2.6, strike: 0.10, strikeTone: 7000, strikeTau: 0.002,
                noise: 0.80, noiseHz: 3500, noiseTau: 1.10,
                amp: (i) => 0.5 / (i + 1) ** 0.30, tau: () => 1.20 },
  RIDE:       { f0: 350, ratios: plateRatios(80, 23), len: 2.8, strike: 0.18, strikeTone: 6000, strikeTau: 0.002,
                noise: 0.55, noiseHz: 3000, noiseTau: 1.30,
                amp: (i) => 0.5 / (i + 1) ** 0.32, tau: () => 1.40 },
  RIDEBELL:   { f0: 520, ratios: [1, 2.0, 3.01, 4.2, 5.4, 6.8], len: 1.8, strike: 0.30, strikeTone: 6000, strikeTau: 0.002,
                noise: 0.14, noiseHz: 4000, noiseTau: 0.30,
                amp: (i) => 1 / (i + 1) ** 0.9, tau: (i) => 0.95 / (1 + i * 0.3) },
  TAMBOURINE: { f0: 600, ratios: plateRatios(50, 29), len: 0.7, strike: 0.12, strikeTone: 9000, strikeTau: 0.001,
                noise: 0.90, noiseHz: 5500, noiseTau: 0.16,
                amp: (i) => 0.4 / (i + 1) ** 0.4, tau: () => 0.14 },
  // Idiophones: few, strong, near-harmonic partials.
  COWBELL:    { f0: 540, ratios: [1, 1.52, 2.71, 3.9], len: 0.9, strike: 0.28, strikeTone: 5000, strikeTau: 0.002,
                noise: 0.06, noiseHz: 4000, noiseTau: 0.02,
                amp: (i) => 1 / (i + 1) ** 0.8, tau: (i) => 0.28 / (1 + i * 0.4) },
  CLAVES:     { f0: 2500, ratios: [1, 2.76, 5.4], len: 0.4, strike: 0.35, strikeTone: 8000, strikeTau: 0.001,
                noise: 0.05, noiseHz: 6000, noiseTau: 0.01,
                amp: (i) => 1 / (i + 1) ** 1.1, tau: () => 0.07 },
  SIDESTICK:  { f0: 780, ratios: [1, 2.4, 4.1, 6.0], len: 0.4, strike: 0.42, strikeTone: 6000, strikeTau: 0.0015,
                noise: 0.25, noiseHz: 3500, noiseTau: 0.03,
                amp: (i) => 1 / (i + 1) ** 1.2, tau: (i) => 0.06 / (1 + i * 0.5) },
  // A clap is several bursts of noise a few ms apart -- no pitch at all.
  CLAP:       { f0: 1000, ratios: [], len: 0.6, strike: 0, strikeTone: 0, strikeTau: 0,
                noise: 1.0, noiseHz: 1200, noiseTau: 0.14,
                amp: () => 0, tau: () => 0 },
  LOWTOM2:    { f0: 110, ratios: MEMBRANE.slice(0, 6), len: 1.3, strike: 0.23, strikeTone: 1650, strikeTau: 0.003,
                noise: 0.03, noiseHz: 2600, noiseTau: 0.02,
                amp: (i) => 1 / (i + 1) ** 1.5, tau: (i) => 0.46 / (1 + i * 0.6) }
};

const out = {};
for (const [name, spec] of Object.entries(DRUMS)) out[name] = render(spec);
process.stdout.write(JSON.stringify(out));
