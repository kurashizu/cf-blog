import { tr } from '$lib/i18n';
import { get } from 'svelte/store';
import type { Step } from '../chrome/Onboarding.svelte';
import { advancedMode, toggleAdvanced, setCentreView } from '../../stores/synth-view';

/**
 * The synth's own walkthrough, shown by the `?` on the KRSZ SYNTH badge. Same
 * coach-mark overlay as the site tour, pointed at this view's regions — the
 * anchors are `data-tour` attributes in SynthWorkspace and TrackChips.
 *
 * Every binding here is the real one; see PianoKeyboard.svelte for the QWERTY
 * map and PatchManager.svelte for the transport row.
 *
 * A function, not a module-level constant: title/body/desc strings are
 * translated, so they must be resolved at call time (when the tour opens),
 * not frozen at import time.
 */
export function synthTour(): Step[] {
	return [
		{
			target: 'synth-tracks',
			title: tr('synth.tour.tracksTitle'),
			body: tr('synth.tour.tracksBody'),
			color: '#c678dd'
		},
		{
			target: 'synth-roll',
			title: tr('synth.tour.rollTitle'),
			body: tr('synth.tour.rollBody'),
			keys: [
				{ key: 'LEN', desc: tr('synth.tour.rollKeyLen') },
				{ key: 'METER', desc: tr('synth.tour.rollKeyMeter') },
				{ key: 'ACC', desc: tr('synth.tour.rollKeyAcc') }
			],
			color: '#56b6c2'
		},
		{
			target: 'synth-keys',
			title: tr('synth.tour.playTitle'),
			body: tr('synth.tour.playBody'),
			keys: [
				{ key: 'Z S X D C…', desc: tr('synth.tour.playKeyLower') },
				{ key: 'Q 2 W 3 E…', desc: tr('synth.tour.playKeyUpper') },
				{ key: 'Ctrl / Shift', desc: tr('synth.tour.playKeyOctave') },
				{ key: 'Space', desc: tr('synth.tour.playKeySustain') }
			],
			color: '#98c379'
		},
		{
			target: 'synth-side',
			title: tr('synth.tour.voiceTitle'),
			body: tr('synth.tour.voiceBody'),
			color: '#e5c07b'
		},
		{
			target: 'synth-rack',
			title: tr('synth.tour.shapeTitle'),
			body: tr('synth.tour.shapeBody'),
			color: '#61afef'
		},
		{
			/* The tour turns ADV on itself rather than describing it. The mode is
			   the other half of the synth, and reading about a patch bay is not
			   the same as watching the racks give way to one. */
			target: 'synth-adv',
			title: tr('synth.tour.advTitle'),
			body: tr('synth.tour.advBody'),
			color: '#61afef',
			action: {
				label: tr('synth.tour.advAction'),
				run: () => {
					if (!get(advancedMode)) toggleAdvanced();
					setCentreView('rack');
				}
			}
		},
		{
			target: 'synth-canvas',
			title: tr('synth.tour.canvasTitle'),
			body: tr('synth.tour.canvasBody'),
			color: '#61afef',
			keys: [
				{ key: 'DRAG', desc: tr('synth.tour.canvasKeyDrag') },
				{ key: 'RMB', desc: tr('synth.tour.canvasKeyPan') },
				{ key: 'WHEEL', desc: tr('synth.tour.canvasKeyZoom') }
			]
		},
		{
			target: 'synth-palette',
			title: tr('synth.tour.paletteTitle'),
			body: tr('synth.tour.paletteBody'),
			color: '#98c379'
		},
		{
			target: 'synth-transport',
			title: tr('synth.tour.transportTitle'),
			body: tr('synth.tour.transportBody'),
			keys: [
				{ key: 'WAV', desc: tr('synth.tour.transportKeyWav') },
				{ key: 'SHARE', desc: tr('synth.tour.transportKeyShare') },
				{ key: 'SETTINGS', desc: tr('synth.tour.transportKeySettings') }
			],
			color: '#e06c75'
		}
	];
}
