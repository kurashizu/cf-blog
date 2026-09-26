/* One browser, many renders: reads JSON lines on stdin, writes a WAV per line
   and answers with a JSON line. For the optimizer, which renders hundreds.
   {name, params?, waves?, notes?, seconds?, out} */
const { chromium } = require('../../../node_modules/playwright');
const fs = require('fs');
const readline = require('readline');
(async () => {
  const br = await chromium.launch({ channel: 'chrome' });
  const page = await br.newPage();
  await page.goto('http://localhost:5182/synth/audit', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__audit, null, { timeout: 20000 });
  const rl = readline.createInterface({ input: process.stdin });
  console.log(JSON.stringify({ ready: true }));
  for await (const line of rl) {
    const q = JSON.parse(line);
    /* Editing the source reloads the page under a running tuner; wait for it
       and render again rather than dying mid-search. */
    const once = () => page.evaluate(async (q) => {
      const a = window.__audit;
      if (q.kit) {
        const kit = a.presets.BUILTIN_KITS.find((k) => k.name === q.kit);
        const t = kit?.keys[q.key];
        if (!t) return { ok: false, error: 'no kit key ' + q.kit + ' ' + q.key };
        if (q.getParams) return { ok: true, params: t.graphParams ?? {}, types: Object.fromEntries((t.rackGraph?.nodes ?? []).map((n) => [n.id, n.type])) };
        a.setTrack({ ...t, graphParams: { ...(t.graphParams ?? {}), ...(q.params ?? {}) }, advanced: true });
        return a.renderPhrase(q.notes, q.seconds ?? 10.3);
      }
      const p = a.presets.SOUND_PRESETS.find((x) => x.name === q.name);
      if (!p) return { ok: false, error: 'no preset ' + q.name };
      // A piano voicing to try: the preset's graph rebuilt from grandPiano(overrides).
      const pr = q.piano ? { ...p.preset, ...a.grandPiano(q.piano) } : p.preset;
      a.setTrack({ ...pr, graphParams: { ...(pr.graphParams ?? {}), ...(q.params ?? {}) }, graphWaves: { ...(pr.graphWaves ?? {}), ...(q.waves ?? {}) }, advanced: !!(pr.rackGraph?.nodes?.length || pr.rackChain?.length) });
      const bass = p.category === 'BASS';
      const steps = [0, 2, 4, 5, 7, 9, 11, 12];
      const base = q.base ?? (bass ? 72 : 48);
      const notes = q.notes ?? steps.map((s, i) => ({ note: base - s, at: 0.05 + i * 1.25, dur: 1.0, vel: 96 }));
      return a.renderPhrase(notes, q.seconds ?? 10.3);
    }, q);
    let r;
    for (let attempt = 0; ; attempt++) {
      try {
        await page.waitForFunction(() => !!window.__audit, null, { timeout: 30000 });
        // A render the page reloaded under never settles: give up on it after a minute.
        r = await Promise.race([once(), new Promise((_, no) => setTimeout(() => no(new Error('render timed out')), 60000))]);
        break;
      } catch (e) {
        if (attempt > 4) { r = { ok: false, error: String(e) }; break; }
        if (/timed out/.test(String(e))) await page.reload({ waitUntil: 'networkidle' }).catch(() => {});
        await new Promise((res) => setTimeout(res, 1500));
      }
    }
    if (r.ok && r.wav) fs.writeFileSync(q.out, Buffer.from(r.wav, 'base64'));
    console.log(JSON.stringify({ ok: r.ok, peak: r.peak, error: r.error, params: r.params, types: r.types }));
  }
  await br.close();
})();
