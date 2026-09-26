/* Renders every built-in sound (or the named ones) as a ten-second phrase into
   .cache/renders, the way the ear hears the reference recordings: separate
   notes up a scale, each held and let go. Kits play each of their keys. */
const { chromium } = require('../../../node_modules/playwright');
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, '.cache/renders');
(async () => {
  const only = process.argv.slice(2);
  const br = await chromium.launch({ channel: 'chrome' });
  const page = await br.newPage();
  await page.goto('http://localhost:5182/synth/audit', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__audit, null, { timeout: 20000 });
  const names = await page.evaluate(() => [
    ...window.__audit.presets.SOUND_PRESETS.map((p) => p.name),
    ...window.__audit.presets.BUILTIN_KITS.map((k) => 'KIT:' + k.name)
  ]);
  for (const name of names.filter((n) => !only.length || only.includes(n) || only.includes(n.replace('KIT:', '')))) {
    const r = await page.evaluate(async (name) => {
      const a = window.__audit;
      if (name.startsWith('KIT:')) return { kit: true };
      const p = a.presets.SOUND_PRESETS.find((q) => q.name === name);
      a.setTrack({ ...p.preset, advanced: !!(p.preset.rackGraph?.nodes?.length || p.preset.rackChain?.length) });
      const bass = p.category === 'BASS';
      // C4 D4 E4 F4 G4 A4 B4 C5 (rows count down from C8; C4 is 48), an octave or two down for basses.
      const steps = [0, 2, 4, 5, 7, 9, 11, 12];
      const base = bass ? 72 : 48;
      const notes = steps.map((s, i) => ({ note: base - s, at: 0.05 + i * 1.25, dur: 1.0, vel: 96 }));
      return a.renderPhrase(notes, 10.3);
    }, name);
    if (r.kit) continue;
    if (!r.ok) { console.log(name, 'ERROR', r.error); continue; }
    fs.writeFileSync(path.join(OUT, name.replace(/[^A-Z0-9]+/gi, '_') + '.wav'), Buffer.from(r.wav, 'base64'));
    console.log(name, 'peak', r.peak.toFixed(3));
  }
  await br.close();
})();
