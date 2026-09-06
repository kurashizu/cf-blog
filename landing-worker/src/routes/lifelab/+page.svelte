<script lang="ts">
	import { onMount } from 'svelte';
	import { suspendNavHotkeys } from '$lib/stores/hotkeys';
	import Onboarding from '$lib/components/chrome/Onboarding.svelte';
	import { getLifelabTour } from '$lib/components/lifelab/lifelab-tour';
	import { guideSeen, markGuideSeen, enqueueOnboarding, dequeueOnboarding, isOnboardingActive, openOnboardingNow } from '$lib/stores/chrome';
	import { t, locale } from '$lib/i18n';

	/**
	 * LIFE.LAB, mounted into the site.
	 *
	 * The game is plain DOM: its module resolves every element by id when it is
	 * imported and then drives a canvas itself, so this page renders the markup
	 * it expects and imports it afterwards. Doing it the other way round leaves
	 * `$('#cv')` null and nothing starts.
	 *
	 * The import is dynamic and inside onMount for the same reason it is on the
	 * VM view: the module touches document and localStorage at load, which the
	 * server render has neither of.
	 */
	let mounted = $state(false);
	const TOUR = 'lifelab-tour';
	let guideActive = isOnboardingActive(TOUR);
	// Recomputed whenever the language changes, so the tour never opens in a
	// locale that was current only at the time the page first mounted.
	let tourSteps = $derived.by(() => { $locale; return getLifelabTour(); });

	function closeGuide() {
		dequeueOnboarding(TOUR);
		markGuideSeen('lifelab');
	}

	onMount(() => {
		let disposed = false;
		// The game owns the keyboard while it is up -- SPACE runs, R rotates --
		// so the site's own single-key shortcuts stand aside. Ctrl+0-7 still
		// works: the layout handles those before anything else sees them.
		suspendNavHotkeys.set(true);
		let game: { stop: () => void } | null = null;
		void (async () => {
			await import('$lib/components/lifelab/style.css');
			if (disposed) return;
			// start() rather than an import side effect: the module is cached across
			// navigations but this markup is not, so every mount has to rebind.
			const mod = await import('$lib/components/lifelab/main.js');
			if (disposed) return;
			game = mod;
			mod.start();
			mounted = true;
			// Offered once the dish is drawn, and never on top of the site tour:
			// every step points at something the game builds, so an earlier offer
			// would spotlight elements that do not exist yet.
			if (!guideSeen('lifelab')) enqueueOnboarding(TOUR);
		})();
		return () => {
			disposed = true;
			dequeueOnboarding(TOUR);
			game?.stop();
			suspendNavHotkeys.set(false);
		};
	});
</script>

<svelte:head>
	<title>{$t('lifelab.page.title')}</title>
	<meta
		name="description"
		content={$t('lifelab.page.description')}
	/>
</svelte:head>

<!-- The ids below are the game's own contract; main.js looks each of them up.
     The negative margins undo the slot's padding: every other view is a
     document that wants a margin, this one is an application that draws to its
     own edges. -->
<div id="lifelab" class="-m-2.5 sm:-m-3.5">
	<main id="stage">
		<!-- The sidebar is gone: once the pattern library moved to the tray and
		     the log began floating, a whole column held a wordmark and two
		     buttons. Both now sit in the header beside the controls, and the
		     dish gets the width back. -->
		<div id="brand">
			<pre id="wordmark">┬  ┬┌─┐┌─┐  ┬  ┌─┐┌┐ 
│  │├┤ ├┤   │  ├─┤├┴┐
┴─┘┴└  └─┘  ┴─┘┴ ┴└─┘</pre>
			<small>{$t('lifelab.page.subtitle')}</small>
			<span id="brandbtns">
				<button
					id="llguide"
					title={$t('lifelab.page.guideHint')}
					onclick={() => openOnboardingNow(TOUR)}>?</button>
				<button id="wipebtn" title={$t('lifelab.page.clearAllHint')}>{$t('lifelab.ui.clearAll')}</button>
			</span>
		</div>
		<div id="topbar"></div>
		<div id="stagerow">
			<div id="cvwrap">
				<canvas id="cv" data-tour="ll-dish"></canvas>
				<div id="crt"></div>
				<div id="spotlight"></div>
				<div id="guide"><span id="gstep"></span><span id="gtext"></span></div>
				<div id="msg" class="hidden"></div>
				<!-- The log floats over the dish rather than owning a column: it is a
				     record of what just happened, glanced at, not worked in. -->
				<div id="logwrap" data-tour="ll-log">
					<div class="shead" id="loghead">
						<span>{$t('lifelab.page.logLabel')}</span><small>{$t('lifelab.page.logSubtitle')}</small>
						<button id="logtoggle" title={$t('lifelab.page.hideLogHint')}>_</button>
					</div>
					<div id="term"></div>
				</div>
			</div>
			<div id="tray" data-tour="ll-tray"></div>
		</div>
	</main>
</div>

{#if $guideActive}
	<Onboarding steps={tourSteps} heading={$t('lifelab.page.tourHeading')} onClose={closeGuide} />
{/if}

{#if !mounted}
	<div class="absolute inset-0 flex items-center justify-center pointer-events-none">
		<span class="font-mono text-xs text-white/40">{$t('lifelab.page.loading')}</span>
	</div>
{/if}
