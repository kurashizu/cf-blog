#!/usr/bin/env node
/**
 * Diff the five locales of every message file: keys missing from a locale,
 * keys present in a locale but not in English, placeholder mismatches, and
 * keys claimed by two areas. Exit 1 on any finding.
 *
 *   node scripts/i18n-check.mjs            # all areas
 *   node scripts/i18n-check.mjs synth vm   # only these
 *
 * Message files are plain object literals (see src/lib/i18n/README.md), so
 * they are evaluated after stripping the type import and `satisfies`.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib', 'i18n', 'messages');
/* Strings that read as English in every locale because they are supposed to.
   The heuristic below flags any translation identical to its English source,
   which is the right default -- it catches a block pasted and never gone back
   to. These are the exceptions, and listing them is what lets a real one stand
   out instead of being lost among known noise:

   - the chatbot's config *labels* are API parameter names, and sit beside
     `top_p` and `top_k`; every one of their `.hint` strings *is* translated,
     which is where the explaining happens
   - the console lines are shell syntax, an HTTP path and a format template
   - the operator value is a person's name and their degree

   Anything not here that turns up identical is worth a look. */
const SAME_ON_PURPOSE = new Set([
	'chatbot.config.contextWindow.label',
	'chatbot.config.repetitionPenalty.label',
	'chrome.console.run.aliasSet',
	'chrome.console.run.gettingTrace',
	'chrome.console.run.bpmStatus',
	'chrome.sidebar.operatorValue',
	// Pure placeholder templates: there is nothing in them to translate.
	'synth.patch.renderingStage',
	'synth.midiImport.bpmMeter',
	'community.leaderboard.metricHint',
	'home.projects.nodeId',
	'vm.facts.ramValueX64',
	// Product names and versions, which are the same in any language.
	'community.leaderboard.sourceSuffix',
	'vm.facts.emulatorValueX86',
	'vm.facts.guestValueX86',
	'vm.facts.guestValueX64',
	'lifelab.log.placed',
	'utilities.audioout.channel.tone',
	'utilities.audioout.channel.toneRunning',
	'utilities.midi.detail.ccNamed',
	'utilities.mouse.surface.buttons',
	'utilities.view.tool.hint',
	// Web platform names: CSS media features, DOM properties, APIs. Translating
	// these would stop them matching what the browser and the specs call them,
	// which is the whole point of showing them.
	'synthPanels.audioHw.webAudioApi',
	'utilities.net.section.battery.note',
	'utilities.color.cap.colorDepth',
	'utilities.color.cap.dynamicRange',
	'utilities.color.cap.forcedColors',
	'utilities.color.cap.videoDynamicRange',
	'utilities.color.cap.prefersContrast',
	'utilities.net.network.connectionApi.label',
	'utilities.net.permissions.label',
	'utilities.sensors.compass.source.webkit',
	// Units and readouts: the number is the content, the unit is a symbol.
	'utilities.net.network.downlink.value',
	'utilities.sensors.motion.axesDeg',
	'utilities.gpu.benchmark.fillrate.mpixels'
]);

const LOCALES = ['en', 'zh-CN', 'zh-TW', 'ja', 'ko'];
const only = process.argv.slice(2);

function load(file) {
	let src = readFileSync(join(DIR, file), 'utf8');
	src = src
		.replace(/^import type[^\n]*\n/m, '')
		.replace(/export default/, 'return')
		.replace(/\}\s*satisfies\s+Messages\s*;?\s*$/, '}');
	return new Function(src)();
}

const placeholders = (s) =>
	[...String(s).matchAll(/\{(\w+)\}/g)]
		.map((m) => m[1])
		.sort()
		.join(',');

let problems = 0;
const owner = new Map();
for (const file of readdirSync(DIR)
	.filter((f) => f.endsWith('.ts') && f !== 'index.ts')
	.sort()) {
	const area = file.replace(/\.ts$/, '');
	if (only.length && !only.includes(area)) continue;
	let m;
	try {
		m = load(file);
	} catch (e) {
		console.log(`${file}: cannot evaluate (${e.message}) -- keep the file a plain object literal`);
		problems++;
		continue;
	}
	const en = Object.keys(m.en ?? {});
	for (const k of en) {
		if (owner.has(k)) {
			console.log(`${file}: key ${k} already defined in ${owner.get(k)}`);
			problems++;
		} else owner.set(k, file);
	}
	for (const l of LOCALES.slice(1)) {
		const d = m[l] ?? {};
		const missing = en.filter((k) => !(k in d));
		const extra = Object.keys(d).filter((k) => !(k in m.en));
		const badVars = en.filter((k) => k in d && placeholders(d[k]) !== placeholders(m.en[k]));
		const same = en.filter(
			(k) =>
				k in d &&
				d[k] === m.en[k] &&
				/[a-z]{4,}/i.test(m.en[k]) &&
				m.en[k].length > 12 &&
				!SAME_ON_PURPOSE.has(k)
		);
		if (missing.length)
			console.log(
				`${file} ${l}: ${missing.length} missing: ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? ' …' : ''}`
			);
		if (extra.length)
			console.log(`${file} ${l}: ${extra.length} not in en: ${extra.slice(0, 8).join(', ')}`);
		if (badVars.length)
			console.log(`${file} ${l}: placeholder mismatch: ${badVars.slice(0, 8).join(', ')}`);
		if (same.length)
			console.log(
				`${file} ${l}: ${same.length} identical to English (untranslated?): ${same.slice(0, 5).join(', ')}`
			);
		problems += missing.length + extra.length + badVars.length;
	}
	console.log(`${file}: ${en.length} keys`);
}
process.exit(problems ? 1 : 0);
