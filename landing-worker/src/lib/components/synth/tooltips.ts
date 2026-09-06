import { tr } from '$lib/i18n';

/* WAVE, PRESET, BLEND, FILTER and LFO tooltips are all resolved lazily via a
   getter, never at import time, so they follow the current locale. Consuming
   components read $locale inside a $derived.by (see WaveMenu.svelte /
   PresetMenu.svelte / the rack modules) so a language switch re-renders. */

export function waveTooltips(): Record<string, string> {
	return {
		square: tr('synth.tooltip.square'),
		sawtooth: tr('synth.tooltip.sawtooth'),
		triangle: tr('synth.tooltip.triangle'),
		sine: tr('synth.tooltip.sine'),
		noise: tr('synth.tooltip.noise'),
		metal: tr('synth.tooltip.metal'),
		pwm: tr('synth.tooltip.pwm'),
		supersaw: tr('synth.tooltip.supersaw'),
		organ: tr('synth.tooltip.organ'),
		fold: tr('synth.tooltip.fold')
	};
}

export function blendTooltips(): Record<string, string> {
	return {
		layer: tr('synth.tooltips.blendLayer'),
		fm: tr('synth.tooltips.blendFm'),
		ring: tr('synth.tooltips.blendRing'),
		sync: tr('synth.tooltips.blendSync')
	};
}

export function filterTooltips(): Record<string, string> {
	return {
		lowpass: tr('synth.tooltips.filterLowpass'),
		highpass: tr('synth.tooltips.filterHighpass'),
		bandpass: tr('synth.tooltips.filterBandpass'),
		notch: tr('synth.tooltips.filterNotch')
	};
}

export function lfoTooltips(): Record<string, string> {
	return {
		sine: tr('synth.tooltips.lfoSine'),
		triangle: tr('synth.tooltips.lfoTriangle'),
		square: tr('synth.tooltips.lfoSquare'),
		sawtooth: tr('synth.tooltips.lfoSawtooth')
	};
}

export function presetTooltips(): Record<string, string> {
	return {
		'8-BIT BASS': tr('synth.tooltip.preset8BitBass'),
		PLUCK: tr('synth.tooltip.presetPluck'),
		BRASS: tr('synth.tooltip.presetBrass'),
		LEAD: tr('synth.tooltip.presetLead'),
		'SUB BASS': tr('synth.tooltip.presetSubBass'),
		'ACID BASS': tr('synth.tooltip.presetAcidBass'),
		'FM BASS': tr('synth.tooltip.presetFmBass'),
		'SAW LEAD': tr('synth.tooltip.presetSawLead'),
		'SYNC LEAD': tr('synth.tooltip.presetSyncLead'),
		'CHIP LEAD': tr('synth.tooltip.presetChipLead'),
		KOTO: tr('synth.tooltip.presetKoto'),
		MARIMBA: tr('synth.tooltip.presetMarimba'),
		BELL: tr('synth.tooltip.presetBell'),
		'E-PIANO': tr('synth.tooltip.presetEPiano'),
		ORGAN: tr('synth.tooltip.presetOrgan'),
		CLAV: tr('synth.tooltip.presetClav'),
		HARPSICHORD: tr('synth.tooltip.presetHarpsichord'),
		'WARM PAD': tr('synth.tooltip.presetWarmPad'),
		STRINGS: tr('synth.tooltip.presetStrings'),
		'GLASS PAD': tr('synth.tooltip.presetGlassPad'),
		'HOLLOW PAD': tr('synth.tooltip.presetHollowPad'),
		'KICK 808': tr('synth.tooltip.presetKick808'),
		'KICK PUNCH': tr('synth.tooltip.presetKickPunch'),
		SNARE: tr('synth.tooltip.presetSnare'),
		CLAP: tr('synth.tooltip.presetClap'),
		'CLOSED HAT': tr('synth.tooltip.presetClosedHat'),
		'OPEN HAT': tr('synth.tooltip.presetOpenHat'),
		TOM: tr('synth.tooltip.presetTom'),
		RIMSHOT: tr('synth.tooltip.presetRimshot'),
		COWBELL: tr('synth.tooltip.presetCowbell'),
		SHAKER: tr('synth.tooltip.presetShaker')
	};
}
