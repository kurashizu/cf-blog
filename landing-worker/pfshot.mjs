import { chromium } from 'playwright';

const names = process.argv.slice(2);
const list = names.length ? names : ['LFO', 'COMB', 'VOICE', 'WIDE', 'VIB', 'DUCK', 'PPONG'];

const b = await chromium.launch({ channel: 'chrome' });
const p = await b.newPage({ viewport: { width: 1800, height: 1100 } });
p.on('console', (m) => { if (m.type() === 'error') console.log('PAGE ERR', m.text()); });

for (const nm of list) {
	await p.goto('http://localhost:3456/synth', { waitUntil: 'networkidle' });
	await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => /ADV/.test(x.textContent || ''))?.click());
	await p.waitForTimeout(1200);
	const ok = await p.evaluate((nm) => {
		const chip = [...document.querySelectorAll('[draggable="true"]')].find((e) => (e.textContent || '').trim() === nm);
		const canvas = document.querySelector('[role="application"]');
		if (!chip || !canvas) return false;
		const dt = new DataTransfer();
		chip.dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true }));
		const r = canvas.getBoundingClientRect();
		const at = { clientX: r.left + 120, clientY: r.top + 110, dataTransfer: dt, bubbles: true };
		canvas.dispatchEvent(new DragEvent('dragover', at));
		canvas.dispatchEvent(new DragEvent('drop', at));
		return true;
	}, nm);
	if (!ok) { console.log('MISS', nm); continue; }
	await p.waitForTimeout(900);
	// zoom out with wheel over the canvas so the whole prefab fits
	const canvas = await p.$('[role="application"]');
	const box = await canvas.boundingBox();
	const zooms = { LFO: 2, COMB: 2, VOICE: 3, WIDE: 2, VIB: 1, DUCK: 2, PPONG: 6 };
	const n = zooms[nm] ?? 3;
	await p.mouse.move(box.x + 200, box.y + 180);
	for (let i = 0; i < n; i++) { await p.mouse.wheel(0, 240); await p.waitForTimeout(120); }
	await p.waitForTimeout(700);
	await canvas.screenshot({ path: `/tmp/pf-${nm}.png` });
	console.log('shot', nm);
}
await b.close();
