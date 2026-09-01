import type { Step } from '../chrome/Onboarding.svelte';

/**
 * LM.SPACE's own walkthrough, shown by the `?` beside the view switch.
 *
 * The volume needs one more than the other views do, because a 3D scatter is
 * not self-evident: what the axes are, why some bodies sit outside the box, and
 * what the surfaces are saying all have to be stated once. Every anchor is a
 * `data-tour` attribute in LmSpaceView.
 */
export const LM_SPACE_TOUR: Step[] = [
	{
		target: 'lms-modes',
		title: 'TWO READINGS',
		body: 'The same payload, twice over. SPACE puts every model at a position you can fly to and compare by eye; TABLE is the sortable list, which is still the faster way to read an exact figure or scan one column. Neither replaces the other.',
		color: '#56b6c2'
	},
	{
		target: 'lms-axes',
		title: 'WHAT THE AXES ARE',
		body: 'Price runs left to right and output speed front to back, both on log scales because each spans two orders of magnitude. Height is the intelligence index. A sphere is bigger when its agentic score is higher by default — click "agentic" in the AXES panel to size by coding, intelligence, price or speed instead.',
		keys: [
			{ key: 'X', desc: 'blended price, $/1M tokens at 3:1 in:out' },
			{ key: 'Y', desc: 'Artificial Analysis intelligence index' },
			{ key: 'Z', desc: 'median output tokens per second' }
		],
		color: '#e5c07b'
	},
	{
		target: 'lms-stage',
		title: 'FLYING',
		body: 'WASD moves, Q and E go up and down, Shift boosts. Drag with the left button to pan, or click the canvas to capture the pointer and steer with it. Click any body to open everything the source holds for that model.',
		keys: [
			{ key: 'W A S D', desc: 'fly' },
			{ key: 'Q E', desc: 'up / down' },
			{ key: 'R', desc: 'return to the start view' },
			{ key: 'Esc', desc: 'release the pointer' }
		],
		color: '#98c379'
	},
	{
		target: 'lms-stage',
		title: 'OUTSIDE THE BOX',
		body: 'Speed is the scarcest field upstream, so not every model has three real coordinates. Those sit in walled annexes beyond the measured box, drifting along whichever axis was never measured — a moving position is the honest way to show a value that does not exist. A handful with nothing measured at all orbit the whole arrangement.',
		color: '#d19a66'
	},
	{
		target: 'lms-stage',
		title: 'WHAT THE SURFACES SAY',
		body: 'A body carries its release date in its finish: a current model is polished metal that catches a hard highlight and glows at the rim, an old one has oxidised, pitted and gone matte. How fast it turns is its time to first token — the quickest spin about once every two seconds, the slowest barely move.',
		color: '#c678dd'
	},
	{
		target: 'lms-ctl',
		title: 'THE OTHER MODES',
		body: 'PROJECTION swaps perspective for orthographic, where an axis-aligned view reads as a flat 2D plot. TIMELAPSE replays three years of releases along the date axis. GRAVITY clusters the fully-measured models by capability similarity and draws what it finds — the groups are the tiers the field actually has, not ones anybody labelled.',
		color: '#61afef'
	}
];
