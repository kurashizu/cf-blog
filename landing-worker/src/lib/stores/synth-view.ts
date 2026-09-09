import { derived, get, writable } from 'svelte/store';
import { browser } from '$app/environment';
import { modularSynth } from '../synth';
import { activeTrackId } from './synth-transport';
import { activeTrackRow, refreshTracks, notifyTrackEdited } from './synth-tracks';
import { startingGraph } from './graph-model';

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

/* Which of the two ADV views was last used.
 *
 * A track that has never been in ADV opens on the patch bay, since that is the
 * thing the mode exists for -- but after that it should open where you left it,
 * because whichever one you were working in is the one you want back. Stored
 * rather than per-track: it says how you work, like advancedByDefault, not what
 * a given sound is. Cleared from CFG with the rest. */
export const ADV_VIEW_KEY = 'krsz.synth.adv-view.v1';

function loadAdvDefault(): boolean {
	if (!browser) return false;
	try {
		return localStorage.getItem(ADV_DEFAULT_KEY) === '1';
	} catch {
		return false;
	}
}

export const advancedByDefault = writable<boolean>(loadAdvDefault());

function loadLastAdvView(): 'roll' | 'rack' {
	if (!browser) return 'rack';
	try {
		return localStorage.getItem(ADV_VIEW_KEY) === 'roll' ? 'roll' : 'rack';
	} catch {
		return 'rack';
	}
}

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

/* The roll on its own, in the normal view.
 *
 * ADV gives the whole lower panel to one thing because a patch bay needs the
 * room. Editing a long pattern wants the same room for the same reason, but
 * not the patch bay -- so this drops racks 1-7 and leaves the roll, which is
 * ADV's layout without ADV's engine.
 *
 * Not stored on the track: it says how you are looking at the sound right now,
 * not what the sound is, so it has no business in a patch file. It is the same
 * layout ADV's P.ROLL view gives, so toggleAdvanced carries one into the other
 * rather than resetting the arrangement you were working in. */
export const rollFullscreen = writable<boolean>(false);

export function toggleRollFullscreen(): void {
	rollFullscreen.update((v) => !v);
}


/* A track that has never been switched follows the preference; one that has
   keeps its own choice, so the default cannot overrule a deliberate setting. */
export const advancedMode = derived(
	[activeTrackRow, advancedByDefault],
	([$row, $byDefault]) => $row?.advanced ?? $byDefault
);

/** Which view owns the lower panel while the active track is in ADV. */
export const centreView = derived(activeTrackRow, ($row): CentreView => $row?.advancedView ?? loadLastAdvView());

/** True when racks 1-7 should not be rendered: either mode takes the panel. */
export const panelIsExclusive = derived(
	[advancedMode, rollFullscreen],
	([$adv, $full]) => $adv || $full
);

export function toggleAdvanced(): void {
	const id = get(activeTrackId);
	const on = !get(advancedMode);
	const track = modularSynth.getTrack(id);

	/* The two modes describe the same two layouts, so the switch carries the
	   layout across rather than resetting it.
	
	     roll full screen  <->  ADV showing P.ROLL   (one panel, the roll)
	     racks 1-7 shown   <->  ADV showing RACK     (one panel, the patch bay)
	
	   Going in, a fullscreen roll picks P.ROLL and racks pick RACK; coming out,
	   P.ROLL leaves the roll full screen and RACK puts the racks back. Without
	   this, toggling ADV threw away the arrangement you were working in and you
	   had to rebuild it on the other side. */
	const wasFullscreen = get(rollFullscreen);
	const nextView: CentreView = on ? (wasFullscreen ? 'roll' : 'rack') : get(centreView);
	rollFullscreen.set(on ? false : nextView === 'roll');

	/* Switching a track into ADV that has no signal path yet gives it one.
	   Without this the mode appears to do nothing: the patch bay opens empty,
	   the sound is unchanged because there is nothing to route through, and
	   there is no way to tell that from a bug.
	   
	   The graph matters more than the chain here. ENTRY and OUTPUT are the two
	   ends every patch has -- neither can be added from the palette -- so a
	   canvas without them cannot be built on at all: there is nowhere for the
	   note to arrive and nowhere for the sound to leave. This seeded only the
	   chain, so entering ADV on a fresh track opened on a blank canvas with no
	   ENTRY and no OUTPUT, and the only way to get them was to load a patch
	   that already had them.
	   
	   Only when the track has never had one -- a path the player built is left
	   alone, including one they deliberately emptied. */
	const needsChain = on && !Array.isArray(track?.rackChain);
	const needsGraph = on && !track?.rackGraph?.nodes?.length;

	/* Switching modes is an edit: the two carry different signal paths, so the
	   preset stops describing what is heard the moment the mode changes. The
	   label has to say MODIFIED, or there is no way to save what you now have. */
	notifyTrackEdited();

	modularSynth.updateTrack(id, {
		advanced: on,
		/* Entering keeps the layout that was on screen; leaving keeps the view
		   that was open, so coming back lands where you left. A track that has
		   never been in ADV falls back to the last view used anywhere, which is
		   the patch bay the very first time. */
		advancedView: nextView,
		...(needsChain ? { rackChain: ['string', 'body'], rackParams: {} } : {}),
		...(needsGraph ? { rackGraph: startingGraph(), graphParams: {} } : {})
	});
	refreshTracks();
}

export function setCentreView(v: CentreView): void {
	modularSynth.updateTrack(get(activeTrackId), { advancedView: v });
	// Remembered for the next track that enters ADV without a view of its own.
	if (browser) {
		try {
			localStorage.setItem(ADV_VIEW_KEY, v);
		} catch {
			/* quota / private mode */
		}
	}
	refreshTracks();
}
