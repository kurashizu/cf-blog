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
		title: 'TRACKS',
		body: 'Each chip is one voice with its own oscillators, filter, envelopes and EQ. Click a chip to make it the one every rack below is editing; M and S mute and solo it. OVERLAY draws the other tracks behind the one you are editing so parts line up.',
		color: '#c678dd'
	},
	{
		target: 'synth-roll',
		title: 'PIANO ROLL',
		body: 'Click a cell to place a note, drag across to paint a run, click again to erase. SNAP is the grid the cursor lands on and DUR is how long a placed note is — both go down to 1/12 for triplets. A held note is the same index repeated across cells, so a longer bar really is one longer note.',
		keys: [
			{ key: 'LEN', desc: 'pattern length, counted in pages' },
			{ key: 'METER', desc: '4/4, 3/4, 2/4, 5/4, 6/8 or 7/8' },
			{ key: 'ACC', desc: 'per-step accent, +1 to +4 dB' }
		],
		color: '#56b6c2'
	},
	{
		target: 'synth-keys',
		title: 'PLAY IT',
		body: 'Audition the active track from these keys, from a QWERTY row, or from a real MIDI controller if one is plugged in. Notes played here are heard, not recorded — the piano roll above is where a pattern is written.',
		keys: [
			{ key: 'Z S X D C…', desc: 'lower octave, white and black keys' },
			{ key: 'Q 2 W 3 E…', desc: 'upper octave' },
			{ key: 'Ctrl / Shift', desc: 'octave down / up (also [ and ])' },
			{ key: 'Space', desc: 'sustain pedal, held = pedal down' }
		],
		color: '#98c379'
	},
	{
		target: 'synth-side',
		title: 'VOICE: RACKS 1-3',
		body: 'Where the sound is made, in signal order: two oscillators, a fusion stage that layers them or uses one to modulate the other (FM, ring, sync), and a resonant multi-mode filter. Every knob here edits the track selected above.',
		color: '#e5c07b'
	},
	{
		target: 'synth-rack',
		title: 'SHAPE: RACKS 4-7',
		body: 'What happens to that sound over time: dual envelopes for amplitude and filter, an LFO matrix that can drive pitch, cutoff, pan or volume, per-track FX and a six-band EQ, then the output strip with the visualisers.',
		color: '#61afef'
	},
	{
		target: 'synth-transport',
		title: 'LOAD, RECORD, BOUNCE',
		body: 'LOAD picks a built-in song, IMP takes a previously exported patch or a .mid file — every MIDI track becomes a sequencer track, keeping the file’s tempo and time signature. You can drop a .mid anywhere on this page.',
		keys: [
			{ key: 'WAV', desc: 'render the pattern offline and download it' },
			{ key: 'SHARE', desc: 'pack the whole patch into a URL' },
			{ key: 'SETTINGS', desc: 'global audio and DSP configuration' }
		],
		color: '#e06c75'
	}
];
