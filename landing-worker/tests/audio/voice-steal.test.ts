import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';

/**
 * Which voice goes when a track runs out, played live.
 *
 * Stealing only happens on a real-time context -- an offline render schedules
 * every voice with its own times and holds none -- so Chrome is told it may
 * start audio without a gesture; the output is muted.
 *
 * The claims: a track's own POLY is its limit; a note whose key is up goes
 * before one still held, whatever the mode; QUIETEST reads what the voice is
 * actually putting out (an ADV voice never passes through the amp envelope it
 * used to read); LOWEST takes the lowest pitch, not the highest.
 */

const BASE = process.env.AUDIT_URL ?? 'http://localhost:5182';

let browser: Browser;
let page: Page;

beforeAll(async () => {
	browser = await chromium.launch({
		channel: 'chrome',
		args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio']
	});
	page = await browser.newPage();
	await page.goto(`${BASE}/synth/audit`, { waitUntil: 'networkidle' });
	await page.waitForFunction(
		() => !!(window as never as { __audit?: { engine?: unknown } }).__audit?.engine,
		{ timeout: 15000 }
	);
}, 60000);

afterAll(async () => {
	await browser?.close();
});

/** A sine whose level is the key's velocity, with a long release so a let-go note keeps sounding. */
const rig = (polyphony?: number) => ({
	advanced: true,
	polyphony,
	ampRelease: 4,
	rackGraph: {
		nodes: [
			{ id: 'entry', type: 'in' },
			{ id: 'freq', type: 'tofreq' },
			{ id: 'osc', type: 'osc' },
			{ id: 'vca', type: 'gain' },
			{ id: 'output', type: 'out' }
		],
		cables: [
			{ from: 'entry', fromPort: 'then', to: 'output', toPort: 'exec' },
			{ from: 'entry', fromPort: 'pitch', to: 'freq', toPort: 'a' },
			{ from: 'freq', fromPort: 'out', to: 'osc', toPort: 'pitch' },
			{ from: 'osc', fromPort: 'out', to: 'vca', toPort: 'in' },
			{ from: 'entry', fromPort: 'vel', to: 'vca', toPort: 'level' },
			{ from: 'vca', fromPort: 'out', to: 'output', toPort: 'in' }
		]
	},
	graphParams: {},
	graphWaves: {},
	presetGain: 1
});

type Step = ['on', number, number] | ['off', number] | ['wait', number];

/** Play `steps` on track 0 and say which notes are still sounding at the end. */
async function play(
	timbre: unknown,
	mode: 'oldest' | 'quietest' | 'lowest',
	steps: Step[],
	globalLimit = 8
): Promise<number[]> {
	return page.evaluate(
		async ({ t, mode, steps, globalLimit }) => {
			const w = window as never as {
				__audit: {
					setTrack(t: unknown): unknown;
					sound: { init(resume: boolean): Promise<void> };
					engine: {
						noteOn(track: number, note: number, vel: number): void;
						noteOff(track: number, note: number): void;
						stopAll(): void;
						setVoiceStealingMode(m: string): void;
						setMaxPolyphony(n: number): void;
						getMaxPolyphony(): number;
						activeVoices: Map<string, { trackId?: number; noteIndex: number }>;
					};
				};
			};
			const { engine, sound } = w.__audit;
			await sound.init(true);
			w.__audit.setTrack(t);
			engine.stopAll();
			const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
			await wait(100);
			const before = engine.getMaxPolyphony();
			engine.setMaxPolyphony(globalLimit);
			engine.setVoiceStealingMode(mode);
			try {
				for (const s of steps) {
					if (s[0] === 'on') engine.noteOn(0, s[1], s[2]);
					else if (s[0] === 'off') engine.noteOff(0, s[1]);
					else await wait(s[1]);
				}
				return [...engine.activeVoices.values()]
					.filter((v) => v.trackId === 0)
					.map((v) => v.noteIndex)
					.sort((a, b) => a - b);
			} finally {
				engine.stopAll();
				engine.setMaxPolyphony(before);
				engine.setVoiceStealingMode('oldest');
			}
		},
		{ t: timbre, mode, steps, globalLimit }
	);
}

const held = (notes: number[]): Step[] =>
	notes.flatMap((n) => [['on', n, 100] as Step, ['wait', 30] as Step]);

describe("a track's own POLY", () => {
	it('is the limit for that track, over the global one', async () => {
		expect(await play(rig(3), 'oldest', held([40, 42, 44, 46, 48]))).toHaveLength(3);
		expect(await play(rig(undefined), 'oldest', held([40, 42, 44, 46, 48]))).toHaveLength(5);
		// And past the global 16 the VOICE tab stops at.
		expect(
			await play(rig(24), 'oldest', held(Array.from({ length: 20 }, (_, i) => 30 + i)), 16)
		).toHaveLength(20);
	}, 60000);
});

describe('stealing', () => {
	it('takes a note whose key is up before any still held, in every mode', async () => {
		// 40 held (the oldest), 42 let go, 44 held; a fourth note needs a voice.
		const steps: Step[] = [
			['on', 40, 100],
			['wait', 30],
			['on', 42, 100],
			['wait', 30],
			['off', 42],
			['wait', 30],
			['on', 44, 100],
			['wait', 30],
			['on', 46, 100],
			['wait', 30]
		];
		for (const mode of ['oldest', 'quietest', 'lowest'] as const)
			expect(await play(rig(3), mode, steps), mode).toEqual([40, 44, 46]);
	}, 60000);

	it('QUIETEST takes the quieter of two ringing notes, by what they put out', async () => {
		// Both let go: 40 loud, 42 soft. The soft one goes; OLDEST would take 40.
		const steps: Step[] = [
			['on', 40, 127],
			['wait', 30],
			['on', 42, 15],
			['wait', 30],
			['off', 40],
			['off', 42],
			['wait', 150],
			['on', 44, 100],
			['wait', 30]
		];
		expect(await play(rig(2), 'quietest', steps)).toEqual([40, 44]);
		expect(await play(rig(2), 'oldest', steps)).toEqual([42, 44]);
	}, 60000);

	it('LOWEST takes the lowest pitch, which is the largest index', async () => {
		// The roll counts down from C8: 60 is lower than 40.
		expect(await play(rig(2), 'lowest', held([40, 60, 50]))).toEqual([40, 50]);
	}, 60000);
});
