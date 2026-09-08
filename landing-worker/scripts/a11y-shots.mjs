/* Screenshots of four views for before/after comparisons, in the Chrome
   already on the machine:  node scripts/a11y-shots.mjs <tag> [baseUrl]
   Written to .shots/ (git-ignored, and outside test-results/, which
   Playwright wipes at the start of every run). */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const tag = process.argv[2] ?? 'x';
const base = (process.argv[3] ?? 'http://localhost:4180').replace(/\/$/, '');
mkdirSync('.shots', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', deviceScaleFactor: 1 });
await ctx.addInitScript(() => {
	for (const k of ['krsz.welcome.seen', 'krsz.guide.seen', 'krsz.guide.synth', 'krsz.guide.lm-space', 'krsz.guide.lifelab']) localStorage.setItem(k, '1');
});
const page = await ctx.newPage();
for (const v of ['modules', 'guestbook', 'synth', 'utils']) {
	await page.goto(`${base}/${v}`, { waitUntil: 'domcontentloaded' });
	await page.locator('main#main, [data-tour="panel"]').first().waitFor();
	await page.waitForTimeout(2500);
	await page.screenshot({ path: `.shots/${tag}-${v}.png` });
}
await browser.close();
