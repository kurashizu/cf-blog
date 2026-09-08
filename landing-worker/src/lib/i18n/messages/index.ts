import type { Dict, Messages } from '../types';
import common from './common';
import chrome from './chrome';
import home from './home';
import synth from './synth';
import synthPanels from './synth-panels';
import utilities from './utilities';
import utilitiesExtra from './utilities-extra';
import chatbot from './chatbot';
import vm from './vm';
import lmspace from './lmspace';
import community from './community';
import lifelab from './lifelab';
import a11y from './a11y';

/* One file per area so parallel work never collides; merged flat here. Keys
   are namespaced by area (`synth.transport.play`), so a collision means two
   areas claimed the same name -- the dev-time check below says which. */
const AREAS: Messages[] = [common, chrome, home, synth, synthPanels, utilities, utilitiesExtra, chatbot, vm, lmspace, community, lifelab, a11y];

function merge(locale: keyof Messages): Dict {
	const out: Dict = {};
	for (const area of AREAS) {
		for (const [k, v] of Object.entries(area[locale] ?? {})) {
			if (import.meta.env.DEV && locale === 'en' && k in out) console.warn(`[i18n] duplicate key across areas: ${k}`);
			out[k] = v;
		}
	}
	return out;
}

export const MESSAGES: Messages = {
	en: merge('en'),
	'zh-CN': merge('zh-CN'),
	'zh-TW': merge('zh-TW'),
	ja: merge('ja'),
	ko: merge('ko')
};

if (import.meta.env.DEV) {
	const en = Object.keys(MESSAGES.en);
	for (const l of ['zh-CN', 'zh-TW', 'ja', 'ko'] as const) {
		const missing = en.filter((k) => !(k in MESSAGES[l]));
		if (missing.length) console.warn(`[i18n] ${l} missing ${missing.length} keys, e.g. ${missing.slice(0, 5).join(', ')}`);
	}
}
