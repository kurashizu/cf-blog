// Every built-in sound's loudness on one phrase: RMS and peak (dBFS), K-ish
// weighted (a 100 Hz high-pass stands in for the ear's bass roll-off), so the
// set can be levelled. node loudness.cjs [NAME ...]
const { chromium } = require('../../../node_modules/playwright');
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const page = await b.newPage();
  await page.goto((process.env.AUDIT_URL || 'http://localhost:5182') + '/synth/audit', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__audit);
  const r = await page.evaluate(async (names) => {
    const a = window.__audit, out = [];
    const notes = [48, 55, 60, 64, 67, 72].map((n, i) => ({ note: n, at: 0.05 + i * 0.5, dur: 0.45, vel: 100 }));
    for (const p of a.presets.SOUND_PRESETS) {
      if (names.length && !names.includes(p.name)) continue;
      a.setTrack({ ...p.preset, advanced: !!p.preset.rackGraph?.nodes?.length });
      const res = await a.renderPhrase(notes, 3.5);
      if (!res.ok) { out.push({ name: p.name, err: true }); continue; }
      const bb = Uint8Array.from(atob(res.wav), (c) => c.charCodeAt(0)); const dv = new DataView(bb.buffer);
      const n = (bb.length - 44) / 4; let s = 0, pk = 0, y = 0, xp = 0; const k = Math.exp(-2 * Math.PI * 100 / 48000);
      const w = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const x = (dv.getInt16(44 + i * 4, true) + dv.getInt16(46 + i * 4, true)) / 65534;
        y = k * (y + x - xp); xp = x; w[i] = y; s += y * y; pk = Math.max(pk, Math.abs(x));
      }
      /* What a note sounds like, as loud: the first 400 ms of each, in dB,
         averaged. The whole phrase's RMS ranks a pluck by its silence and a
         pad by its sustain, 10 dB apart at the same perceived level. */
      const onset = notes.map(({ at }) => {
        let e = 0; const i0 = Math.round(at * 48000), m = Math.round(0.4 * 48000);
        for (let i = i0; i < i0 + m; i++) e += w[i] * w[i];
        return 10 * Math.log10(e / m + 1e-12);
      });
      out.push({ name: p.name, kind: p.kind, rms: 10 * Math.log10(s / n + 1e-12), note: onset.reduce((x, v) => x + v) / onset.length, peak: 20 * Math.log10(pk + 1e-9) });
    }
    return out;
  }, process.argv.slice(2));
  for (const x of r) console.log(x.err ? `${x.name} ERROR` : `${x.name.padEnd(15)} ${x.kind} note ${x.note.toFixed(1)} rms ${x.rms.toFixed(1)} peak ${x.peak.toFixed(1)}`);
  await b.close();
})();
