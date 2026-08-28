import type { Step } from '../chrome/Onboarding.svelte';

/**
 * The synth's own walkthrough, shown by the `?` on the KRSZ SYNTH badge. Same
 * coach-mark overlay as the site tour, pointed at this view's regions — the
 * anchors are `data-tour` attributes in SynthWorkspace and TrackChips.
 *
 * Every binding here is the real one; see PianoKeyboard.svelte for the QWERTY
 * map and PatchManager.svelte for the transport row.
 */
export const SYNTH_TOUR: Step[] = [
	{
		target: 'synth-tracks',
		title: 'EIGHT TRACKS',
		body: 'Each chip is one voice with its own oscillators, filter, envelopes and EQ. Click a chip to make it the one the racks below are editing; M and S mute and solo it. OVERLAY draws the other tracks behind the one you are editing so parts line up.',
		color: '#c678dd'
	},
	{
		target: 'synth-roll',
		title: 'PIANO ROLL',
		body: 'Click a cell to place a note, drag across to paint a run, click again to erase. SNAP is the grid the cursor lands on and DUR is how long a placed note is — both go down to 1/12 for triplets. Notes are held by repeating across cells, so a longer bar really is one longer note.',
		keys: [
			{ key: 'LEN', desc: 'pattern length, counted in pages' },
			{ key: 'METER', desc: '4/4, 3/4, 2/4, 5/4, 6/8 or 7/8' },
			{ key: 'ACC', desc: 'per-step accent, +1 to +4 dB' }
		],
		color: '#56b6c2'
	},
	{
		target: 'synth-side',
		title: 'KEYBOARD AND SCOPE',
		body: 'Play the active track from the on-screen keys, a QWERTY row, or a real MIDI controller if one is plugged in. The visualisers below are fed from the live output, not a decorative animation.',
		keys: [
			{ key: 'Z S X D C…', desc: 'lower octave, white and black keys' },
			{ key: 'Q 2 W 3 E…', desc: 'upper octave' },
			{ key: 'Ctrl / Shift', desc: 'octave down / up (also [ and ])' },
			{ key: 'Space', desc: 'sustain pedal, held = pedal down' }
		],
		color: '#98c379'
	},
	{
		target: 'synth-rack',
		title: 'THE SEVEN RACKS',
		body: 'Signal flow runs left to right, the way it would in hardware: two oscillators, a fusion stage that layers or FM/ring/sync-modulates them, a resonant filter, dual envelopes, an LFO matrix, per-track FX and EQ, and the output strip. Every knob edits the track selected above.',
		color: '#e5c07b'
	},
	{
		target: 'synth-transport',
		title: 'LOAD, RECORD, BOUNCE',
		body: 'LOAD picks a built-in song, IMP takes a previously exported patch or a .mid file — every MIDI track becomes a sequencer track, keeping the file’s tempo and time signature. You can drop a .mid anywhere on this page.',
		keys: [
			{ key: 'WAV', desc: 'render the pattern offline and download it' },
			{ key: 'SHARE', desc: 'pack the whole patch into a URL' },
			{ key: 'EXP', desc: 'export the patch as JSON' }
		],
		color: '#e06c75'
	}
];
