import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';
import { goto } from '$app/navigation';
import { page } from '$app/state';
import { tr, locale, setLocale, localeAuto, LOCALES, LOCALE_IDS, type Locale } from '$lib/i18n';
import { evaluateSafeJS } from '../evaluator';
import { METER_SPECS, type NoteDurationDiv, type TimeSignature, type BlendMode } from '../synth';
import { MODULES } from '../data/modules';
import { EXTERNAL_LINKS } from '../links';
import { TAB_ROUTES } from '../routes-map';
import { allPaths, lookup, renderTree, resolvePath, type VNode } from '../vfs';
import { theme, cycleTheme, resolvedTheme, type WorkspaceTheme } from './theme';
import { bpm, setBpm, setSnapDiv, setNoteDur, setTimeMeter, toggle as toggleSeq, play, stop, isSeqPlaying } from './synth-transport';
import { updateActiveTrack, tracksState } from './synth-tracks';
import { activeTrackId } from './synth-transport';
import {
	BUILTIN_SONGS,
	builtinSongIdx,
	handleLoadBuiltinSong,
	handleNewProject,
	handleSavePatch,
	handleLoadPatch,
	handleSharePatch,
	copyText,
	shareUrlFallback
} from './synth-patch';
import { midiConnectedDevice, midiDevices } from './synth-midi';
import { soundState, setMuted, setVolume } from './sound';
import { edgeTraceMs, loadEdgeTrace } from './edge';
import { openOnboardingNow, hotkeyOverlayOpen, globalSettingsOpen, creditsOpen, privacyOpen, consoleOverlayOpen } from './chrome';
import { KRSZ_MARKS } from '../krsz-marks';
import { TEXT_SIZES, textSize, textSizeAuto, setTextSize, setTextSizeAuto } from './text-scale';
import { isRecording, recSeconds, recError, startRecording, stopRecording, toggleRecording } from './recorder';
import { getLifelabControl, type LifelabControl } from './lifelab-bridge';
import { CATEGORIES, categoryMeta, patternMeta as lifelabPatternMeta } from '../components/lifelab/patterns.js';

export type LineKind = 'cmd' | 'out' | 'ok' | 'err' | 'accent' | 'gold';
export interface ConsoleLine {
	kind: LineKind;
	text: string;
}

/** Resolved lazily (called at store creation, not at module load) so the
 *  welcome line follows the locale detected from localStorage/the browser,
 *  which is not settled yet when this module is first evaluated. */
function welcomeLines(): ConsoleLine[] {
	return [{ kind: 'ok', text: tr('chrome.console.welcome') }];
}

const MAX_LINES = 300;
const HISTORY_KEY = 'krsz.console.history';
const ALIAS_KEY = 'krsz.console.aliases';

/** Scrollback buffer — lives in a store so it survives visiting /synth (which unmounts the console). */
export const consoleBuffer = writable<ConsoleLine[]>(welcomeLines());
/** Submitted commands, newest last — for ArrowUp/ArrowDown recall. Persisted across visits. */
export const commandHistory = writable<string[]>([]);
/** Virtual working directory, shown in the prompt and used to resolve relative paths. */
export const cwd = writable<string>('/');
/** User-defined `alias` expansions, persisted. */
export const aliases = writable<Record<string, string>>({});

function push(lines: ConsoleLine[]): void {
	if (lines.length === 0) return;
	consoleBuffer.update((buf) => [...buf, ...lines].slice(-MAX_LINES));
}

const out = (text: string): ConsoleLine => ({ kind: 'out', text });
const ok = (text: string): ConsoleLine => ({ kind: 'ok', text });
const err = (text: string): ConsoleLine => ({ kind: 'err', text });
const accent = (text: string): ConsoleLine => ({ kind: 'accent', text });

// ── persisted shell state ───────────────────────────────────────────────────

/** Restore history + aliases from localStorage. Safe to call more than once. */
export function initConsoleState(): void {
	if (!browser) return;
	try {
		const h = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]');
		if (Array.isArray(h)) commandHistory.set(h.filter((x) => typeof x === 'string').slice(-100));
	} catch {
		/* corrupt entry — start clean rather than block the console */
	}
	try {
		const a = JSON.parse(localStorage.getItem(ALIAS_KEY) ?? '{}');
		if (a && typeof a === 'object') aliases.set(a as Record<string, string>);
	} catch {
		/* same */
	}
}

function persist(key: string, value: unknown): void {
	if (!browser) return;
	try {
		localStorage.setItem(key, JSON.stringify(value));
	} catch {
		/* private mode / quota — the session still works, it just won't survive a reload */
	}
}

const NAV_WORDS: Record<string, number> = {
	'0': 0, modules: 0, projects: 0, cluster: 0, overview: 0, specs: 0,
	'1': 1, guestbook: 1, packets: 1,
	'2': 2, synth: 2, audio: 2,
	'3': 3, utilities: 3, utils: 3, tools: 3, hw: 3,
	'4': 4, 'lm-space': 4, lmspace: 4, leaderboard: 4, llm: 4, models: 4, ranks: 4,
	'5': 5, 'krsz-vm': 5, krszvm: 5, x86sim: 5, linux: 5, vm: 5, alpine: 5, x86: 5, sim: 5,
	'6': 6, 'web-lm': 6, weblm: 6, chatbot: 6, llm2: 6, gpu: 6, webgpu: 6,
	'7': 7, lifelab: 7, life: 7, conway: 7, gol: 7, automaton: 7
};

const THEME_ALIASES: Record<string, WorkspaceTheme> = {
	auto: 'auto',
	tokyo: 'tokyo-matte', 'tokyo-matte': 'tokyo-matte',
	gruvbox: 'gruvbox-dark', 'gruvbox-dark': 'gruvbox-dark',
	nord: 'nord-terminal', 'nord-terminal': 'nord-terminal',
	amber: 'cyber-amber', 'cyber-amber': 'cyber-amber'
};

const VALID_DIVS = ['4', '2', '1', '1/2', '1/3', '1/4', '1/6', '1/8', '1/12'];
const VALID_METERS = Object.keys(METER_SPECS);

/** Short forms accepted by `lang`, beyond the locale ids themselves. */
const LANG_ALIASES: Record<string, Locale | 'auto'> = {
	auto: 'auto',
	en: 'en',
	zh: 'zh-CN', cn: 'zh-CN', 'zh-cn': 'zh-CN',
	tw: 'zh-TW', 'zh-tw': 'zh-TW',
	jp: 'ja', ja: 'ja',
	kr: 'ko', ko: 'ko'
};

const SCALE_VALUES = TEXT_SIZES.map(String);

/** `life <sub>` control targets — kept as a plain list (see USAGE_COMMANDS'
 *  own comment) for ARG_COMPLETIONS without re-deriving it from runLife(). */
const LIFE_SUBCOMMANDS = ['run', 'pause', 'toggle', 'step', 'clear', 'random', 'speed', 'size', 'load', 'patterns', 'info'];

/** DNS RR types this shell's tiny wire-format codec knows how to build/parse. */
const DNS_TYPES: Record<string, number> = { A: 1, NS: 2, CNAME: 5, MX: 15, TXT: 16, AAAA: 28 };
const DNS_TYPE_NAMES: Record<number, string> = Object.fromEntries(Object.entries(DNS_TYPES).map(([k, v]) => [v, k]));

/** Every VFS text file `fortune` may quote from — real content the console already serves. */
const FORTUNE_SOURCES = ['/operator/profile.txt', '/etc/motd', '/etc/hotkeys'];

/** Cancels whatever long-running console animation (currently just `sl`) is in
 *  flight -- CommandConsole.svelte calls this on Esc/Ctrl+C. null when idle. */
export const cancelActiveAnimation = writable<(() => void) | null>(null);

const BANNER_TAGLINE = " Kurashizu's Random-Stuff Zone — 100% serverless edge";

/** Picks one of the same ten figlet renderings the Sidebar mark uses (see
 *  lib/krsz-marks.ts) so `banner` isn't always the identical block of text --
 *  a fresh pick per invocation, same idea as a real terminal's `fortune`. */
function rollBanner(): string[] {
	const mark = KRSZ_MARKS[Math.floor(Math.random() * KRSZ_MARKS.length)];
	return [...mark.art.split('\n'), '', BANNER_TAGLINE];
}

/** Resolved lazily (called at use time, not at module load) so the console
 *  help text follows the active locale. The command syntax/flags stay as
 *  literal shell text (README: command names stay English); only the
 *  trailing descriptions are translated. */
function helpLines(): ConsoleLine[] {
	return [
		accent('── NAVIGATION ──────────────────────────────'),
		out('  0|modules  1|guestbook  2|synth  3|utils  4|lm-space  5|krsz-vm  6|web-lm  7|lifelab'),
		out(`  open <project>     ${tr('chrome.console.help.open')}`),
		out('  ' + Object.keys(EXTERNAL_LINKS).filter((k) => k !== 'rules').join(' · ')),
		accent('── FILESYSTEM ──────────────────────────────'),
		out('  pwd · cd <path> · ls [-l] [path] · tree [path]'),
		out(`  cat <file>      ${tr('chrome.console.help.cat')}`),
		out(`  grep [-i] <pat> [file]   ${tr('chrome.console.help.grep')}`),
		out('  head/tail [-n N] · sort · uniq · wc'),
		out(`  cmd | cmd       ${tr('chrome.console.help.pipe')}`),
		out('  alias ll="ls -l" · unalias ll'),
		accent('── EDGE ────────────────────────────────────'),
		out(`  trace (edge)   ${tr('chrome.console.help.trace')}`),
		accent('── INFO ────────────────────────────────────'),
		out(`  whoami      ${tr('chrome.console.help.whoami')}`),
		out(`  tracks      ${tr('chrome.console.help.tracks')}`),
		out(`  songs       ${tr('chrome.console.help.songs')}`),
		out(`  midi        ${tr('chrome.console.help.midi')}`),
		out(`  date        ${tr('chrome.console.help.date')}`),
		out(`  history     ${tr('chrome.console.help.history')}`),
		out(`  banner      ${tr('chrome.console.help.banner')}`),
		out(`  man <cmd>   ${tr('chrome.console.help.man')}`),
		accent('── SYNTH ───────────────────────────────────'),
		out(`  play / stop / seq        ${tr('chrome.console.help.transport')}`),
		out(`  load <song>              ${tr('chrome.console.help.load')}`),
		out(`  bpm [40-300]             ${tr('chrome.console.help.bpm')}`),
		out(`  vol [0-100] · mute · unmute   ${tr('chrome.console.help.vol')}`),
		out(`  snap <div> · dur <div>   ${tr('chrome.console.help.snapDur')}`),
		out(`  meter <sig>              4/4 3/4 2/4 5/4 6/8 7/8`),
		out(`  blend <layer|fm|ring|sync>   ${tr('chrome.console.help.blend')}`),
		accent('── LIFE.LAB ─────────────────────────────────'),
		out(`  life run|pause|toggle|step [n]         ${tr('chrome.console.help.lifeRun')}`),
		out(`  life clear|random [d]|speed <n>        ${tr('chrome.console.help.lifeEdit')}`),
		out(`  life size <W>x<H>|load <pat>|patterns  ${tr('chrome.console.help.lifeBoard')}`),
		out(`  life info                              ${tr('chrome.console.help.lifeInfo')}`),
		accent('── SYSTEM ───────────────────────────────────'),
		out(`  sysinfo|neofetch|fetch   ${tr('chrome.console.help.sysinfo')}`),
		out(`  uptime                   ${tr('chrome.console.help.uptime')}`),
		out(`  ver | version            ${tr('chrome.console.help.ver')}`),
		out(`  lang [locale]            ${tr('chrome.console.help.lang')}`),
		out(`  scale [size|auto]        ${tr('chrome.console.help.scale')}`),
		out(`  settings · credits · privacy   ${tr('chrome.console.help.dialogs')}`),
		out(`  exit | quit | q          ${tr('chrome.console.help.exit')}`),
		accent('── RECORDING / PATCH ────────────────────────'),
		out(`  rec start|stop|toggle          ${tr('chrome.console.help.rec')}`),
		out(`  patch new|save|load|share      ${tr('chrome.console.help.patch')}`),
		accent('── TOOLS ────────────────────────────────────'),
		out(`  dig <name> [type]             ${tr('chrome.console.help.dig')}`),
		out(`  sha256/sha1 · base64 [-d] · hex   ${tr('chrome.console.help.hash')}`),
		out(`  uuid · random [max] · roll NdM    ${tr('chrome.console.help.rand')}`),
		out(`  unix [ts|iso]                 ${tr('chrome.console.help.unix')}`),
		out(`  which <cmd>                   ${tr('chrome.console.help.which')}`),
		out(`  fonts · fortune                ${tr('chrome.console.help.miscTools')}`),
		out(`  cowsay <text> · sl             ${tr('chrome.console.help.fun')}`),
		accent('── HISTORY & CHAINING ───────────────────────'),
		out(`  !! · !n · !prefix              ${tr('chrome.console.help.bang')}`),
		out(`  cmd ; cmd  ·  cmd && cmd        ${tr('chrome.console.help.chain')}`),
		out(`  history -c                     ${tr('chrome.console.help.historyClear')}`),
		accent('── MISC ────────────────────────────────────'),
		out(`  eval <expr>     ${tr('chrome.console.help.eval')}`),
		out(`  echo <text>     ${tr('chrome.console.help.echo')}`),
		out(`  theme [name]    ${tr('chrome.console.help.theme')}`),
		out(`  clear / Ctrl+L  ${tr('chrome.console.help.clear')}`),
		out(`  guide           ${tr('chrome.console.help.guide')}`),
		out(`  \` (backquote)   ${tr('chrome.console.help.backquote')}`),
		out(`  keys            ${tr('chrome.console.help.keys')}`)
	];
}

/** One-line usage strings for `man <cmd>`, resolved lazily (see helpLines). */
function usageTable(): Record<string, string[]> {
	return {
		cd: ['cd [path]', tr('chrome.console.usage.cd1'), tr('chrome.console.usage.cd2')],
		ls: ['ls [-l] [path]', tr('chrome.console.usage.ls')],
		cat: ['cat <file>', tr('chrome.console.usage.cat')],
		tree: ['tree [path]', tr('chrome.console.usage.tree')],
		grep: ['grep [-i] <pattern> [file]', tr('chrome.console.usage.grep1'), tr('chrome.console.usage.grep2')],
		head: ['head [-n N] [file]', tr('chrome.console.usage.head')],
		tail: ['tail [-n N] [file]', tr('chrome.console.usage.tail')],
		wc: ['wc [file]', tr('chrome.console.usage.wc')],
		sort: ['sort [-r] [file]', tr('chrome.console.usage.sort')],
		uniq: ['uniq [file]', tr('chrome.console.usage.uniq')],
		alias: ['alias [name="command"]', tr('chrome.console.usage.alias')],
		unalias: ['unalias <name>', tr('chrome.console.usage.unalias')],
		trace: ['trace', tr('chrome.console.usage.trace1'), tr('chrome.console.usage.trace2')],
		open: ['open <project>', tr('chrome.console.usage.open')],
		eval: ['eval <expression>', tr('chrome.console.usage.eval')],
		bpm: ['bpm [40-300]', tr('chrome.console.usage.bpm')],
		vol: ['vol [0-100]', tr('chrome.console.usage.vol')],
		load: ['load <song>', tr('chrome.console.usage.load')],
		theme: ['theme [name]', tr('chrome.console.usage.theme', { list: Object.keys(THEME_ALIASES).join(', ') })],
		echo: ['echo <text>', tr('chrome.console.usage.echo')],
		history: ['history', tr('chrome.console.usage.history')],
		guide: ['guide', tr('chrome.console.usage.guide')],
		keys: ['keys', tr('chrome.console.usage.keys')],
		man: ['man <cmd>', tr('chrome.console.usage.man')],
		help: ['help', tr('chrome.console.usage.help')],
		whoami: ['whoami', tr('chrome.console.usage.whoami')],
		date: ['date', tr('chrome.console.usage.date')],
		tracks: ['tracks', tr('chrome.console.usage.tracks')],
		songs: ['songs', tr('chrome.console.usage.songs')],
		midi: ['midi', tr('chrome.console.usage.midi')],
		banner: ['banner', tr('chrome.console.usage.banner')],
		play: ['play', tr('chrome.console.usage.play')],
		stop: ['stop', tr('chrome.console.usage.stop')],
		seq: ['seq', tr('chrome.console.usage.seq')],
		mute: ['mute', tr('chrome.console.usage.mute')],
		unmute: ['unmute', tr('chrome.console.usage.unmute')],
		snap: ['snap <div>', tr('chrome.console.usage.snap', { list: VALID_DIVS.join(', ') })],
		dur: ['dur <div>', tr('chrome.console.usage.dur', { list: VALID_DIVS.join(', ') })],
		meter: ['meter <sig>', tr('chrome.console.usage.meter', { list: VALID_METERS.join(', ') })],
		blend: ['blend <mode>', tr('chrome.console.usage.blend')],
		clear: ['clear', tr('chrome.console.usage.clear')],
		pwd: ['pwd', tr('chrome.console.usage.pwd')],
		lang: ['lang [en|zh-CN|zh-TW|ja|ko|auto]', tr('chrome.console.usage.lang')],
		life: ['life <sub>', tr('chrome.console.usage.life1'), tr('chrome.console.usage.life2')],
		sysinfo: ['sysinfo', tr('chrome.console.usage.sysinfo')],
		uptime: ['uptime', tr('chrome.console.usage.uptime')],
		ver: ['ver', tr('chrome.console.usage.ver')],
		settings: ['settings', tr('chrome.console.usage.settings')],
		credits: ['credits', tr('chrome.console.usage.credits')],
		privacy: ['privacy', tr('chrome.console.usage.privacy')],
		exit: ['exit', tr('chrome.console.usage.exit')],
		scale: ['scale [12|14|16|20|24|auto]', tr('chrome.console.usage.scale')],
		rec: ['rec start|stop|toggle', tr('chrome.console.usage.rec')],
		patch: ['patch new|save|load|share', tr('chrome.console.usage.patch')],
		dig: ['dig <name> [type]', tr('chrome.console.usage.dig1'), tr('chrome.console.usage.dig2')],
		sha256: ['sha256 <text>', tr('chrome.console.usage.sha256')],
		sha1: ['sha1 <text>', tr('chrome.console.usage.sha1')],
		base64: ['base64 [-d] <text>', tr('chrome.console.usage.base64')],
		hex: ['hex <text>', tr('chrome.console.usage.hex')],
		uuid: ['uuid', tr('chrome.console.usage.uuid')],
		random: ['random [max]', tr('chrome.console.usage.random')],
		roll: ['roll NdM', tr('chrome.console.usage.roll')],
		unix: ['unix [ts|iso]', tr('chrome.console.usage.unix')],
		which: ['which <cmd>', tr('chrome.console.usage.which')],
		fonts: ['fonts', tr('chrome.console.usage.fonts')],
		fortune: ['fortune', tr('chrome.console.usage.fortune')],
		cowsay: ['cowsay <text>', tr('chrome.console.usage.cowsay')],
		sl: ['sl', tr('chrome.console.usage.sl')]
	};
}

// ── pipe filters ────────────────────────────────────────────────────────────

/** Pull the value of a `-n N`-style flag out of the token list, mutating it. */
function takeFlagValue(tokens: string[], flag: string): string | null {
	const i = tokens.indexOf(flag);
	if (i === -1) return null;
	const value = tokens[i + 1] ?? null;
	tokens.splice(i, value === null ? 1 : 2);
	return value;
}

function takeFlag(tokens: string[], flag: string): boolean {
	const i = tokens.indexOf(flag);
	if (i === -1) return false;
	tokens.splice(i, 1);
	return true;
}

/** Filter input: piped lines when present, otherwise the named file. */
function filterInput(stdin: ConsoleLine[] | null, path: string | undefined, base: string): ConsoleLine[] | ConsoleLine {
	if (stdin) return stdin;
	if (!path) return err(tr('chrome.console.run.noInput'));
	const node = lookup(resolvePath(base, path));
	if (!node) return err(tr('chrome.console.run.noSuchFile', { path }));
	if (node.type === 'dir') return err(tr('chrome.console.run.isADirectory', { path }));
	return node.read().map(out);
}

// ── command execution ───────────────────────────────────────────────────────

interface Ctx {
	stdin: ConsoleLine[] | null;
	/** True when this segment is part of a `|` chain — suppresses eager side-effect logging. */
	piped: boolean;
}

async function runOne(segment: string, ctx: Ctx): Promise<ConsoleLine[]> {
	const tokens = segment.trim().split(/\s+/).filter(Boolean);
	if (tokens.length === 0) return [];
	const cmd = tokens[0].toLowerCase();
	const rest = tokens.slice(1);
	const args = rest.join(' ');
	const base = get(cwd);

	// ── LIFE.LAB control (checked ahead of NAV_WORDS: `life` alone still
	// navigates to tab 7 via the branch below, `life <sub>` controls the dish) ──
	if (cmd === 'life' && rest.length > 0) return runLife(rest);

	// ── navigation ──
	if (cmd in NAV_WORDS) {
		const tab = NAV_WORDS[cmd];
		goto(TAB_ROUTES[tab]);
		return [ok(tr('chrome.console.run.navigatedTo', { path: TAB_ROUTES[tab] }))];
	}

	if (cmd === 'open') {
		const key = args.trim().toLowerCase();
		const url = EXTERNAL_LINKS[key] ?? MODULES.find((m) => m.id === key)?.url;
		if (!url) return [err(tr('chrome.console.run.unknownProject', { key, list: Object.keys(EXTERNAL_LINKS).join(', ') }))];
		window.open(url, '_blank');
		return [ok(tr('chrome.console.run.opened', { url }))];
	}

	if (cmd in EXTERNAL_LINKS) {
		window.open(EXTERNAL_LINKS[cmd], '_blank');
		return [ok(tr('chrome.console.run.opened', { url: EXTERNAL_LINKS[cmd] }))];
	}

	// ── edge ──
	if (cmd === 'trace' || cmd === 'edge') {
		if (!ctx.piped) push([accent(tr('chrome.console.run.gettingTrace'))]);
		const t = await loadEdgeTrace(true);
		if (!t) return [err(tr('chrome.console.run.edgeTraceUnavailable'))];
		const ms = get(edgeTraceMs);
		return [
			accent(tr('chrome.console.run.edgeHeading')),
			ok(`  colo        ${t.colo}${t.loc ? `  (${t.loc})` : ''}   serving PoP`),
			out(`  protocol    ${t.http}`),
			out(`  tls         ${t.tls}${t.kex ? `  kex=${t.kex}` : ''}`),
			out(`  scheme      ${t.scheme}`),
			out(`  client ip   ${t.ip}`),
			out(`  warp        ${t.warp}`),
			out(`  request id  ${t.fl}`),
			...(ms === null ? [] : [ok(`  trace rtt   ${ms}ms (browser-measured)`)])
		];
	}

	// ── filesystem ──
	if (cmd === 'pwd') return [out(get(cwd))];

	if (cmd === 'cd') {
		const target = args.trim() ? resolvePath(base, args.trim()) : '/';
		const node = lookup(target);
		if (!node) return [err(tr('chrome.console.run.cdNoSuchDir', { path: args.trim() }))];
		if (node.type !== 'dir') return [err(tr('chrome.console.run.cdNotADir', { path: args.trim() }))];
		cwd.set(target);
		return [ok(target)];
	}

	if (cmd === 'ls' || cmd === 'll' || cmd === 'dir') {
		const flags = [...rest];
		const long = takeFlag(flags, '-l') || cmd === 'll';
		const target = resolvePath(base, flags[0] ?? '.');
		const node = lookup(target);
		if (!node) return [err(tr('chrome.console.run.lsNoSuchPath', { path: flags[0] ?? target }))];
		if (node.type === 'file') return [out(formatEntry(node, long))];
		if (node.children.length === 0) return [out(tr('chrome.console.run.empty'))];
		return [
			accent(tr('chrome.console.run.entriesHeading', { path: target === '/' ? '/' : target, count: node.children.length })),
			...node.children.map((c) => out(formatEntry(c, long)))
		];
	}

	if (cmd === 'cat') {
		if (!args.trim()) return [err(tr('chrome.console.run.usageCat'))];
		const node = lookup(resolvePath(base, args.trim()));
		if (!node) return [err(tr('chrome.console.run.catNoSuchFile', { path: args.trim() }))];
		if (node.type === 'dir') return [err(tr('chrome.console.run.catIsADir', { path: args.trim() }))];
		return node.read().map(out);
	}

	if (cmd === 'tree') {
		const target = resolvePath(base, args.trim() || '.');
		const node = lookup(target);
		if (!node) return [err(tr('chrome.console.run.treeNoSuchPath', { path: args.trim() }))];
		return [accent(target === '/' ? '/' : target), ...renderTree(node).map(out)];
	}

	// ── pipe filters ──
	if (cmd === 'grep') {
		const flags = [...rest];
		const insensitive = takeFlag(flags, '-i');
		const pattern = flags.shift();
		if (!pattern) return [err(tr('chrome.console.run.usageGrep'))];
		const input = filterInput(ctx.stdin, flags[0], base);
		if (!Array.isArray(input)) return [input];
		let re: RegExp;
		try {
			re = new RegExp(pattern, insensitive ? 'i' : '');
		} catch {
			return [err(tr('chrome.console.run.grepInvalidPattern', { pattern }))];
		}
		const hits = input.filter((l) => re.test(l.text));
		return hits.length ? hits : [out(tr('chrome.console.run.noMatch', { pattern }))];
	}

	if (cmd === 'head' || cmd === 'tail') {
		const flags = [...rest];
		const n = parseInt(takeFlagValue(flags, '-n') ?? '10', 10);
		const input = filterInput(ctx.stdin, flags[0], base);
		if (!Array.isArray(input)) return [input];
		const count = isNaN(n) || n < 1 ? 10 : n;
		return cmd === 'head' ? input.slice(0, count) : input.slice(-count);
	}

	if (cmd === 'wc') {
		const input = filterInput(ctx.stdin, rest[0], base);
		if (!Array.isArray(input)) return [input];
		const words = input.reduce((a, l) => a + l.text.split(/\s+/).filter(Boolean).length, 0);
		const chars = input.reduce((a, l) => a + l.text.length, 0);
		return [out(tr('chrome.console.run.wcSummary', { lines: input.length, words, chars }))];
	}

	if (cmd === 'sort') {
		const flags = [...rest];
		const reverse = takeFlag(flags, '-r');
		const input = filterInput(ctx.stdin, flags[0], base);
		if (!Array.isArray(input)) return [input];
		const sorted = [...input].sort((a, b) => a.text.localeCompare(b.text));
		return reverse ? sorted.reverse() : sorted;
	}

	if (cmd === 'uniq') {
		const input = filterInput(ctx.stdin, rest[0], base);
		if (!Array.isArray(input)) return [input];
		return input.filter((l, i) => i === 0 || l.text !== input[i - 1].text);
	}

	// ── aliases ──
	if (cmd === 'alias') {
		if (!args.trim()) {
			const all = get(aliases);
			const names = Object.keys(all).sort();
			return names.length
				? [accent(tr('chrome.console.run.aliasesHeading')), ...names.map((n) => out(`  ${n.padEnd(10)} ${all[n]}`))]
				: [out(tr('chrome.console.run.noAliases'))];
		}
		const m = args.match(/^(\w+)\s*=\s*(.+)$/);
		if (!m) return [err(tr('chrome.console.run.usageAlias'))];
		const value = m[2].replace(/^['"]|['"]$/g, '');
		if (RESERVED_ALIAS_NAMES.has(m[1].toLowerCase())) return [err(tr('chrome.console.run.aliasReserved', { name: m[1] }))];
		aliases.update((a) => {
			const next = { ...a, [m[1]]: value };
			persist(ALIAS_KEY, next);
			return next;
		});
		return [ok(tr('chrome.console.run.aliasSet', { name: m[1], value }))];
	}

	if (cmd === 'unalias') {
		const name = args.trim();
		if (!(name in get(aliases))) return [err(tr('chrome.console.run.unaliasNoSuchAlias', { name }))];
		aliases.update((a) => {
			const next = { ...a };
			delete next[name];
			persist(ALIAS_KEY, next);
			return next;
		});
		return [ok(tr('chrome.console.run.aliasRemoved', { name }))];
	}

	// ── info ──
	if (cmd === 'help' || cmd === '?') return helpLines();

	if (cmd === 'guide' || cmd === 'tour' || cmd === 'intro') {
		openOnboardingNow('site-tour');
		return [ok(tr('chrome.console.openedWalkthrough'))];
	}

	if (cmd === 'keys' || cmd === 'keymap') {
		hotkeyOverlayOpen.set(true);
		return [ok(tr('chrome.console.openedKeymap'))];
	}

	if (cmd === 'man') {
		const name = args.trim().toLowerCase();
		if (!name) return helpLines();
		const page = usageTable()[name];
		if (!page) return [err(tr('chrome.console.noManualEntry', { name }))];
		return [accent(page[0]), ...page.slice(1).map((l) => out(`  ${l}`))];
	}

	if (cmd === 'whoami' || cmd === 'about') {
		const node = lookup('/operator/profile.txt');
		return node && node.type === 'file' ? node.read().map(out) : [err(tr('chrome.console.run.profileUnavailable'))];
	}

	if (cmd === 'tracks' || cmd === 'trk') {
		const tracks = get(tracksState);
		const active = get(activeTrackId);
		return [
			accent(tr('chrome.console.run.seqTracksHeading')),
			...tracks.map((t) =>
				out(`  ${t.id === active ? '▶' : ' '} ${t.name.padEnd(24)} ${t.muted ? '[MUTED]' : '       '} ${t.solo ? '[SOLO]' : ''}`)
			)
		];
	}

	if (cmd === 'songs') {
		const current = get(builtinSongIdx);
		return [
			accent(tr('chrome.console.run.builtinSongsHeading')),
			...BUILTIN_SONGS.map((s, i) =>
				out(`  ${i === current ? '●' : '○'} ${s.name.padEnd(20)} ${String(s.bpm).padStart(3)}bpm · ${s.meter} · ${s.steps} steps`)
			)
		];
	}

	if (cmd === 'load') {
		const q = args.trim().toLowerCase();
		if (!q) return [err(tr('chrome.console.run.usageLoad'))];
		const idx = BUILTIN_SONGS.findIndex((s) => s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q));
		if (idx === -1) return [err(tr('chrome.console.run.noSongMatch', { q }))];
		handleLoadBuiltinSong(idx);
		return [ok(tr('chrome.console.run.loadedSong', { name: BUILTIN_SONGS[idx].name, bpm: BUILTIN_SONGS[idx].bpm, meter: BUILTIN_SONGS[idx].meter }))];
	}

	if (cmd === 'midi') {
		const device = get(midiConnectedDevice);
		const devices = get(midiDevices);
		return device
			? [ok(tr('chrome.console.run.midiConnected', { device })), ...devices.map((d) => out(`  · ${d.name}`))]
			: [out(tr('chrome.console.run.midiStandby'))];
	}

	if (cmd === 'date' || cmd === 'time') {
		const now = new Date();
		const syd = new Intl.DateTimeFormat(get(locale), {
			timeZone: 'Australia/Sydney',
			dateStyle: 'medium',
			timeStyle: 'medium'
		}).format(now);
		return [out(`SYDNEY  ${syd}`), out(`UTC     ${now.toISOString().replace('T', ' ').slice(0, 19)}`)];
	}

	if (cmd === 'history') {
		const h = get(commandHistory).slice(0, -1).slice(-15);
		return h.length ? h.map((c, i) => out(`  ${String(i + 1).padStart(2)}  ${c}`)) : [out(tr('chrome.console.run.historyEmpty'))];
	}

	if (cmd === 'banner') return rollBanner().map((l) => ({ kind: 'gold' as LineKind, text: l }));

	// ── synth ──
	if (cmd === 'play') {
		setMuted(false);
		play();
		return [ok(tr('chrome.console.run.sequencerPlaying'))];
	}
	if (cmd === 'stop') {
		stop();
		return [ok(tr('chrome.console.run.sequencerStopped'))];
	}
	if (cmd === 'seq' || cmd === 'sequence') {
		const playing = toggleSeq();
		if (playing) setMuted(false);
		return [ok(tr('chrome.console.run.sequencerToggled', { state: playing ? tr('chrome.console.run.statePlaying') : tr('chrome.console.run.stateStopped') }))];
	}

	if (cmd === 'bpm') {
		if (!args) return [out(tr('chrome.console.run.bpmStatus', { bpm: get(bpm), state: get(isSeqPlaying) ? tr('chrome.console.run.statePlaying') : tr('chrome.console.run.stateStopped') }))];
		const val = parseInt(args, 10);
		if (isNaN(val) || val < 40 || val > 300) return [err(tr('chrome.console.run.invalidBpm', { value: args }))];
		setBpm(val);
		return [ok(tr('chrome.console.run.bpmSet', { value: val }))];
	}

	if (cmd === 'vol' || cmd === 'volume') {
		if (!args) return [out(tr('chrome.console.run.volumeStatus', { percent: Math.round(get(soundState).volume * 100), muted: get(soundState).muted ? tr('chrome.console.run.volumeMutedSuffix') : '' }))];
		const val = parseInt(args, 10);
		if (isNaN(val) || val < 0 || val > 100) return [err(tr('chrome.console.run.invalidVolume', { value: args }))];
		setVolume(val / 100);
		setMuted(false);
		return [ok(tr('chrome.console.run.volumeSet', { value: val }))];
	}

	if (cmd === 'mute') {
		setMuted(true);
		return [ok(tr('chrome.console.run.muted'))];
	}
	if (cmd === 'unmute') {
		setMuted(false);
		return [ok(tr('chrome.console.run.unmuted'))];
	}

	if (cmd === 'snap' || cmd === 'dur') {
		const div = args.trim();
		if (!VALID_DIVS.includes(div)) return [err(tr('chrome.console.run.usageSnapDur', { cmd, list: VALID_DIVS.join(' ') }))];
		if (cmd === 'snap') setSnapDiv(div as NoteDurationDiv);
		else setNoteDur(div as NoteDurationDiv);
		return [ok(cmd === 'snap' ? tr('chrome.console.run.gridSnapSet', { value: div }) : tr('chrome.console.run.noteDurationSet', { value: div }))];
	}

	if (cmd === 'meter') {
		const sig = args.trim();
		if (!VALID_METERS.includes(sig)) return [err(tr('chrome.console.run.usageMeter', { list: VALID_METERS.join(' ') }))];
		setTimeMeter(sig as TimeSignature);
		return [ok(tr('chrome.console.run.meterSet', { value: sig }))];
	}

	if (cmd === 'blend') {
		const mode = args.toLowerCase();
		if (!['layer', 'fm', 'ring', 'sync'].includes(mode)) return [err(tr('chrome.console.run.usageBlend'))];
		updateActiveTrack({ blendMode: mode as BlendMode });
		return [ok(tr('chrome.console.run.blendSet', { track: get(activeTrackId) + 1, mode: mode.toUpperCase() }))];
	}

	// ── misc ──
	if (cmd === 'eval' || cmd === 'calc' || cmd === 'js') return [out(`=> ${evaluateSafeJS(args)}`)];

	if (cmd === 'echo') return [out(args)];

	if (cmd === 'theme') {
		const q = args.trim().toLowerCase();
		if (!q) {
			cycleTheme();
			const t = get(theme);
			return [ok(tr('chrome.console.run.themeStatus', { theme: t === 'auto' ? `auto (${get(resolvedTheme)})` : t }))];
		}
		const t = THEME_ALIASES[q];
		if (!t) return [err(tr('chrome.console.run.unknownTheme', { q, list: Object.keys(THEME_ALIASES).join(', ') }))];
		theme.set(t);
		return [ok(tr('chrome.console.run.themeSet', { theme: t }))];
	}

	if (cmd === 'clear' || cmd === 'cls') {
		consoleBuffer.set([]);
		return [];
	}

	// ── language ──
	if (cmd === 'lang' || cmd === 'language') {
		const q = args.trim().toLowerCase();
		if (!q) {
			const l = get(locale);
			const row = LOCALES.find((x) => x.id === l);
			return [
				out(tr('chrome.console.run.langStatus', { locale: l, native: row?.native ?? l, mode: get(localeAuto) ? tr('chrome.console.run.langAuto') : tr('chrome.console.run.langManual') })),
				out(`  ${LOCALE_IDS.join(', ')}`)
			];
		}
		const target = (LOCALE_IDS as readonly string[]).includes(q) ? (q as Locale) : LANG_ALIASES[q];
		if (!target) return [err(tr('chrome.console.run.unknownLang', { q, list: [...LOCALE_IDS, 'auto'].join(', ') }))];
		setLocale(target);
		return [ok(tr('chrome.console.run.langSet', { locale: target === 'auto' ? `auto (${get(locale)})` : target }))];
	}

	// ── text scale ──
	if (cmd === 'scale') {
		const q = args.trim().toLowerCase();
		if (!q) return [out(tr('chrome.console.run.scaleStatus', { px: get(textSize), mode: get(textSizeAuto) ? tr('chrome.console.run.langAuto') : tr('chrome.console.run.langManual') }))];
		if (q === 'auto') {
			setTextSizeAuto();
			return [ok(tr('chrome.console.run.scaleSetAuto', { px: get(textSize) }))];
		}
		const px = parseInt(q, 10);
		if (!SCALE_VALUES.includes(q) || isNaN(px)) return [err(tr('chrome.console.run.usageScale', { list: [...SCALE_VALUES, 'auto'].join(', ') }))];
		setTextSize(px);
		return [ok(tr('chrome.console.run.scaleSet', { px }))];
	}

	// ── dialogs / overlay control ──
	if (cmd === 'settings' || cmd === 'config') {
		globalSettingsOpen.set(true);
		return [ok(tr('chrome.console.run.openedSettings'))];
	}
	if (cmd === 'credits') {
		creditsOpen.set(true);
		return [ok(tr('chrome.console.run.openedCredits'))];
	}
	if (cmd === 'privacy') {
		privacyOpen.set(true);
		return [ok(tr('chrome.console.run.openedPrivacy'))];
	}
	if (cmd === 'exit' || cmd === 'quit' || cmd === 'q') {
		consoleOverlayOpen.set(false);
		return [ok(tr('chrome.console.run.closedConsole'))];
	}

	// ── recorder ──
	if (cmd === 'rec' || cmd === 'record') {
		const sub = args.trim().toLowerCase();
		if (sub === 'start') {
			startRecording();
		} else if (sub === 'stop') {
			stopRecording();
		} else if (sub === 'toggle' || !sub) {
			toggleRecording();
		} else {
			return [err(tr('chrome.console.usage.rec'))];
		}
		const recording = get(isRecording);
		const errText = get(recError);
		if (errText && !recording) return [err(errText)];
		return [ok(recording ? tr('chrome.console.run.recStarted') : tr('chrome.console.run.recStopped', { seconds: get(recSeconds) }))];
	}

	// ── synth patch ──
	if (cmd === 'patch') {
		const sub = args.trim().toLowerCase();
		if (sub === 'new') {
			handleNewProject();
			return [ok(tr('chrome.console.run.patchNew'))];
		}
		if (sub === 'save') {
			handleSavePatch();
			return [ok(tr('chrome.console.run.patchSaved'))];
		}
		if (sub === 'load') {
			handleLoadPatch();
			return [ok(tr('chrome.console.run.patchLoaded'))];
		}
		if (sub === 'share') {
			await handleSharePatch();
			const fallback = get(shareUrlFallback);
			if (fallback) return [out(fallback)];
			return [ok(tr('chrome.console.run.patchShared'))];
		}
		return [err(tr('chrome.console.usage.patch'))];
	}

	// ── build / session info ──
	if (cmd === 'ver' || cmd === 'version') {
		return [
			out(`build   ${__BUILD_COMMIT__}`),
			out(`time    ${__BUILD_TIME__}`),
			out(`sydney  ${__BUILD_TIME_SYDNEY__}`)
		];
	}

	if (cmd === 'uptime') return runUptime();

	if (cmd === 'sysinfo' || cmd === 'neofetch' || cmd === 'fetch') return await runSysinfo();

	// ── DNS ──
	if (cmd === 'dig') return await runDig(rest);

	// ── hash / encoding tools (stdin-aware) ──
	if (cmd === 'sha256' || cmd === 'sha1') return await runHash(cmd, ctx.stdin, args);
	if (cmd === 'base64') return await runBase64(rest, ctx.stdin, args);
	if (cmd === 'hex') return runHex(ctx.stdin, args);
	if (cmd === 'uuid') return [out(crypto.randomUUID())];
	if (cmd === 'random') return runRandom(args);
	if (cmd === 'roll') return runRoll(args);
	if (cmd === 'unix') return runUnix(args);
	if (cmd === 'which') return runWhich(args);
	if (cmd === 'fonts') return runFonts();
	if (cmd === 'fortune') return runFortune();
	if (cmd === 'cowsay') return runCowsay(ctx.stdin, args);
	if (cmd === 'sl') return runTrain();

	return [err(tr('chrome.console.run.commandNotRecognized', { cmd }))];
}

// ── LIFE.LAB ─────────────────────────────────────────────────────────────────

/** Every key `patterns.js`'s library covers, flattened for `life patterns` / tab completion. */
function lifePatternKeys(): string[] {
	return CATEGORIES.flatMap((c: { of: string[] }) => c.of);
}

async function runLife(rest: string[]): Promise<ConsoleLine[]> {
	const sub = (rest[0] ?? '').toLowerCase();
	const subArgs = rest.slice(1);
	if (!LIFE_SUBCOMMANDS.includes(sub)) return [err(tr('chrome.console.usage.life2'))];

	if (page.url.pathname !== TAB_ROUTES[7]) {
		goto(TAB_ROUTES[7]);
		return [accent(tr('chrome.console.run.lifeLoading'))];
	}

	const api: LifelabControl | null = await getLifelabControl();
	if (!api) return [err(tr('chrome.console.run.lifeNotReady'))];

	switch (sub) {
		case 'run':
			api.run();
			return [ok(tr('chrome.console.run.lifeRunning'))];
		case 'pause':
			api.pause();
			return [ok(tr('chrome.console.run.lifePaused'))];
		case 'toggle': {
			api.toggle();
			const info = api.info();
			return [ok(info.running ? tr('chrome.console.run.lifeRunning') : tr('chrome.console.run.lifePaused'))];
		}
		case 'step': {
			const n = subArgs[0] ? parseInt(subArgs[0], 10) : 1;
			if (isNaN(n) || n < 1) return [err(tr('chrome.console.usage.life2'))];
			api.step(n);
			return [ok(tr('chrome.console.run.lifeStepped', { n }))];
		}
		case 'clear':
			api.clear();
			return [ok(tr('chrome.console.run.lifeCleared'))];
		case 'random': {
			const d = subArgs[0] ? parseFloat(subArgs[0]) : undefined;
			if (d !== undefined && (isNaN(d) || d <= 0 || d > 1)) return [err(tr('chrome.console.run.lifeBadDensity'))];
			api.random(d);
			return [ok(tr('chrome.console.run.lifeRandomized', { pct: Math.round((d ?? 0.12) * 100) }))];
		}
		case 'speed': {
			const n = parseInt(subArgs[0] ?? '', 10);
			if (isNaN(n) || !api.setSpeed(n)) return [err(tr('chrome.console.run.lifeBadSpeed', { list: api.speeds().join(', ') }))];
			return [ok(tr('chrome.console.run.lifeSpeedSet', { n }))];
		}
		case 'size': {
			const m = (subArgs[0] ?? '').match(/^(\d+)x(\d+)$/i);
			if (!m) return [err(tr('chrome.console.usage.life2'))];
			const w = Math.max(4, Math.min(4000, parseInt(m[1], 10)));
			const h = Math.max(4, Math.min(4000, parseInt(m[2], 10)));
			const size = api.resize(w, h);
			return [ok(tr('chrome.console.run.lifeResized', { w: size.w, h: size.h }))];
		}
		case 'load': {
			const q = subArgs.join(' ').trim();
			if (!q) return [err(tr('chrome.console.usage.life2'))];
			const keys = lifePatternKeys();
			const key = keys.find((k) => k.toLowerCase() === q.toLowerCase()) ?? keys.find((k) => k.toLowerCase().includes(q.toLowerCase()));
			if (!key || !api.loadPattern(key)) return [err(tr('chrome.console.run.lifeNoPattern', { q }))];
			const meta = api.patternMeta(key);
			return [ok(tr('chrome.console.run.lifeLoaded', { label: meta?.label ?? key }))];
		}
		case 'patterns':
			return [
				accent(tr('chrome.console.run.lifePatternsHeading')),
				...(CATEGORIES as { id: string; label: string; hint: string; of: string[] }[]).flatMap((c) => {
					const meta = categoryMeta(c);
					return [accent(`  ${meta.label}`), ...c.of.map((k) => out(`    ${k.padEnd(16)} ${lifelabPatternMeta(k)?.label ?? ''}`))];
				})
			];
		case 'info': {
			const info = api.info();
			return [
				accent(tr('chrome.console.run.lifeInfoHeading')),
				out(`  generation   ${info.gen}`),
				out(`  population   ${info.pop}`),
				out(`  dish         ${info.w}x${info.h}`),
				out(`  running      ${info.running ? tr('chrome.console.run.statePlaying') : tr('chrome.console.run.stateStopped')}`),
				out(`  speed        ${info.speed} gen/s`)
			];
		}
		default:
			return [err(tr('chrome.console.usage.life2'))];
	}
}

// ── sysinfo / uptime ─────────────────────────────────────────────────────────

const NA = 'n/a';

function fmtDuration(ms: number): string {
	const s = Math.floor(ms / 1000);
	const h = Math.floor(s / 3600);
	const m = Math.floor((s % 3600) / 60);
	const sec = s % 60;
	return h > 0 ? `${h}h ${m}m ${sec}s` : m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

/** Conservative UA parse — only used when userAgentData is unavailable. Reports n/a rather than guessing at anything the string doesn't say outright. */
function parseUA(ua: string): { browser: string; os: string } {
	let browser = NA;
	const bm = ua.match(/(Firefox|Edg|OPR|Chrome|Safari)\/([\d.]+)/);
	if (bm) {
		const name = bm[1] === 'Edg' ? 'Edge' : bm[1] === 'OPR' ? 'Opera' : bm[1];
		// Chrome's UA also contains "Safari/x" — Safari proper is only claimed when Chrome/Edg/OPR are absent.
		if (name !== 'Safari' || !/Chrome|Edg|OPR/.test(ua)) browser = `${name} ${bm[2]}`;
		else {
			const cm = ua.match(/(Edg|OPR|Chrome)\/([\d.]+)/);
			if (cm) browser = `${cm[1] === 'Edg' ? 'Edge' : cm[1] === 'OPR' ? 'Opera' : cm[1]} ${cm[2]}`;
		}
	}
	let os = NA;
	if (/Windows NT 10/.test(ua)) os = 'Windows 10/11';
	else if (/Windows NT ([\d.]+)/.test(ua)) os = `Windows NT ${ua.match(/Windows NT ([\d.]+)/)![1]}`;
	else if (/Mac OS X ([\d_]+)/.test(ua)) os = `macOS ${ua.match(/Mac OS X ([\d_]+)/)![1].replace(/_/g, '.')}`;
	else if (/Android ([\d.]+)/.test(ua)) os = `Android ${ua.match(/Android ([\d.]+)/)![1]}`;
	else if (/iPhone OS ([\d_]+)/.test(ua)) os = `iOS ${ua.match(/iPhone OS ([\d_]+)/)![1].replace(/_/g, '.')}`;
	else if (/Linux/.test(ua)) os = 'Linux';
	return { browser, os };
}

interface UAHighEntropy {
	getHighEntropyValues(hints: string[]): Promise<Record<string, unknown>>;
}

async function browserOsInfo(): Promise<{ browser: string; os: string }> {
	const uaData = (navigator as unknown as { userAgentData?: UAHighEntropy }).userAgentData;
	if (uaData) {
		try {
			const hi = await uaData.getHighEntropyValues(['platformVersion', 'fullVersionList', 'model']);
			const brands = (hi.fullVersionList as { brand: string; version: string }[] | undefined)?.filter(
				(b) => !/Not.?A.?Brand/i.test(b.brand)
			);
			const brand = brands?.[brands.length - 1] ?? brands?.[0];
			const browser = brand ? `${brand.brand} ${brand.version}` : NA;
			const platform = (navigator as unknown as { userAgentData?: { platform?: string } }).userAgentData?.platform ?? NA;
			const pv = hi.platformVersion as string | undefined;
			const os = pv ? `${platform} ${pv}` : platform;
			return { browser, os };
		} catch {
			/* fall through to UA string parse */
		}
	}
	return parseUA(navigator.userAgent);
}

/** Creates and immediately loses a throwaway WebGL context purely to read the renderer string. */
function gpuRenderer(): string {
	try {
		const canvas = document.createElement('canvas');
		const gl = (canvas.getContext('webgl') ?? canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
		if (!gl) return NA;
		const ext = gl.getExtension('WEBGL_debug_renderer_info');
		const renderer = ext ? (gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) as string) : (gl.getParameter(gl.RENDERER) as string);
		gl.getExtension('WEBGL_lose_context')?.loseContext();
		return renderer || NA;
	} catch {
		return NA;
	}
}

async function runSysinfo(): Promise<ConsoleLine[]> {
	const { browser: browserName, os } = await browserOsInfo();
	const nav = navigator as Navigator & { deviceMemory?: number; connection?: { effectiveType?: string } };
	const mark = KRSZ_MARKS[Math.floor(Math.random() * KRSZ_MARKS.length)];
	const art = mark.art.split('\n');
	const pairs: [string, string][] = [
		[tr('chrome.console.run.sysinfoBrowser'), `${browserName}`],
		[tr('chrome.console.run.sysinfoOs'), `${os}`],
		[tr('chrome.console.run.sysinfoPlatform'), `${navigator.platform || NA}`],
		[tr('chrome.console.run.sysinfoCores'), `${nav.hardwareConcurrency ?? NA}`],
		[tr('chrome.console.run.sysinfoMemory'), `${nav.deviceMemory ? `${nav.deviceMemory} GB` : NA}`],
		[tr('chrome.console.run.sysinfoScreen'), `${screen.width}x${screen.height} @${window.devicePixelRatio}x, ${screen.colorDepth}-bit`],
		[tr('chrome.console.run.sysinfoGpu'), `${gpuRenderer()}`],
		[tr('chrome.console.run.sysinfoTimezone'), `${Intl.DateTimeFormat().resolvedOptions().timeZone || NA}`],
		[tr('chrome.console.run.sysinfoLangs'), `${navigator.languages?.join(', ') || navigator.language || NA}`],
		[tr('chrome.console.run.sysinfoOnline'), `${navigator.onLine ? tr('chrome.console.run.sysinfoYes') : tr('chrome.console.run.sysinfoNo')}`],
		[tr('chrome.console.run.sysinfoLocale'), `${get(locale)}`],
		[tr('chrome.console.run.sysinfoTheme'), `${get(resolvedTheme)}`],
		[tr('chrome.console.run.sysinfoScale'), `${get(textSize)}px`],
		[tr('chrome.console.run.sysinfoUptime'), `${fmtDuration(performance.now())}`],
		[tr('chrome.console.run.sysinfoBuild'), `${__BUILD_COMMIT__}`]
	];
	// Labels are translated, so their widths differ per locale: pad to the
	// widest one instead of hard-coding the gap, or the value column drifts.
	// Han/kana/Hangul glyphs take two cells in the pixel face, so measure in
	// cells, not code units.
	const cells = (t: string) => [...t].reduce((n, ch) => n + (ch.charCodeAt(0) >= 0x2e80 ? 2 : 1), 0);
	const labelWidth = Math.max(...pairs.map(([l]) => cells(l))) + 2;
	const facts = pairs.map(([l, v]) => l + ' '.repeat(labelWidth - cells(l)) + v);
	const width = Math.max(...art.map((l) => l.length)) + 2;
	const lines: ConsoleLine[] = [];
	const rows = Math.max(art.length, facts.length);
	for (let i = 0; i < rows; i++) {
		const left = (art[i] ?? '').padEnd(width);
		const right = facts[i] ?? '';
		lines.push({ kind: i < art.length ? 'gold' : 'out', text: `${left}${right}` });
	}
	return lines;
}

function runUptime(): ConsoleLine[] {
	const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
	return [
		accent(tr('chrome.console.run.uptimeHeading')),
		out(`  session      ${fmtDuration(performance.now())}`),
		out(`  DOMContentLoaded  ${nav ? `${Math.round(nav.domContentLoadedEventEnd)}ms` : NA}`),
		out(`  load              ${nav ? `${Math.round(nav.loadEventEnd)}ms` : NA}`),
		out(`  visibility        ${document.visibilityState}`)
	];
}

// ── dig — a tiny DNS wire-format (RFC 1035) codec against /dns-query ────────

function encodeQName(name: string): number[] {
	const bytes: number[] = [];
	for (const label of name.replace(/\.$/, '').split('.')) {
		const enc = new TextEncoder().encode(label);
		bytes.push(enc.length, ...enc);
	}
	bytes.push(0);
	return bytes;
}

function buildQuery(name: string, type: number): Uint8Array<ArrayBuffer> {
	const id = Math.floor(Math.random() * 0x10000);
	const header = [id >> 8, id & 0xff, 0x01, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
	const question = [...encodeQName(name), type >> 8, type & 0xff, 0x00, 0x01];
	return new Uint8Array([...header, ...question]);
}

interface DnsAnswer {
	name: string;
	ttl: number;
	type: number;
	data: string;
}

/** Reads a possibly-compressed name starting at `off`; returns the name and the offset just past it. */
function readName(buf: DataView, off: number): { name: string; next: number } {
	const labels: string[] = [];
	let cur = off;
	let jumped = false;
	let guard = 0;
	let afterPointer = -1;
	while (guard++ < 128) {
		const len = buf.getUint8(cur);
		if (len === 0) {
			cur += 1;
			break;
		}
		if ((len & 0xc0) === 0xc0) {
			const pointer = ((len & 0x3f) << 8) | buf.getUint8(cur + 1);
			if (!jumped) afterPointer = cur + 2;
			cur = pointer;
			jumped = true;
			continue;
		}
		const start = cur + 1;
		const bytes = new Uint8Array(buf.buffer, buf.byteOffset + start, len);
		labels.push(new TextDecoder().decode(bytes));
		cur = start + len;
	}
	return { name: labels.join('.'), next: jumped ? afterPointer : cur };
}

function parseResponse(bytes: Uint8Array): { answers: DnsAnswer[]; rcode: number } {
	const buf = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const rcode = buf.getUint8(3) & 0x0f;
	const qdcount = buf.getUint16(4);
	const ancount = buf.getUint16(6);
	let off = 12;
	for (let i = 0; i < qdcount; i++) {
		off = readName(buf, off).next;
		off += 4; // QTYPE + QCLASS
	}
	const answers: DnsAnswer[] = [];
	for (let i = 0; i < ancount; i++) {
		const { name, next } = readName(buf, off);
		off = next;
		const type = buf.getUint16(off);
		off += 2;
		off += 2; // class
		const ttl = buf.getUint32(off);
		off += 4;
		const rdlength = buf.getUint16(off);
		off += 2;
		const rdataStart = off;
		let data = '';
		if (type === DNS_TYPES.A) {
			data = Array.from(bytes.slice(rdataStart, rdataStart + 4)).join('.');
		} else if (type === DNS_TYPES.AAAA) {
			const groups: string[] = [];
			for (let g = 0; g < 8; g++) groups.push(buf.getUint16(rdataStart + g * 2).toString(16));
			data = groups.join(':');
		} else if (type === DNS_TYPES.CNAME || type === DNS_TYPES.NS) {
			data = readName(buf, rdataStart).name;
		} else if (type === DNS_TYPES.MX) {
			const pref = buf.getUint16(rdataStart);
			data = `${pref} ${readName(buf, rdataStart + 2).name}`;
		} else if (type === DNS_TYPES.TXT) {
			let p = rdataStart;
			const chunks: string[] = [];
			while (p < rdataStart + rdlength) {
				const len = buf.getUint8(p);
				chunks.push(new TextDecoder().decode(bytes.slice(p + 1, p + 1 + len)));
				p += 1 + len;
			}
			data = chunks.map((c) => `"${c}"`).join(' ');
		} else {
			data = `(${rdlength} bytes)`;
		}
		off = rdataStart + rdlength;
		answers.push({ name, ttl, type, data });
	}
	return { answers, rcode };
}

async function runDig(rest: string[]): Promise<ConsoleLine[]> {
	const name = rest[0];
	if (!name) return [err(tr('chrome.console.usage.dig2'))];
	const typeName = (rest[1] ?? 'A').toUpperCase();
	const type = DNS_TYPES[typeName];
	if (!type) return [err(tr('chrome.console.run.digBadType', { list: Object.keys(DNS_TYPES).join(', ') }))];

	const query = buildQuery(name, type);
	let res: Response;
	try {
		res = await fetch('/dns-query', {
			method: 'POST',
			headers: { 'content-type': 'application/dns-message', accept: 'application/dns-message' },
			body: query
		});
	} catch {
		return [err(tr('chrome.console.run.digNetworkError'))];
	}
	if (!res.ok) return [err(tr('chrome.console.run.digHttpError', { status: res.status }))];
	const bytes = new Uint8Array(await res.arrayBuffer());
	if (bytes.length < 12) return [err(tr('chrome.console.run.digBadResponse'))];
	const { answers, rcode } = parseResponse(bytes);
	if (rcode !== 0) return [err(tr('chrome.console.run.digRcode', { rcode }))];
	if (answers.length === 0) return [out(tr('chrome.console.run.digNoAnswers', { name, type: typeName }))];
	return [
		accent(tr('chrome.console.run.digHeading', { name, type: typeName })),
		...answers.map((a) => out(`  ${a.name.padEnd(24)} ${String(a.ttl).padStart(6)}  IN  ${(DNS_TYPE_NAMES[a.type] ?? a.type).toString().padEnd(6)} ${a.data}`))
	];
}

// ── small tools ──────────────────────────────────────────────────────────────

/** stdin lines joined, or the trailing args -- the shared "text or pipe" input used by hash/encode/cowsay. */
function textInput(stdin: ConsoleLine[] | null, args: string): string {
	return stdin ? stdin.map((l) => l.text).join('\n') : args;
}

function toHex(buf: ArrayBuffer): string {
	return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function runHash(algo: 'sha256' | 'sha1', stdin: ConsoleLine[] | null, args: string): Promise<ConsoleLine[]> {
	const text = textInput(stdin, args);
	if (!text) return [err(tr('chrome.console.run.usageTextArg', { cmd: algo }))];
	if (!crypto.subtle) return [err(tr('chrome.console.run.subtleCryptoUnavailable'))];
	const digest = await crypto.subtle.digest(algo === 'sha256' ? 'SHA-256' : 'SHA-1', new TextEncoder().encode(text));
	return [out(toHex(digest))];
}

async function runBase64(rest: string[], stdin: ConsoleLine[] | null, args: string): Promise<ConsoleLine[]> {
	const decode = rest[0] === '-d' || rest[0] === '--decode';
	const rawArgs = decode ? rest.slice(1).join(' ') : args;
	const text = textInput(stdin, rawArgs);
	if (!text) return [err(tr('chrome.console.usage.base64'))];
	try {
		if (decode) {
			const binary = atob(text.trim());
			const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
			return [out(new TextDecoder().decode(bytes))];
		}
		const bytes = new TextEncoder().encode(text);
		let binary = '';
		for (const b of bytes) binary += String.fromCharCode(b);
		return [out(btoa(binary))];
	} catch {
		return [err(tr('chrome.console.run.base64Invalid'))];
	}
}

function runHex(stdin: ConsoleLine[] | null, args: string): ConsoleLine[] {
	const text = textInput(stdin, args);
	if (!text) return [err(tr('chrome.console.usage.hex'))];
	return [out(toHex(new TextEncoder().encode(text).buffer))];
}

function runRandom(args: string): ConsoleLine[] {
	const q = args.trim();
	const max = q ? parseInt(q, 10) : 100;
	if (isNaN(max) || max < 1) return [err(tr('chrome.console.usage.random'))];
	return [out(String(1 + Math.floor(Math.random() * max)))];
}

function runRoll(args: string): ConsoleLine[] {
	const m = args.trim().match(/^(\d*)d(\d+)$/i);
	if (!m) return [err(tr('chrome.console.usage.roll'))];
	const n = Math.min(100, Math.max(1, m[1] ? parseInt(m[1], 10) : 1));
	const sides = parseInt(m[2], 10);
	if (!sides || sides < 2) return [err(tr('chrome.console.usage.roll'))];
	const rolls = Array.from({ length: n }, () => 1 + Math.floor(Math.random() * sides));
	const total = rolls.reduce((a, b) => a + b, 0);
	return [out(tr('chrome.console.run.rollResult', { dice: `${n}d${sides}`, rolls: rolls.join(', '), total }))];
}

function runUnix(args: string): ConsoleLine[] {
	const q = args.trim();
	let date: Date;
	if (!q) date = new Date();
	else if (/^-?\d+$/.test(q)) date = new Date(parseInt(q, 10) * (q.length > 10 ? 1 : 1000));
	else {
		const parsed = new Date(q);
		if (isNaN(parsed.getTime())) return [err(tr('chrome.console.usage.unix'))];
		date = parsed;
	}
	return [
		out(`unix    ${Math.floor(date.getTime() / 1000)}`),
		out(`iso     ${date.toISOString()}`),
		out(`local   ${date.toLocaleString(get(locale))}`)
	];
}

function runWhich(args: string): ConsoleLine[] {
	const name = args.trim().toLowerCase();
	if (!name) return [err(tr('chrome.console.usage.which'))];
	const aliasTable = get(aliases);
	if (name in aliasTable) return [out(tr('chrome.console.run.whichAlias', { name, expansion: aliasTable[name] }))];
	if (name in NAV_WORDS) return [out(tr('chrome.console.run.whichNav', { name, path: TAB_ROUTES[NAV_WORDS[name]] }))];
	if (name in EXTERNAL_LINKS) return [out(tr('chrome.console.run.whichExternal', { name, url: EXTERNAL_LINKS[name] }))];
	if (COMMAND_NAMES.includes(name)) return [out(tr('chrome.console.run.whichBuiltin', { name }))];
	return [err(tr('chrome.console.run.whichNotFound', { name }))];
}

async function runFonts(): Promise<ConsoleLine[]> {
	if (!('fonts' in document) || typeof (document as unknown as { fonts?: unknown }).fonts !== 'object') {
		return [err(tr('chrome.console.run.fontsUnavailable'))];
	}
	await document.fonts.ready;
	const faces: FontFace[] = [];
	document.fonts.forEach((f) => faces.push(f));
	if (faces.length === 0) return [out(tr('chrome.console.run.fontsEmpty'))];
	return [
		accent(tr('chrome.console.run.fontsHeading', { count: faces.length })),
		...faces.map((f) => out(`  ${f.family.padEnd(20)} ${f.status.padEnd(8)} ${f.unicodeRange}`))
	];
}

function runFortune(): ConsoleLine[] {
	const path = FORTUNE_SOURCES[Math.floor(Math.random() * FORTUNE_SOURCES.length)];
	const node = lookup(path);
	if (!node || node.type !== 'file') return [err(tr('chrome.console.run.fortuneUnavailable'))];
	const content = node.read();
	if (content.length === 0) return [err(tr('chrome.console.run.fortuneUnavailable'))];
	return [...content.map(out), { kind: 'out', text: tr('chrome.console.run.fortuneSource', { path }) }];
}

/** Wraps at `width` columns on word boundaries -- same approach as vfs.ts's wrap(), duplicated locally rather than exported since it is the only other caller. */
function wrapText(text: string, width: number): string[] {
	const words = text.split(/\s+/).filter(Boolean);
	if (words.length === 0) return [''];
	const rows: string[] = [];
	let row = '';
	for (const w of words) {
		if (row && row.length + 1 + w.length > width) {
			rows.push(row);
			row = w;
		} else {
			row = row ? `${row} ${w}` : w;
		}
	}
	if (row) rows.push(row);
	return rows;
}

function runCowsay(stdin: ConsoleLine[] | null, args: string): ConsoleLine[] {
	const text = textInput(stdin, args) || tr('chrome.console.run.cowsayDefault');
	const lines = wrapText(text, 40);
	const width = Math.max(...lines.map((l) => l.length));
	const border = '-'.repeat(width + 2);
	const bubble: string[] = [`  ${border}`];
	lines.forEach((line, i) => {
		const padded = line.padEnd(width);
		const left = lines.length === 1 ? '<' : i === 0 ? '/' : i === lines.length - 1 ? '\\' : '|';
		const right = lines.length === 1 ? '>' : i === 0 ? '\\' : i === lines.length - 1 ? '/' : '|';
		bubble.push(`  ${left} ${padded} ${right}`);
	});
	bubble.push(`  ${border}`);
	const cow = [
		'        \\   ^__^',
		'         \\  (oo)\\_______',
		'            (__)\\       )\\/\\',
		'                ||----w |',
		'                ||     ||'
	];
	return [...bubble.map(out), ...cow.map(out)];
}

// ── sl — the classic locomotive easter egg ──────────────────────────────────

/** One rendering of the classic `sl` engine, ASCII-only. Fixed width so scroll math is simple. */
const TRAIN_ART = [
	'      ====        ________                ___________ ',
	'  _D _|  |_______/        \\__I_I_____===__|_________| ',
	'   |(_)---  |   H\\________/ |   |        =|___ ___|   ',
	'   /     |  |   H  |  |     |   |         ||_| |_||   ',
	'  |      |  |   H  |__--------------------| [___] |   ',
	'  | ________|___H__/__|_____/[][]~\\_______|       |   ',
	'  |/ |   |-----------I_____I [][] []  D   |=======|__ '
];
const TRAIN_WIDTH = Math.max(...TRAIN_ART.map((l) => l.length));
const TRAIN_DURATION_MS = 3000;
const TRAIN_TRACK_WIDTH = 80;

function runTrain(): ConsoleLine[] {
	// Runs as a side effect over time rather than returning lines synchronously:
	// each frame replaces the trailing MAX_LINES-bounded slice of the buffer that
	// belongs to this render, so it never grows the scrollback per frame.
	const scrollWidth = TRAIN_TRACK_WIDTH + TRAIN_WIDTH;
	const start = performance.now();
	let raf = 0;
	let cancelled = false;

	function render(x: number): ConsoleLine[] {
		return TRAIN_ART.map((row) => {
			const pos = Math.round(x);
			let line = '';
			for (let col = 0; col < TRAIN_TRACK_WIDTH; col++) {
				const idx = col - pos;
				line += idx >= 0 && idx < row.length ? row[idx] : ' ';
			}
			return out(line);
		});
	}

	function stopFrame(finalLine?: ConsoleLine) {
		if (cancelled) return;
		cancelled = true;
		cancelActiveAnimation.set(null);
		consoleBuffer.update((buf) => {
			const trimmed = buf.slice(0, Math.max(0, buf.length - TRAIN_ART.length));
			return [...trimmed, ...(finalLine ? [finalLine] : [])].slice(-MAX_LINES);
		});
	}

	function frame(t: number) {
		if (cancelled) return;
		const elapsed = t - start;
		const progress = Math.min(1, elapsed / TRAIN_DURATION_MS);
		// Right to left: starts fully off the right edge, ends fully off the left.
		const x = scrollWidth - progress * scrollWidth * 2;
		consoleBuffer.update((buf) => {
			const trimmed = buf.slice(0, Math.max(0, buf.length - TRAIN_ART.length));
			return [...trimmed, ...render(x)].slice(-MAX_LINES);
		});
		if (progress >= 1) {
			stopFrame(ok(tr('chrome.console.run.slDone')));
			return;
		}
		raf = requestAnimationFrame(frame);
	}

	cancelActiveAnimation.set(() => {
		cancelAnimationFrame(raf);
		stopFrame(out(tr('chrome.console.run.slCancelled')));
	});
	raf = requestAnimationFrame(frame);
	// Placeholder lines the animation immediately overwrites -- keeps the "one
	// call returns lines" contract every other command follows, and reserves
	// the slice stopFrame()/frame() trim back out.
	return TRAIN_ART.map(() => out(''));
}

/** Called from CommandConsole.svelte's onMount cleanup so a closed/unmounted
 *  console cannot leave `sl`'s requestAnimationFrame loop running against a
 *  buffer nobody is reading. Safe to call when nothing is animating. */
export function cancelConsoleAnimation(): void {
	get(cancelActiveAnimation)?.();
}

function formatEntry(node: VNode, long: boolean): string {
	const name = node.type === 'dir' ? `${node.name}/` : node.name;
	if (!long) return `  ${name}`;
	const kind = node.type === 'dir' ? 'dir ' : 'file';
	return `  ${kind}  ${name.padEnd(16)} ${node.note ?? ''}`.trimEnd();
}

/** Expand a leading alias, bounded so `alias a="a"` can't spin. */
function expandAliases(segment: string): string {
	let current = segment.trim();
	const table = get(aliases);
	for (let depth = 0; depth < 5; depth++) {
		const [head, ...tail] = current.split(/\s+/);
		const value = table[head];
		if (!value) break;
		current = [value, ...tail].join(' ');
	}
	return current;
}

/** Runs one `|`-chained pipeline (no `;`/`&&` inside it — those are split
 *  before this is called). Returns the final stage's output. */
async function runPipeline(pipeline: string): Promise<ConsoleLine[]> {
	const segments = pipeline.split('|').map((s) => s.trim()).filter(Boolean);
	let stdin: ConsoleLine[] | null = null;
	for (let i = 0; i < segments.length; i++) {
		const piped = segments.length > 1;
		stdin = await runOne(expandAliases(segments[i]), { stdin, piped });
		// A failing stage stops the chain — printing its error is more useful
		// than feeding an error string into the next filter.
		if (i < segments.length - 1 && stdin.some((l) => l.kind === 'err')) break;
	}
	return stdin ?? [];
}

/** Splits on top-level `;` and `&&`, keeping the operator with each piece so
 *  the executor knows whether to stop the chain on failure. `|` is left alone
 *  here — it is handled inside runPipeline() once a `;`/`&&`-delimited piece
 *  has been isolated, so `a | b && c | d` composes as documented. */
function splitChain(input: string): { pipeline: string; stopOnError: boolean }[] {
	const parts: { pipeline: string; stopOnError: boolean }[] = [];
	let rest = input;
	while (rest.length > 0) {
		const andIdx = rest.indexOf('&&');
		const semiIdx = rest.indexOf(';');
		let cut = -1;
		let stopOnError = false;
		if (andIdx !== -1 && (semiIdx === -1 || andIdx < semiIdx)) {
			cut = andIdx;
			stopOnError = true;
		} else if (semiIdx !== -1) {
			cut = semiIdx;
			stopOnError = false;
		}
		if (cut === -1) {
			const pipeline = rest.trim();
			if (pipeline) parts.push({ pipeline, stopOnError: false });
			break;
		}
		const pipeline = rest.slice(0, cut).trim();
		if (pipeline) parts.push({ pipeline, stopOnError });
		rest = rest.slice(cut + (stopOnError ? 2 : 1));
	}
	return parts;
}

/** Expands `!!`, `!n` and `!prefix` against the history that existed before
 *  this input was typed (so `!!` on the very first command, or `!3` past the
 *  end of a short history, fails clearly rather than recalling itself). */
function expandBang(input: string): string | null {
	if (!input.startsWith('!')) return input;
	const priorHistory = get(commandHistory);
	if (input === '!!') return priorHistory[priorHistory.length - 1] ?? null;
	const nMatch = input.match(/^!(\d+)$/);
	if (nMatch) return priorHistory[parseInt(nMatch[1], 10) - 1] ?? null;
	const prefixMatch = input.match(/^!(\S+)$/);
	if (prefixMatch) {
		const hit = [...priorHistory].reverse().find((h) => h.startsWith(prefixMatch[1]));
		return hit ?? null;
	}
	return input;
}

export async function executeCommand(raw: string): Promise<void> {
	const typed = raw.trim();
	if (!typed) return;

	const input = expandBang(typed);
	if (input === null) {
		push([{ kind: 'cmd', text: typed }, err(tr('chrome.console.run.bangNoMatch', { input: typed }))]);
		return;
	}

	commandHistory.update((h) => {
		const next = (h[h.length - 1] === input ? h : [...h, input]).slice(-100);
		persist(HISTORY_KEY, next);
		return next;
	});
	push([{ kind: 'cmd', text: input !== typed ? `${typed} → ${input}` : input }]);

	if (input.trim().toLowerCase() === 'history -c') {
		commandHistory.set([]);
		persist(HISTORY_KEY, []);
		push([ok(tr('chrome.console.run.historyCleared'))]);
		return;
	}

	const chain = splitChain(input);
	let last: ConsoleLine[] = [];
	for (const { pipeline, stopOnError } of chain) {
		last = await runPipeline(pipeline);
		push(last);
		if (stopOnError && last.some((l) => l.kind === 'err')) break;
	}
}

// ── Tab completion ──────────────────────────────────────────────────────────
/** Every non-navigation, non-link dispatched command and alias -- there's no
 *  way to introspect the `cmd === '...'` checks below programmatically, so
 *  this list has to be hand-kept in sync with runOne(). NAV_WORDS and
 *  EXTERNAL_LINKS are spread in below rather than duplicated here, since
 *  those two ARE enumerable objects and hand-copying them is exactly the
 *  kind of drift that let `alias help=...`/`alias 0=...` silently shadow
 *  real commands before this list caught up with them. */
const COMMAND_NAMES = [
	'help', '?', 'man', 'clear', 'cls', 'ls', 'll', 'cd', 'pwd', 'cat', 'tree', 'grep', 'head', 'tail', 'wc', 'dir',
	'sort', 'uniq', 'alias', 'unalias', 'open', 'whoami', 'about', 'date', 'time', 'history', 'banner', 'tracks', 'trk',
	'songs', 'load', 'play', 'stop', 'seq', 'sequence', 'bpm', 'vol', 'volume', 'mute', 'unmute', 'midi', 'theme', 'eval', 'js', 'calc',
	'echo', 'snap', 'dur', 'meter', 'blend',
	'trace', 'edge', 'guide', 'tour', 'keys', 'keymap', 'intro',
	'life', 'lang', 'language', 'scale', 'sysinfo', 'neofetch', 'fetch', 'uptime', 'ver', 'version',
	'settings', 'config', 'credits', 'privacy', 'exit', 'quit', 'q',
	'rec', 'record', 'patch',
	'dig', 'sha256', 'sha1', 'base64', 'hex', 'uuid', 'random', 'roll', 'unix', 'which', 'fonts', 'fortune', 'cowsay', 'sl',
	...Object.keys(NAV_WORDS),
	...Object.keys(EXTERNAL_LINKS)
];

/** Command names an alias may not shadow. */
const RESERVED_ALIAS_NAMES = new Set(COMMAND_NAMES);

/** Commands whose argument is a VFS path. */
const PATH_COMMANDS = new Set(['cd', 'ls', 'll', 'cat', 'tree', 'grep', 'head', 'tail', 'wc', 'sort', 'uniq']);

/** Command names `man` has a page for -- kept as a plain list (not
 *  `Object.keys(usageTable())`) so completion doesn't call tr() at every
 *  keystroke; the set of covered commands doesn't change with locale. */
const USAGE_COMMANDS = [
	'cd', 'ls', 'cat', 'tree', 'grep', 'head', 'tail', 'wc', 'sort', 'uniq', 'alias', 'unalias', 'trace', 'open',
	'eval', 'bpm', 'vol', 'load', 'theme', 'echo', 'history', 'guide', 'keys', 'man', 'help', 'whoami', 'date',
	'tracks', 'songs', 'midi', 'banner', 'play', 'stop', 'seq', 'mute', 'unmute', 'snap', 'dur', 'meter', 'blend',
	'clear', 'pwd', 'lang', 'life', 'sysinfo', 'uptime', 'ver', 'settings', 'credits', 'privacy', 'exit', 'scale',
	'rec', 'patch', 'dig', 'sha256', 'sha1', 'base64', 'hex', 'uuid', 'random', 'roll', 'unix', 'which', 'fonts',
	'fortune', 'cowsay', 'sl'
];

const ARG_COMPLETIONS: Record<string, string[]> = {
	open: [...Object.keys(EXTERNAL_LINKS)],
	load: BUILTIN_SONGS.map((s) => s.id.toLowerCase()),
	theme: Object.keys(THEME_ALIASES),
	blend: ['layer', 'fm', 'ring', 'sync'],
	snap: VALID_DIVS,
	dur: VALID_DIVS,
	meter: VALID_METERS,
	man: USAGE_COMMANDS,
	lang: [...LOCALE_IDS, 'auto', 'zh', 'cn', 'tw', 'jp', 'kr'],
	scale: [...SCALE_VALUES, 'auto'],
	life: LIFE_SUBCOMMANDS,
	rec: ['start', 'stop', 'toggle'],
	patch: ['new', 'save', 'load', 'share'],
	dig: Object.keys(DNS_TYPES),
	base64: ['-d']
};

/**
 * Live matches for the current input — command names on the first token,
 * per-command argument candidates after it. A trailing space means "empty
 * arg query", which returns the full candidate list for that command.
 * Only the segment after the last `|` is completed.
 */
export function getSuggestions(input: string): string[] {
	const segment = input.split('|').pop() ?? '';
	const parts = segment.replace(/^\s+/, '').split(/\s+/);
	if (parts.length <= 1) {
		const q = (parts[0] ?? '').toLowerCase();
		if (!q) return [];
		return [...COMMAND_NAMES, ...Object.keys(get(aliases))].filter((c) => c.startsWith(q));
	}
	const head = parts[0].toLowerCase();
	const q = parts[parts.length - 1].toLowerCase();
	if (head === 'life' && parts.length >= 3) {
		const sub = parts[1].toLowerCase();
		if (sub === 'load') return lifePatternKeys().filter((k) => k.toLowerCase().startsWith(q));
		if (sub === 'speed') return ['2', '8', '30', '120', '480'].filter((s) => s.startsWith(q));
		return [];
	}
	if (PATH_COMMANDS.has(head)) {
		const base = get(cwd);
		// Absolute matches, plus names directly inside the working directory.
		const here = lookup(base);
		const local =
			here && here.type === 'dir'
				? here.children.map((c) => (c.type === 'dir' ? `${c.name}/` : c.name))
				: [];
		return [...local, ...allPaths()].filter((p) => p.toLowerCase().startsWith(q)).slice(0, 40);
	}
	const candidates = ARG_COMPLETIONS[head];
	if (!candidates) return [];
	return candidates.filter((c) => c.startsWith(q));
}

/** Replace the last token of `input` with `completion`, keeping the rest. */
export function applyCompletion(input: string, completion: string, trailingSpace = true): string {
	const head = input.split(/\s+/).slice(0, -1);
	// Directory completions keep the caret inside the path instead of ending the token.
	const space = completion.endsWith('/') ? false : trailingSpace;
	return [...head, completion].join(' ') + (space ? ' ' : '');
}
