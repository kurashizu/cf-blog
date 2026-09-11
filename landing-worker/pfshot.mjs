import { chromium } from 'playwright';

const names = process.argv.slice(2);
const list = names.length ? names : ['LFO', 'COMB', 'VOICE', 'WIDE', 'VIB', 'DUCK', 'PPONG'];

const b = await chromium.launch({ channel: 'chrome' });
const p = await b.newPage({ viewport: { width: 1800, height: 1100 } });
p.on('console', (m) => { if (m.type() === 'error') console.log('PAGE ERR', m.text()); });

for (const nm of list) {
	await p.goto('http://localhost:3456/synth', { waitUntil: 'networkidle' });
	/* ADV first. The toggle lives inside the ordinary layout, and the canvas is
	   only built once it is on -- so nothing may be touched before this. */
	await p.evaluate(() =>
		[...document.querySelectorAll('button')].find((x) => /ADV/.test(x.textContent || ''))?.click()
	);
	await p.waitForTimeout(1400);

	/* The CONSOLE sheet (`fixed inset-0 z-[200]`) and the welcome splash
	   (z-[190]) paint over the whole app on a cold load. They do not block the
	   synthetic click above, but they do cover the canvas -- so an element
	   screenshot taken while one is up is a picture of the sheet. A whole layout
	   review once got signed off against exactly that wrong image.

	   Hidden with CSS rather than removed from the DOM: removing them takes
	   their subtree with them and Svelte's bookkeeping goes with it, which left
	   the canvas unbuilt. Setting the welcome/guide localStorage flags instead
	   also fails -- the layout renders differently and the canvas never appears.
	   Hiding is the one approach that leaves the app intact. */
	await p.addStyleTag({ content: '.z-\\[200\\],.z-\\[190\\]{display:none !important}' });
	await p.waitForTimeout(250);

	/* Assert the canvas is genuinely the thing at its own centre, rather than
	   trusting the rule above. This is the check that would have caught the bad
	   review. */
	const clear = await p.evaluate(() => {
		const c = document.querySelector('[role="application"]');
		if (!c) return false;
		const b = c.getBoundingClientRect();
		const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
		return !!hit && !!c.contains(hit);
	});
	if (!clear) {
		console.log('CANVAS STILL COVERED -- aborting', nm);
		continue;
	}

	const ok = await p.evaluate((nm) => {
		const chip = [...document.querySelectorAll('[draggable="true"]')].find(
			(e) => (e.textContent || '').trim() === nm
		);
		const canvas = document.querySelector('[role="application"]');
		if (!chip || !canvas) return false;
		const dt = new DataTransfer();
		chip.dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true }));
		const r = canvas.getBoundingClientRect();
		/* Dropped well below the starting patch, which occupies the top-left of
		   a fresh canvas. Landing on top of it is what the drop point says to do
		   -- a prefab goes where the pointer is -- but it makes a screenshot of
		   the prefab's own layout unreadable. */
		const at = { clientX: r.left + 160, clientY: r.top + 430, dataTransfer: dt, bubbles: true };
		canvas.dispatchEvent(new DragEvent('dragover', at));
		canvas.dispatchEvent(new DragEvent('drop', at));
		return true;
	}, nm);
	if (!ok) {
		console.log('MISS', nm);
		continue;
	}
	await p.waitForTimeout(1000);

	// Zoom out so the whole prefab fits in frame.
	const canvas = await p.$('[role="application"]');
	const box = await canvas.boundingBox();
	await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	for (let i = 0; i < 5; i++) {
		await p.mouse.wheel(0, 240);
		await p.waitForTimeout(150);
	}
	await p.waitForTimeout(500);
	await canvas.screenshot({ path: `/tmp/pf-${nm}.png` });
	console.log('shot', nm);
}
await b.close();
