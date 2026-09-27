// What one note of a built-in sound costs, by module: node cost.cjs "PRESET" [note] or "KIT#key".
// The second overlapping note is counted, so the track chain is left out (tests/audio/budget.test.ts).
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const page = await b.newPage();
  await page.addInitScript(() => {
    const made = {}; window.__made = made; window.__tag = 'voice';
    const bump = (k) => { made[window.__tag] = made[window.__tag] || {}; made[window.__tag][k] = (made[window.__tag][k] || 0) + 1; };
    const W = window.AudioWorkletNode;
    window.AudioWorkletNode = class extends W { constructor(c, n, o) { super(c, n, o); bump('W:' + n.replace('krsz-', '')); } };
    const proto = BaseAudioContext.prototype;
    for (const m of Object.getOwnPropertyNames(proto)) {
      if (!m.startsWith('create') || m === 'createBuffer' || m === 'createPeriodicWave') continue;
      const orig = proto[m];
      proto[m] = function (...a) { bump(m.replace('create', '')); return orig.apply(this, a); };
    }
  });
  await page.goto((process.env.AUDIT_URL || 'http://localhost:5182') + '/synth/audit', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__audit);
  const name = process.argv[2]; const note = +(process.argv[3] || 48);
  const r = await page.evaluate(async ([name, note]) => {
    const a = window.__audit, w = window;
    const proto = Object.getPrototypeOf(a.engine);
    const orig = proto.buildGraphNode;
    proto.buildGraphNode = function (ctx, type, ...rest) { const prev = w.__tag; w.__tag = type + ':' + (rest[6] || ''); try { return orig.call(this, ctx, type, ...rest); } finally { w.__tag = prev; } };
    let t = a.presets.SOUND_PRESETS.find(p => p.name === name)?.preset;
    if (!t) { const [kit, key] = name.split('#'); t = a.presets.BUILTIN_KITS.find(k => k.name === kit).keys[key]; }
    a.setTrack({ ...t, advanced: true });
    const snap = async (n) => { for (const k of Object.keys(w.__made)) delete w.__made[k];
      await a.renderPhrase(Array.from({ length: n }, (_, i) => ({ note, at: 0.05 + i * 0.01, dur: 0.3, vel: 90 })), 0.5); return JSON.parse(JSON.stringify(w.__made)); };
    const one = await snap(1), two = await snap(2); const out = {};
    for (const tag of new Set([...Object.keys(one), ...Object.keys(two)])) {
      const d = {}; let tot = 0;
      for (const k of new Set([...Object.keys(one[tag] || {}), ...Object.keys(two[tag] || {})])) { const v = ((two[tag] || {})[k] || 0) - ((one[tag] || {})[k] || 0); if (v) { d[k] = v; tot += v; } }
      if (tot) out[tag] = { tot, d };
    }
    return out;
  }, [name, note]);
  let all = 0, wk = 0;
  for (const [k, v] of Object.entries(r).sort((x, y) => y[1].tot - x[1].tot)) { all += v.tot; for (const [n, c] of Object.entries(v.d)) if (n.startsWith('W:')) wk += c; console.log(String(v.tot).padStart(3), k.padEnd(22), JSON.stringify(v.d)); }
  console.log('TOTAL', all, 'worklets', wk);
  await b.close();
})();
