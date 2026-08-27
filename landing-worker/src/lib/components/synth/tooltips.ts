export const WAVE_TOOLTIPS: Record<string, string> = {
	square: 'Square Waveform — Hollow timbre rich in odd harmonics, ideal for retro 8-bit leads and chiptune bass',
	sawtooth: 'Sawtooth Waveform — Bright, buzzy timbre with all harmonics, ideal for aggressive leads, brass, and thick pads',
	triangle: 'Triangle Waveform — Soft, warm timbre with gentle odd harmonics, ideal for warm basslines and flute sounds',
	sine: 'Sine Waveform — Pure fundamental frequency without overtones, ideal for deep sub bass and clean tones',
	noise: 'White Noise Generator — Equal energy across all frequencies, ideal for drums, percussive transients, and sound effects'
};

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

export const PRESET_TOOLTIPS: Record<string, string> = {
	'8-BIT BASS': 'Preset: 8-Bit Bass — Retro chiptune square/triangle bass with snappy VCF filter envelope',
	PLUCK: 'Preset: Pluck — Short transient acoustic/electronic synth pluck with fast filter decay',
	BRASS: 'Preset: Brass — Dual detuned sawtooth oscillators with dynamic filter sweep',
	LEAD: 'Preset: Lead — Cutting pulse/sawtooth sync lead with resonant filter and full sustain',
	'HI-HAT': 'Preset: Hi-Hat — Highpass filtered white noise percussive transient'
};
