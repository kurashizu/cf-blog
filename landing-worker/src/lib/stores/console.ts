import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';
import { goto } from '$app/navigation';
import { evaluateSafeJS } from '../evaluator';
import { METER_SPECS, type NoteDurationDiv, type TimeSignature, type BlendMode } from '../synth';
import { MODULES } from '../data/modules';
import { EXTERNAL_LINKS } from '../links';
import { TAB_ROUTES } from '../routes-map';
import { allPaths, lookup, renderTree, resolvePath, type VNode } from '../vfs';
import { theme, cycleTheme, THEME_STYLES, type WorkspaceTheme } from './theme';
import { bpm, setBpm, setSnapDiv, setNoteDur, setTimeMeter, toggle as toggleSeq, play, stop, isSeqPlaying } from './synth-transport';
import { updateActiveTrack, tracksState } from './synth-tracks';
import { activeTrackId } from './synth-transport';
import { BUILTIN_SONGS, builtinSongIdx, handleLoadBuiltinSong } from './synth-patch';
import { midiConnectedDevice, midiDevices } from './synth-midi';
import { soundState, setMuted, setVolume } from './sound';
import { probeTimes } from './probes';
import { edgeTraceMs, loadEdgeTrace } from './edge';
import { guideOpen, hotkeyOverlayOpen } from './chrome';

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
	'4': 4, leaderboard: 4, llm: 4, models: 4, ranks: 4,
	'5': 5, linux: 5, vm: 5, alpine: 5, x86: 5
};

const THEME_ALIASES: Record<string, WorkspaceTheme> = {
	tokyo: 'tokyo-matte', 'tokyo-matte': 'tokyo-matte',
	gruvbox: 'gruvbox-dark', 'gruvbox-dark': 'gruvbox-dark',
	nord: 'nord-terminal', 'nord-terminal': 'nord-terminal',
	amber: 'cyber-amber', 'cyber-amber': 'cyber-amber'
};

const VALID_DIVS = ['4', '2', '1', '1/2', '1/3', '1/4', '1/6', '1/8', '1/12'];
const VALID_METERS = Object.keys(METER_SPECS);

const BANNER = [
	' ██╗  ██╗██████╗ ███████╗███████╗',
	' ██║ ██╔╝██╔══██╗██╔════╝╚══███╔╝',
	' █████╔╝ ██████╔╝███████╗  ███╔╝ ',
	' ██╔═██╗ ██╔══██╗╚════██║ ███╔╝  ',
	' ██║  ██╗██║  ██║███████║███████╗',
	' ╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝╚══════╝',
	" Kurashizu's Random-Stuff Zone — 100% serverless edge"
];

const HELP: ConsoleLine[] = [
	accent('── NAVIGATION ──────────────────────────────'),
	out('  0|modules  1|guestbook  2|synth  3|utilities  4|leaderboard  5|linux'),
	out('  open <project>     launch a project in a new tab'),
	out('  ping <project>     measure real round trip from your browser'),
	out('  ' + Object.keys(EXTERNAL_LINKS).join(' · ')),
	accent('── FILESYSTEM ──────────────────────────────'),
	out('  pwd · cd <path> · ls [-l] [path] · tree [path]'),
	out('  cat <file>      print a file'),
	out('  grep [-i] <pat> [file]   filter lines'),
	out('  head/tail [-n N] · sort · uniq · wc'),
	out('  cmd | cmd       pipe output into a filter'),
	out('  alias ll="ls -l" · unalias ll'),
	accent('── EDGE ────────────────────────────────────'),
	out('  trace       real Cloudflare PoP, protocol, TLS (/cdn-cgi/trace)'),
	accent('── INFO ────────────────────────────────────'),
	out('  whoami      operator profile'),
	out('  tracks      sequencer track states'),
	out('  songs       built-in songs (● = loaded)'),
	out('  midi        MIDI device status'),
	out('  date        current time (Sydney / UTC)'),
	out('  history     recent commands'),
	out('  banner      print the KRSZ banner'),
	out('  man <cmd>   usage for one command'),
	accent('── SYNTH ───────────────────────────────────'),
	out('  play / stop / seq        transport control'),
	out('  load <song>              load built-in song'),
	out('  bpm [40-300]             show / set tempo'),
	out('  vol [0-100] · mute · unmute   master volume'),
	out('  snap <div> · dur <div>   grid: 4 2 1 1/2 1/3 1/4 1/6 1/8 1/12'),
	out('  meter <sig>              4/4 3/4 2/4 5/4 6/8 7/8'),
	out('  blend <layer|fm|ring|sync>   active track blend'),
	accent('── MISC ────────────────────────────────────'),
	out('  eval <expr>     safe math (e.g. eval 2**16)'),
	out('  echo <text>     print text'),
	out('  theme [name]    cycle or set: tokyo gruvbox nord amber'),
	out('  clear / Ctrl+L  clear screen · Tab completes/cycles · ↑↓ history'),
	out('  guide           replay the getting-started walkthrough'),
	out('  ` (backquote)   open/close this console over any view'),
	out('  ? (shift+/)     full hotkey reference')
];

/** One-line usage strings for `man <cmd>`. */
const USAGE: Record<string, string[]> = {
	cd: ['cd [path]', 'Change the virtual working directory. Supports .. and absolute paths.', 'With no argument, returns to /.'],
	ls: ['ls [-l] [path]', 'List a directory. -l adds the annotation column.'],
	cat: ['cat <file>', 'Print a file. /synth and /edge files are rendered from live state.'],
	tree: ['tree [path]', 'Recursive listing of a subtree.'],
	grep: ['grep [-i] <pattern> [file]', 'Keep matching lines. Reads a pipe when no file is given.', 'The pattern is a JavaScript regular expression.'],
	head: ['head [-n N] [file]', 'First N lines (default 10).'],
	tail: ['tail [-n N] [file]', 'Last N lines (default 10).'],
	wc: ['wc [file]', 'Count lines, words and characters.'],
	sort: ['sort [-r] [file]', 'Sort lines; -r reverses.'],
	uniq: ['uniq [file]', 'Collapse adjacent duplicate lines.'],
	alias: ['alias [name="command"]', 'Define or list shell aliases. Persisted in localStorage.'],
	unalias: ['unalias <name>', 'Remove one alias.'],
	trace: ['trace', 'Fetch /cdn-cgi/trace and print the serving Cloudflare PoP,', 'negotiated protocol, TLS version and key-exchange group.'],
	ping: ['ping <project>', 'Three no-cors fetches to a project origin, timed in your browser.'],
	open: ['open <project>', 'Open a project in a new tab.'],
	eval: ['eval <expression>', 'Evaluate arithmetic with a hand-written parser — never raw eval().'],
	bpm: ['bpm [40-300]', 'Show or set the sequencer tempo.'],
	vol: ['vol [0-100]', 'Show or set master volume.'],
	load: ['load <song>', 'Load a built-in song by name fragment. See "songs".'],
	theme: ['theme [name]', 'Cycle, or set one of: ' + Object.keys(THEME_STYLES).join(', ')],
	echo: ['echo <text>', 'Print text. Useful as a pipe source.'],
	history: ['history', 'The last 15 commands. Persisted across visits.'],
	guide: ['guide', 'Reopen the getting-started walkthrough.'],
	keys: ['keys', 'Open the full keyboard reference (same as ? or F1).']
};

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

	if (cmd === 'ping') {
		const key = args.trim().toLowerCase();
		const url = EXTERNAL_LINKS[key] ?? MODULES.find((m) => m.id === key)?.url;
		if (!url) return [err(`Usage: ping <project> — one of: ${Object.keys(EXTERNAL_LINKS).join(', ')}`)];
		if (!ctx.piped) push([accent(`PING ${url} (3 samples, browser-measured)`)]);
		try {
			const { samples, best } = await probeTimes(url, 3);
			return [
				...(ctx.piped ? [accent(`PING ${url}`)] : []),
				...samples.map((ms, i) => out(`  seq=${i + 1}  time=${ms.toFixed(1)}ms${i === 0 ? '  (incl. TLS setup)' : ''}`)),
				ok(`  best ${best.toFixed(1)}ms · avg ${(samples.reduce((a, b) => a + b, 0) / samples.length).toFixed(1)}ms`)
			];
		} catch {
			return [err(`  ${url} did not respond`)];
		}
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
	if (cmd === 'help' || cmd === '?') return HELP;

	if (cmd === 'guide' || cmd === 'tour' || cmd === 'intro') {
		guideOpen.set(true);
		return [ok('Opened the getting-started walkthrough.')];
	}

	if (cmd === 'keys' || cmd === 'keymap') {
		hotkeyOverlayOpen.set(true);
		return [ok('Opened the keymap.')];
	}

	if (cmd === 'man') {
		const name = args.trim().toLowerCase();
		if (!name) return HELP;
		const page = USAGE[name];
		if (!page) return [err(`No manual entry for "${name}". Type "help" for the command list.`)];
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
		const syd = new Intl.DateTimeFormat('en-AU', {
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

	if (cmd === 'banner') return BANNER.map((l) => ({ kind: 'gold' as LineKind, text: l }));

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
			return [ok(`Theme: ${get(theme)}`)];
		}
		const t = THEME_ALIASES[q];
		if (!t) return [err(`Unknown theme "${q}". Valid: ${Object.keys(THEME_STYLES).join(', ')}`)];
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
const COMMAND_NAMES = [
	'help', 'man', 'clear', 'ls', 'll', 'cd', 'pwd', 'cat', 'tree', 'grep', 'head', 'tail', 'wc',
	'sort', 'uniq', 'alias', 'unalias', 'open', 'whoami', 'date', 'history', 'banner', 'tracks',
	'songs', 'load', 'play', 'stop', 'seq', 'bpm', 'vol', 'mute', 'unmute', 'midi', 'theme', 'eval',
	'echo', 'snap', 'dur', 'meter', 'blend', 'modules', 'guestbook', 'synth', 'utilities', 'leaderboard', 'llm', 'ping',
	'trace', 'guide', 'tour', 'keys', 'linux', 'vm', 'alpine',
	...Object.keys(EXTERNAL_LINKS)
];

/** Command names an alias may not shadow. */
const RESERVED_ALIAS_NAMES = new Set(COMMAND_NAMES);

/** Commands whose argument is a VFS path. */
const PATH_COMMANDS = new Set(['cd', 'ls', 'll', 'cat', 'tree', 'grep', 'head', 'tail', 'wc', 'sort', 'uniq']);

const ARG_COMPLETIONS: Record<string, string[]> = {
	open: [...Object.keys(EXTERNAL_LINKS)],
	ping: [...Object.keys(EXTERNAL_LINKS)],
	load: BUILTIN_SONGS.map((s) => s.id.toLowerCase()),
	theme: Object.keys(THEME_ALIASES),
	blend: ['layer', 'fm', 'ring', 'sync'],
	snap: VALID_DIVS,
	dur: VALID_DIVS,
	meter: VALID_METERS,
	man: Object.keys(USAGE)
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
