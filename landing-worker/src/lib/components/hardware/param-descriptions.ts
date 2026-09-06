/* Knob/fader label -> the i18n key holding its explanation sentence. Callers
   resolve the key through `$t`/`tr` at render time (never at import time) so
   the sentence follows the current locale; the parameter abbreviation itself
   always stays in English, per src/lib/i18n/README.md. */
const PARAM_DESCRIPTION_KEYS: Record<string, string> = {
	// Oscillators
	VOL: 'synthPanels.param.vol',
	LVL: 'synthPanels.param.lvl',
	PW: 'synthPanels.param.pw',
	SUB: 'synthPanels.param.sub',
	NOISE: 'synthPanels.param.noise',
	RPT: 'synthPanels.param.rpt',
	GAP: 'synthPanels.param.gap',
	DET: 'synthPanels.param.det',
	SEMI: 'synthPanels.param.semi',
	RATIO: 'synthPanels.param.ratio',
	PHASE: 'synthPanels.param.phase',
	MRP: 'synthPanels.param.mrp',
	MORPH: 'synthPanels.param.morph',
	'X-FADE': 'synthPanels.param.xfade',
	GLIDE: 'synthPanels.param.glide',

	// Filter
	CUT: 'synthPanels.param.cut',
	CUTOFF: 'synthPanels.param.cutoff',
	RES: 'synthPanels.param.res',
	RESQ: 'synthPanels.param.resq',
	KTRK: 'synthPanels.param.ktrk',
	MOD: 'synthPanels.param.mod',
	ENVA: 'synthPanels.param.enva',

	// Envelopes
	A: 'synthPanels.param.a',
	D: 'synthPanels.param.d',
	S: 'synthPanels.param.s',
	R: 'synthPanels.param.r',
	AMT: 'synthPanels.param.amt',
	ENV: 'synthPanels.param.env',

	// LFO
	RATE: 'synthPanels.param.rate',
	DEP: 'synthPanels.param.dep',
	DEPTH: 'synthPanels.param.depth',

	// Master FX & Mixer
	PAN: 'synthPanels.param.pan',
	DRIVE: 'synthPanels.param.drive',
	'D.TIME': 'synthPanels.param.dTime',
	'D.FDBK': 'synthPanels.param.dFdbk',
	FDBK: 'synthPanels.param.fdbk',
	'D.MIX': 'synthPanels.param.dMixDot',
	'D-MIX': 'synthPanels.param.dMixDash',
	'R-MIX': 'synthPanels.param.rMix',
	REV: 'synthPanels.param.rev'
};

/** The i18n key for a knob/fader label's explanation sentence, or '' if the label has none. */
export function paramDescriptionKey(label: string): string {
	return PARAM_DESCRIPTION_KEYS[label] ?? '';
}
