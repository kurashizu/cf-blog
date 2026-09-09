import { derived, get, writable } from 'svelte/store';
import { browser } from '$app/environment';
import { modularSynth } from '../synth';
import { activeTrackId } from './synth-transport';
import { activeTrackRow, refreshTracks } from './synth-tracks';

/**
 * How the synth page is laid out, per track.
 *
 * The default view puts modules 1-7 around a piano roll. Those racks are the
 * quick panels -- every control the synth has, arranged to fit a fixed grid --
 * and they are as small as they can be while staying readable.
 *
 * ADV drops them for that track and gives the whole lower panel to one view:
 * the roll, or the patch bay. That is the only way to fit a signal path you can
 * rewire; a 250px column cannot show a chain and its connections.
 *
 * Per track rather than global, and stored on the track, because which view a
 * sound wants is a property of that sound -- a drum kit is a signal path, a
 * lead is a handful of knobs. Only one of the two is ever in force for a given
 * track: they are the same track seen two ways, not two patches, so nothing
 * needs reconciling when it switches.
 */
/* Whether a track that has never been switched starts in ADV.
 *
 * Per-track state answers "which view is this sound edited in"; this answers
 * "which view do I work in". Someone who patches rather than turns knobs should
 * not toggle ADV on all eight tracks every session, and someone who does not
 * should never see the patch bay. Stored, and cleared from the CFG dialog like
 * every other preference -- GlobalSettings.svelte imports this key. */
export const ADV_DEFAULT_KEY = 'krsz.synth.adv-default.v1';

function loadAdvDefault(): boolean {
	if (!browser) return false;
	try {
		return localStorage.getItem(ADV_DEFAULT_KEY) === '1';
	} catch {
		return false;
	}
}

export const advancedByDefault = writable<boolean>(loadAdvDefault());

export function setAdvancedByDefault(on: boolean): void {
	advancedByDefault.set(on);
	if (!browser) return;
	try {
		localStorage.setItem(ADV_DEFAULT_KEY, on ? '1' : '0');
	} catch {
		/* quota / private mode */
	}
}

export type CentreView = 'roll' | 'rack';

/* A track that has never been switched follows the preference; one that has
   keeps its own choice, so the default cannot overrule a deliberate setting. */
export const advancedMode = derived(
	[activeTrackRow, advancedByDefault],
	([$row, $byDefault]) => $row?.advanced ?? $byDefault
);

/** Which view owns the lower panel while the active track is in ADV. */
export const centreView = derived(activeTrackRow, ($row): CentreView => $row?.advancedView ?? 'roll');

export function toggleAdvanced(): void {
	const id = get(activeTrackId);
	const on = !get(advancedMode);
	const track = modularSynth.getTrack(id);

	/* Switching a track into ADV that has no signal path yet gives it one.
	   Without this the mode appears to do nothing: the patch bay opens on an
	   empty chain, the sound is unchanged because there is nothing to route
	   through, and there is no way to tell that from a bug. A string into a
	   body is the shape most acoustic instruments take, so it is somewhere to
	   start rather than a blank page.
	   
	   Only when the track has never had one -- a chain the player built is left
	   alone, including one they deliberately emptied. */
	const needsChain = on && !Array.isArray(track?.rackChain);

	modularSynth.updateTrack(id, {
		advanced: on,
		// Leaving ADV parks the view on the roll, so coming back lands where the
		// racks were rather than on a patch bay the user did not ask for again.
		advancedView: on ? get(centreView) : 'roll',
		...(needsChain ? { rackChain: ['string', 'body'], rackParams: {} } : {})
	});
	refreshTracks();
}

export function setCentreView(v: CentreView): void {
	modularSynth.updateTrack(get(activeTrackId), { advancedView: v });
	refreshTracks();
}
