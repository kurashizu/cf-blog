import type { Step } from '../chrome/Onboarding.svelte';
import { tr } from '$lib/i18n';

/**
 * LIFE.LAB's own walkthrough, shown by the `?` beside the board controls.
 *
 * Conway's rule is the one thing a newcomer has to be told -- everything after
 * it follows from watching -- so it goes first, stated exactly. The rest names
 * the four things on screen that are not self-evident. Every anchor is a
 * `data-tour` attribute, set in the markup or, for the toolbar, in main.js
 * where those controls are built.
 *
 * A function rather than a constant: the caller reads it fresh (as a
 * `$derived`) so the tour is rebuilt in the current language every time it is
 * opened, rather than being frozen in whatever locale was active at import.
 */
export function getLifelabTour(): Step[] {
	return [
		{
			target: 'll-dish',
			title: tr('lifelab.tour.dish.title'),
			body: tr('lifelab.tour.dish.body'),
			keys: [{ key: 'B3/S23', desc: tr('lifelab.tour.dish.key1') }],
			color: '#56b6c2'
		},
		{
			target: 'll-run',
			title: tr('lifelab.tour.run.title'),
			body: tr('lifelab.tour.run.body'),
			keys: [
				{ key: 'SPD', desc: tr('lifelab.tour.run.key1') },
				{ key: 'CLEAR', desc: tr('lifelab.tour.run.key2') }
			],
			color: '#98c379'
		},
		{
			target: 'll-tools',
			title: tr('lifelab.tour.draw.title'),
			body: tr('lifelab.tour.draw.body'),
			color: '#e5c07b'
		},
		{
			target: 'll-tray',
			title: tr('lifelab.tour.library.title'),
			body: tr('lifelab.tour.library.body'),
			color: '#c678dd'
		},
		{
			target: 'll-stats',
			title: tr('lifelab.tour.stats.title'),
			body: tr('lifelab.tour.stats.body'),
			color: '#61afef'
		},
		{
			target: 'll-log',
			title: tr('lifelab.tour.log.title'),
			body: tr('lifelab.tour.log.body'),
			color: '#d19a66'
		}
	];
}
