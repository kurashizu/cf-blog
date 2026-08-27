export const PARAM_DESCRIPTIONS: Record<string, string> = {
	// Oscillators
	VOL: 'Volume / Output Gain Level',
	LVL: 'Level / Output Gain',
	PW: 'Pulse Width — Duty cycle of square pulse waveform (narrow spike to symmetric square)',
	SUB: 'Sub-Oscillator Gain — Adds 1-octave-down sine wave for extra low-end sub bass',
	NOISE: 'White Noise Level — Adds breath, transient impact click, or airy percussive sizzle',
	DET: 'Fine Detune in Cents — ±50 cents pitch shift for rich analog chorus thickness',
	SEMI: 'Semitone Pitch Offset — Transposes pitch by ±24 semitones (up to ±2 full octaves)',
	RATIO: 'FM Harmonic Multiplier — Frequency ratio (1x to 4x) for Frequency Modulation',
	PHASE: 'Phase Angle Offset — Waveform starting phase from 0° to 360° for stereo widening',
	MRP: 'Morph Amount — Continuous crossfade blending between Oscillator 1 and 2',
	MORPH: 'Morph Amount — Continuous crossfade blending between Oscillator 1 and 2',

	// Filter
	CUT: 'Cutoff Frequency — Frequency threshold in Hertz where filter attenuation begins',
	CUTOFF: 'Cutoff Frequency — Frequency threshold in Hertz where filter attenuation begins',
	RES: 'Resonance / Q-Factor — Emphasizes and boosts frequencies around the cutoff point',
	MOD: 'Envelope Modulation — Bipolar depth of envelope sweeping the filter cutoff frequency',

	// Envelopes
	A: 'Attack Time — Time taken for envelope to ramp up from zero to peak level',
	D: 'Decay Time — Time taken for envelope to drop from peak to steady sustain level',
	S: 'Sustain Level — Constant holding level while note continues to be held down',
	R: 'Release Time — Time taken to fade out to silence after the note is released',
	AMT: 'Modulation Amount — Overall intensity/depth of the envelope applied to the sound engine',
	ENV: 'Envelope Amount — Overall modulation intensity of the envelope',

	// LFO
	RATE: 'LFO Speed / Frequency — Rate of modulation oscillation in Hertz (0.1Hz to 20Hz)',
	DEP: 'LFO Depth — Intensity/magnitude of modulation applied to the selected target',
	DEPTH: 'LFO Depth — Intensity/magnitude of modulation applied to the selected target',

	// Master FX & Mixer
	PAN: 'Stereo Panning — Position audio in the stereo field (100% Left to 100% Right)',
	DRIVE: 'Analog Overdrive / Saturation — Soft-clipping distortion adding warmth and punch',
	'D.TIME': 'Delay Echo Time — Time delay between echo repeats (10ms to 1000ms)',
	'D.FDBK': 'Delay Feedback — Amount of output fed back to input for sustaining echoes',
	'D.MIX': 'Delay Wet/Dry Mix — Balance between dry un-effected sound and wet echo signal',
	REV: 'Reverb Space Mix — Wet level of spatial convolution acoustic space reverberation'
};
