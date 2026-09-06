import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';
import { goto } from '$app/navigation';
import { tr, locale } from '$lib/i18n';
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
import { BUILTIN_SONGS, builtinSongIdx, handleLoadBuiltinSong } from './synth-patch';
import { midiConnectedDevice, midiDevices } from './synth-midi';
import { soundState, setMuted, setVolume } from './sound';
import { edgeTraceMs, loadEdgeTrace } from './edge';
import { openOnboardingNow, hotkeyOverlayOpen } from './chrome';
import { KRSZ_MARKS } from '../krsz-marks';

export type LineKind = 'cmd' | 'out' | 'ok' | 'err' | 'accent' | 'gold';
export interface ConsoleLine {
	kind: LineKind;
	text: string;
}

const WELCOME: ConsoleLine[] = [
	{ kind: 'ok', text: 'KRSZ-EDGE WORKBENCH READY // TYPE "help" OR USE [CTRL+0-5] HOTKEYS' }
];

const MAX_LINES = 300;
const HISTORY_KEY = 'krsz.console.history';
const ALIAS_KEY = 'krsz.console.aliases';

/** Scrollback buffer — lives in a store so it survives visiting /synth (which unmounts the console). */
export const consoleBuffer = writable<ConsoleLine[]>([...WELCOME]);
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
		pwd: ['pwd', tr('chrome.console.usage.pwd')]
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
	if (!path) return err('No input — give a file or pipe something in.');
	const node = lookup(resolvePath(base, path));
	if (!node) return err(`No such file: ${path}`);
	if (node.type === 'dir') return err(`${path} is a directory`);
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

	// ── navigation ──
	if (cmd in NAV_WORDS) {
		const tab = NAV_WORDS[cmd];
		goto(TAB_ROUTES[tab]);
		return [ok(`Navigated to ${TAB_ROUTES[tab]}`)];
	}

	if (cmd === 'open') {
		const key = args.trim().toLowerCase();
		const url = EXTERNAL_LINKS[key] ?? MODULES.find((m) => m.id === key)?.url;
		if (!url) return [err(`Unknown project: "${key}". Try: ${Object.keys(EXTERNAL_LINKS).join(', ')}`)];
		window.open(url, '_blank');
		return [ok(`Opened ${url}`)];
	}

	if (cmd in EXTERNAL_LINKS) {
		window.open(EXTERNAL_LINKS[cmd], '_blank');
		return [ok(`Opened ${EXTERNAL_LINKS[cmd]}`)];
	}

	// ── edge ──
	if (cmd === 'trace' || cmd === 'edge') {
		if (!ctx.piped) push([accent('GET /cdn-cgi/trace …')]);
		const t = await loadEdgeTrace(true);
		if (!t) return [err('Edge trace unavailable — /cdn-cgi/trace did not answer.')];
		const ms = get(edgeTraceMs);
		return [
			accent('CLOUDFLARE EDGE — measured, not asserted'),
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
		if (!node) return [err(`cd: no such directory: ${args.trim()}`)];
		if (node.type !== 'dir') return [err(`cd: not a directory: ${args.trim()}`)];
		cwd.set(target);
		return [ok(target)];
	}

	if (cmd === 'ls' || cmd === 'll' || cmd === 'dir') {
		const flags = [...rest];
		const long = takeFlag(flags, '-l') || cmd === 'll';
		const target = resolvePath(base, flags[0] ?? '.');
		const node = lookup(target);
		if (!node) return [err(`ls: no such path: ${flags[0] ?? target}`)];
		if (node.type === 'file') return [out(formatEntry(node, long))];
		if (node.children.length === 0) return [out('(empty)')];
		return [
			accent(`${target === '/' ? '/' : target}  —  ${node.children.length} entries`),
			...node.children.map((c) => out(formatEntry(c, long)))
		];
	}

	if (cmd === 'cat') {
		if (!args.trim()) return [err('Usage: cat <file>')];
		const node = lookup(resolvePath(base, args.trim()));
		if (!node) return [err(`cat: no such file: ${args.trim()}`)];
		if (node.type === 'dir') return [err(`cat: ${args.trim()} is a directory — try "ls"`)];
		return node.read().map(out);
	}

	if (cmd === 'tree') {
		const target = resolvePath(base, args.trim() || '.');
		const node = lookup(target);
		if (!node) return [err(`tree: no such path: ${args.trim()}`)];
		return [accent(target === '/' ? '/' : target), ...renderTree(node).map(out)];
	}

	// ── pipe filters ──
	if (cmd === 'grep') {
		const flags = [...rest];
		const insensitive = takeFlag(flags, '-i');
		const pattern = flags.shift();
		if (!pattern) return [err('Usage: grep [-i] <pattern> [file]')];
		const input = filterInput(ctx.stdin, flags[0], base);
		if (!Array.isArray(input)) return [input];
		let re: RegExp;
		try {
			re = new RegExp(pattern, insensitive ? 'i' : '');
		} catch {
			return [err(`grep: invalid pattern: ${pattern}`)];
		}
		const hits = input.filter((l) => re.test(l.text));
		return hits.length ? hits : [out(`(no match for /${pattern}/)`)];
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
		return [out(`${input.length} lines  ${words} words  ${chars} chars`)];
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
				? [accent('ALIASES:'), ...names.map((n) => out(`  ${n.padEnd(10)} ${all[n]}`))]
				: [out('No aliases. Define one: alias ll="ls -l"')];
		}
		const m = args.match(/^(\w+)\s*=\s*(.+)$/);
		if (!m) return [err('Usage: alias name="command"')];
		const value = m[2].replace(/^['"]|['"]$/g, '');
		if (RESERVED_ALIAS_NAMES.has(m[1].toLowerCase())) return [err(`alias: "${m[1]}" is a built-in command`)];
		aliases.update((a) => {
			const next = { ...a, [m[1]]: value };
			persist(ALIAS_KEY, next);
			return next;
		});
		return [ok(`alias ${m[1]}="${value}"`)];
	}

	if (cmd === 'unalias') {
		const name = args.trim();
		if (!(name in get(aliases))) return [err(`unalias: no such alias: ${name}`)];
		aliases.update((a) => {
			const next = { ...a };
			delete next[name];
			persist(ALIAS_KEY, next);
			return next;
		});
		return [ok(`Removed alias ${name}`)];
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
		return node && node.type === 'file' ? node.read().map(out) : [err('profile unavailable')];
	}

	if (cmd === 'tracks' || cmd === 'trk') {
		const tracks = get(tracksState);
		const active = get(activeTrackId);
		return [
			accent('SEQ TRACKS:'),
			...tracks.map((t) =>
				out(`  ${t.id === active ? '▶' : ' '} ${t.name.padEnd(24)} ${t.muted ? '[MUTED]' : '       '} ${t.solo ? '[SOLO]' : ''}`)
			)
		];
	}

	if (cmd === 'songs') {
		const current = get(builtinSongIdx);
		return [
			accent('BUILT-IN SONGS:'),
			...BUILTIN_SONGS.map((s, i) =>
				out(`  ${i === current ? '●' : '○'} ${s.name.padEnd(20)} ${String(s.bpm).padStart(3)}bpm · ${s.meter} · ${s.steps} steps`)
			)
		];
	}

	if (cmd === 'load') {
		const q = args.trim().toLowerCase();
		if (!q) return [err('Usage: load <song> — try "songs" to list them')];
		const idx = BUILTIN_SONGS.findIndex((s) => s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q));
		if (idx === -1) return [err(`No song matches "${q}". Try "songs".`)];
		handleLoadBuiltinSong(idx);
		return [ok(`Loaded ${BUILTIN_SONGS[idx].name} (${BUILTIN_SONGS[idx].bpm} BPM, ${BUILTIN_SONGS[idx].meter})`)];
	}

	if (cmd === 'midi') {
		const device = get(midiConnectedDevice);
		const devices = get(midiDevices);
		return device
			? [ok(`MIDI CONNECTED: ${device}`), ...devices.map((d) => out(`  · ${d.name}`))]
			: [out('MIDI: standby — no input device connected')];
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
		return h.length ? h.map((c, i) => out(`  ${String(i + 1).padStart(2)}  ${c}`)) : [out('history is empty')];
	}

	if (cmd === 'banner') return rollBanner().map((l) => ({ kind: 'gold' as LineKind, text: l }));

	// ── synth ──
	if (cmd === 'play') {
		setMuted(false);
		play();
		return [ok('Sequencer playing.')];
	}
	if (cmd === 'stop') {
		stop();
		return [ok('Sequencer stopped.')];
	}
	if (cmd === 'seq' || cmd === 'sequence') {
		const playing = toggleSeq();
		if (playing) setMuted(false);
		return [ok(`Sequencer ${playing ? 'playing' : 'stopped'}.`)];
	}

	if (cmd === 'bpm') {
		if (!args) return [out(`BPM: ${get(bpm)} — ${get(isSeqPlaying) ? 'playing' : 'stopped'}`)];
		const val = parseInt(args, 10);
		if (isNaN(val) || val < 40 || val > 300) return [err(`Invalid BPM "${args}" — expected 40-300.`)];
		setBpm(val);
		return [ok(`BPM set to ${val}.`)];
	}

	if (cmd === 'vol' || cmd === 'volume') {
		if (!args) return [out(`Volume: ${Math.round(get(soundState).volume * 100)}%${get(soundState).muted ? ' (muted)' : ''}`)];
		const val = parseInt(args, 10);
		if (isNaN(val) || val < 0 || val > 100) return [err(`Invalid volume "${args}" — expected 0-100.`)];
		setVolume(val / 100);
		setMuted(false);
		return [ok(`Volume set to ${val}%.`)];
	}

	if (cmd === 'mute') {
		setMuted(true);
		return [ok('Muted.')];
	}
	if (cmd === 'unmute') {
		setMuted(false);
		return [ok('Unmuted.')];
	}

	if (cmd === 'snap' || cmd === 'dur') {
		const div = args.trim();
		if (!VALID_DIVS.includes(div)) return [err(`Usage: ${cmd} <div> — one of: ${VALID_DIVS.join(' ')}`)];
		if (cmd === 'snap') setSnapDiv(div as NoteDurationDiv);
		else setNoteDur(div as NoteDurationDiv);
		return [ok(`${cmd === 'snap' ? 'Grid snap' : 'Note duration'} set to ${div}.`)];
	}

	if (cmd === 'meter') {
		const sig = args.trim();
		if (!VALID_METERS.includes(sig)) return [err(`Usage: meter <sig> — one of: ${VALID_METERS.join(' ')}`)];
		setTimeMeter(sig as TimeSignature);
		return [ok(`Time signature set to ${sig}.`)];
	}

	if (cmd === 'blend') {
		const mode = args.toLowerCase();
		if (!['layer', 'fm', 'ring', 'sync'].includes(mode)) return [err('Usage: blend <layer|fm|ring|sync>')];
		updateActiveTrack({ blendMode: mode as BlendMode });
		return [ok(`Track ${get(activeTrackId) + 1} blend mode set to ${mode.toUpperCase()}`)];
	}

	// ── misc ──
	if (cmd === 'eval' || cmd === 'calc' || cmd === 'js') return [out(`=> ${evaluateSafeJS(args)}`)];

	if (cmd === 'echo') return [out(args)];

	if (cmd === 'theme') {
		const q = args.trim().toLowerCase();
		if (!q) {
			cycleTheme();
			const t = get(theme);
			return [ok(`Theme: ${t === 'auto' ? `auto (${get(resolvedTheme)})` : t}`)];
		}
		const t = THEME_ALIASES[q];
		if (!t) return [err(`Unknown theme "${q}". Valid: ${Object.keys(THEME_ALIASES).join(', ')}`)];
		theme.set(t);
		return [ok(`Theme set to ${t}.`)];
	}

	if (cmd === 'clear' || cmd === 'cls') {
		consoleBuffer.set([]);
		return [];
	}

	return [err(`Command not recognized: "${cmd}". Type "help".`)];
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

export async function executeCommand(raw: string): Promise<void> {
	const input = raw.trim();
	if (!input) return;

	commandHistory.update((h) => {
		const next = (h[h.length - 1] === input ? h : [...h, input]).slice(-100);
		persist(HISTORY_KEY, next);
		return next;
	});
	push([{ kind: 'cmd', text: input }]);

	const segments = input.split('|').map((s) => s.trim()).filter(Boolean);
	let stdin: ConsoleLine[] | null = null;
	for (let i = 0; i < segments.length; i++) {
		const piped = segments.length > 1;
		stdin = await runOne(expandAliases(segments[i]), { stdin, piped });
		// A failing stage stops the chain — printing its error is more useful
		// than feeding an error string into the next filter.
		if (i < segments.length - 1 && stdin.some((l) => l.kind === 'err')) break;
	}
	push(stdin ?? []);
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
	'clear', 'pwd'
];

const ARG_COMPLETIONS: Record<string, string[]> = {
	open: [...Object.keys(EXTERNAL_LINKS)],
	load: BUILTIN_SONGS.map((s) => s.id.toLowerCase()),
	theme: Object.keys(THEME_ALIASES),
	blend: ['layer', 'fm', 'ring', 'sync'],
	snap: VALID_DIVS,
	dur: VALID_DIVS,
	meter: VALID_METERS,
	man: USAGE_COMMANDS
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
