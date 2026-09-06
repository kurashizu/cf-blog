import { tr } from '$lib/i18n';

/* WAVE and PRESET tooltips are consumed by WaveMenu.svelte and PresetMenu.svelte
   (this agent's files) and are resolved lazily via a getter, never at import
   time, so they follow the current locale. BLEND/FILTER/LFO tooltips are
   consumed by the rack modules (a sibling area) and are left as plain English
   maps here untouched. */

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

export const BLEND_TOOLTIPS: Record<string, string> = {
	layer: 'Blend Mode: Layer — Sums Oscillator 1 and Oscillator 2 in parallel for thick dual-oscillator tones',
	fm: 'Blend Mode: FM (Frequency Modulation) — Oscillator 2 modulates the frequency of Oscillator 1 for rich metallic/bell harmonic timbres',
	ring: 'Blend Mode: Ring Modulation — Multiplies Oscillator 1 and 2 signals together creating complex inharmonic textures',
	sync: 'Blend Mode: Hard Sync — Resets Oscillator 2 phase whenever Oscillator 1 completes a cycle for cutting sync lead sweeps'
};

export const FILTER_TOOLTIPS: Record<string, string> = {
	lowpass: 'Filter Mode: Low-Pass Filter (LPF) — Allows low frequencies below cutoff to pass through, attenuating highs',
	highpass: 'Filter Mode: High-Pass Filter (HPF) — Allows high frequencies above cutoff to pass through, attenuating lows',
	bandpass: 'Filter Mode: Band-Pass Filter (BPF) — Passes a resonant narrow band around the cutoff frequency, attenuating lows and highs',
	notch: 'Filter Mode: Notch / Band-Reject Filter (BRF) — Attenuates a narrow band at cutoff while letting both lows and highs pass'
};

export const LFO_TOOLTIPS: Record<string, string> = {
	sine: 'Sine Wave LFO — Smooth, continuous cyclical modulation',
	triangle: 'Triangle Wave LFO — Linear ramp up and down modulation',
	square: 'Square Wave LFO — Stepped on/off binary modulation pulse',
	sawtooth: 'Sawtooth Wave LFO — Linear ramp with sharp instantaneous drop'
};

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
