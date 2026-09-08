import { expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { appendFileSync, mkdirSync } from 'node:fs';

export const VIEWS = ['/modules', '/guestbook', '/synth', '/utils', '/lm-space', '/krsz-vm', '/web-lm', '/lifelab'] as const;

export const VIEWPORTS = {
	desktop: { width: 1440, height: 900 },
	tablet: { width: 820, height: 1100 },
	phone: { width: 500, height: 860 }
} as const;

/** A returning visitor: no welcome, no tour, no per-view tour. */
export async function returningVisitor(page: Page): Promise<void> {
	await page.addInitScript(() => {
		for (const k of ['krsz.welcome.seen', 'krsz.guide.seen', 'krsz.guide.synth', 'krsz.guide.lm-space', 'krsz.guide.lifelab']) {
			localStorage.setItem(k, '1');
		}
	});
}

export async function open(page: Page, path: string): Promise<void> {
	await page.goto(path, { waitUntil: 'domcontentloaded' });
	await page.locator('main#main').waitFor();
	// Let lazy views (three.js, xterm, the synth racks) mount.
	await page.waitForTimeout(1500);
}

export interface Violation {
	id: string;
	impact: string;
	help: string;
	nodes: string[];
}

/**
 * Run axe with the WCAG 2.2 AA rule set. Returns the violations at or above
 * `minImpact` so a test can decide; everything is also printed so a run's
 * output is the full audit, not only what failed.
 */
export async function audit(page: Page, label: string, minImpact: 'serious' | 'moderate' | 'minor' = 'serious'): Promise<Violation[]> {
	const results = await new AxeBuilder({ page })
		.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
		// The theme video is decorative and has no track; the site says so.
		.disableRules(['video-caption'])
		.analyze();
	const order = ['minor', 'moderate', 'serious', 'critical'];
	const min = order.indexOf(minImpact);
	const all: Violation[] = results.violations.map((v) => ({
		id: v.id,
		impact: v.impact ?? 'minor',
		help: v.help,
		nodes: v.nodes.slice(0, 5).map((n) => n.target.join(' '))
	}));
	for (const v of all) {
		console.log(`[axe ${label}] ${v.impact.padEnd(8)} ${v.id}: ${v.help}\n    ${v.nodes.join('\n    ')}`);
	}
	// Machine-readable copy of the whole audit (every node, with axe's own
	// explanation) for sorting by rule or by selector across views.
	mkdirSync('test-results', { recursive: true });
	for (const v of results.violations) {
		for (const n of v.nodes) {
			appendFileSync(
				'test-results/axe.jsonl',
				JSON.stringify({ label, id: v.id, impact: v.impact, target: n.target.join(' '), html: n.html.slice(0, 200), summary: n.failureSummary?.split('\n').slice(1, 3).join(' ') }) + '\n'
			);
		}
	}
	return all.filter((v) => order.indexOf(v.impact) >= min);
}

export async function expectClean(page: Page, label: string): Promise<void> {
	const bad = await audit(page, label);
	expect(bad, `${label}: ${bad.map((v) => `${v.impact} ${v.id} (${v.nodes[0]})`).join('; ')}`).toEqual([]);
}
