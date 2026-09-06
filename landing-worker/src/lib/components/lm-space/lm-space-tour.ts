import { tr } from '$lib/i18n';
import type { Step } from '../chrome/Onboarding.svelte';

/**
 * LM.SPACE's own walkthrough, shown by the `?` beside the view switch.
 *
 * The volume needs one more than the other views do, because a 3D scatter is
 * not self-evident: what the axes are, why some bodies sit outside the box, and
 * what the surfaces are saying all have to be stated once. Every anchor is a
 * `data-tour` attribute in LmSpaceView.
 *
 * Resolved lazily rather than as a module-level constant: `tr()` reads the
 * locale current at call time, and this module is only ever imported for the
 * `?` GUIDE button, so building the array in a function costs nothing extra.
 */
export function LM_SPACE_TOUR(): Step[] {
	return [
		{
			target: 'lms-modes',
			title: tr('lmspace.tour.readings.title'),
			body: tr('lmspace.tour.readings.body'),
			color: '#56b6c2'
		},
		{
			target: 'lms-axes',
			title: tr('lmspace.tour.axes.title'),
			body: tr('lmspace.tour.axes.body'),
			keys: [
				{ key: 'X', desc: tr('lmspace.tour.axes.keyX') },
				{ key: 'Y', desc: tr('lmspace.tour.axes.keyY') },
				{ key: 'Z', desc: tr('lmspace.tour.axes.keyZ') }
			],
			color: '#e5c07b'
		},
		{
			target: 'lms-stage',
			title: tr('lmspace.tour.flying.title'),
			body: tr('lmspace.tour.flying.body'),
			keys: [
				{ key: 'W A S D', desc: tr('lmspace.tour.flying.keyWasd') },
				{ key: 'Q E', desc: tr('lmspace.tour.flying.keyQe') },
				{ key: 'R', desc: tr('lmspace.tour.flying.keyR') },
				{ key: 'Esc', desc: tr('lmspace.tour.flying.keyEsc') }
			],
			color: '#98c379'
		},
		{
			target: 'lms-stage',
			title: tr('lmspace.tour.outside.title'),
			body: tr('lmspace.tour.outside.body'),
			color: '#d19a66'
		},
		{
			target: 'lms-stage',
			title: tr('lmspace.tour.surfaces.title'),
			body: tr('lmspace.tour.surfaces.body'),
			color: '#c678dd'
		},
		{
			target: 'lms-ctl',
			title: tr('lmspace.tour.otherModes.title'),
			body: tr('lmspace.tour.otherModes.body'),
			color: '#61afef'
		}
	];
}
