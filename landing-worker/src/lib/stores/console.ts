import { writable, get } from 'svelte/store';
import { goto } from '$app/navigation';
import { evaluateSafeJS } from '../evaluator';
import { METER_SPECS, type NoteDurationDiv, type TimeSignature, type BlendMode } from '../synth';
import { MODULES } from '../data/modules';
import { TAB_ROUTES } from '../routes-map';
import { theme, cycleTheme, THEME_STYLES, type WorkspaceTheme } from './theme';
import { bpm, setBpm, setSnapDiv, setNoteDur, setTimeMeter, toggle as toggleSeq, play, stop, isSeqPlaying } from './synth-transport';
import { updateActiveTrack, tracksState } from './synth-tracks';
import { activeTrackId } from './synth-transport';
import { BUILTIN_SONGS, builtinSongIdx, handleLoadBuiltinSong } from './synth-patch';
import { midiConnectedDevice, midiDevices } from './synth-midi';
import { soundState, setMuted, setVolume } from './sound';

export type LineKind = 'cmd' | 'out' | 'ok' | 'err' | 'accent' | 'gold';
export interface ConsoleLine {
	kind: LineKind;
	text: string;
}

const WELCOME: ConsoleLine[] = [
	{ kind: 'ok', text: 'KRSZ-EDGE WORKBENCH READY // TYPE "help" OR USE [0-2] HOTKEYS' }
];

const MAX_LINES = 300;

/** Scrollback buffer — lives in a store so it survives visiting /synth (which unmounts the console). */
export const consoleBuffer = writable<ConsoleLine[]>([...WELCOME]);
/** Submitted commands, newest last — for ArrowUp/ArrowDown recall. */
export const commandHistory = writable<string[]>([]);

function push(lines: ConsoleLine[]): void {
	consoleBuffer.update((buf) => [...buf, ...lines].slice(-MAX_LINES));
}

const out = (text: string): ConsoleLine => ({ kind: 'out', text });
const ok = (text: string): ConsoleLine => ({ kind: 'ok', text });
const err = (text: string): ConsoleLine => ({ kind: 'err', text });
const accent = (text: string): ConsoleLine => ({ kind: 'accent', text });

const EXTERNAL_LINKS: Record<string, string> = {
	blog: 'https://blog.krsz.in',
	agent: 'https://agent.krsz.in',
	share: 'https://share.krsz.in',
	sharetube: 'https://sharetube.krsz.in',
	mail: 'https://mail.krsz.in',
	skill: 'https://skill.krsz.in/rules',
	rules: 'https://skill.krsz.in/rules',
	gh: 'https://github.com/kurashizu',
	hf: 'https://huggingface.co/kurashizu',
	oshwhub: 'https://oshwhub.com/Kurashizu'
};

const NAV_WORDS: Record<string, number> = {
	'0': 0, modules: 0, projects: 0, cluster: 0, overview: 0, specs: 0,
	'1': 1, guestbook: 1, packets: 1,
	'2': 2, synth: 2, audio: 2
};

const THEME_ALIASES: Record<string, WorkspaceTheme> = {
	tokyo: 'tokyo-matte', 'tokyo-matte': 'tokyo-matte',
	gruvbox: 'gruvbox-dark', 'gruvbox-dark': 'gruvbox-dark',
	nord: 'nord-terminal', 'nord-terminal': 'nord-terminal',
	amber: 'cyber-amber', 'cyber-amber': 'cyber-amber'
};

const VALID_DIVS = ['4', '2', '1', '1/2', '1/4', '1/8'];
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
	out('  0|modules  1|guestbook  2|synth     switch tab'),
	out('  open <project>     launch a project in a new tab'),
	out('  ' + Object.keys(EXTERNAL_LINKS).join(' · ')),
	accent('── INFO ────────────────────────────────────'),
	out('  ls          list the live projects'),
	out('  whoami      operator profile'),
	out('  tracks      sequencer track states'),
	out('  songs       built-in songs (● = loaded)'),
	out('  midi        MIDI device status'),
	out('  date        current time (Sydney / UTC)'),
	out('  history     recent commands'),
	out('  banner      print the KRSZ banner'),
	accent('── SYNTH ───────────────────────────────────'),
	out('  play / stop / seq        transport control'),
	out('  load <song>              load built-in song'),
	out('  bpm [40-300]             show / set tempo'),
	out('  vol [0-100] · mute · unmute   master volume'),
	out('  snap <div> · dur <div>   grid: 4 2 1 1/2 1/4 1/8'),
	out('  meter <sig>              4/4 3/4 2/4 5/4 6/8 7/8'),
	out('  blend <layer|fm|ring|sync>   active track blend'),
	accent('── MISC ────────────────────────────────────'),
	out('  eval <expr>     safe math (e.g. eval 2**16)'),
	out('  echo <text>     print text'),
	out('  theme [name]    cycle or set: tokyo gruvbox nord amber'),
	out('  clear / Ctrl+L  clear screen · Tab completes · ↑↓ history')
];

export function executeCommand(raw: string): void {
	const input = raw.trim();
	if (!input) return;

	commandHistory.update((h) => (h[h.length - 1] === input ? h : [...h, input]).slice(-100));
	push([{ kind: 'cmd', text: input }]);

	const parts = input.split(/\s+/);
	const cmd = parts[0].toLowerCase();
	const args = parts.slice(1).join(' ');

	// ── navigation ──
	if (cmd in NAV_WORDS) {
		const tab = NAV_WORDS[cmd];
		goto(TAB_ROUTES[tab]);
		push([ok(`Navigated to ${TAB_ROUTES[tab]}`)]);
		return;
	}

	if (cmd === 'open') {
		const key = args.trim().toLowerCase();
		const url = EXTERNAL_LINKS[key] ?? MODULES.find((m) => m.id === key)?.url;
		if (url) {
			window.open(url, '_blank');
			push([ok(`Opened ${url}`)]);
		} else {
			push([err(`Unknown project: "${key}". Try: ${Object.keys(EXTERNAL_LINKS).join(', ')}`)]);
		}
		return;
	}

	if (cmd in EXTERNAL_LINKS) {
		window.open(EXTERNAL_LINKS[cmd], '_blank');
		push([ok(`Opened ${EXTERNAL_LINKS[cmd]}`)]);
		return;
	}

	// ── info ──
	if (cmd === 'help' || cmd === 'man' || cmd === '?') {
		push(HELP);
		return;
	}

	if (cmd === 'ls' || cmd === 'll') {
		push([
			accent(`${MODULES.length} live projects:`),
			...MODULES.map((m) => out(`  ${m.id.padEnd(10)} ${m.name.padEnd(22)} ${m.tag}`))
		]);
		return;
	}

	if (cmd === 'whoami' || cmd === 'about') {
		push([
			out('kurashizu — IT Masters @ UNSW'),
			out('Sydney, Australia [UTC+10/11]'),
			out('Stack: SvelteKit · uv · FFmpeg · D1 · Vectorize'),
			out('"Follow best practices & KISS"')
		]);
		return;
	}

	if (cmd === 'tracks' || cmd === 'trk') {
		const tracks = get(tracksState);
		const active = get(activeTrackId);
		push([
			accent('SEQ TRACKS:'),
			...tracks.map((t) =>
				out(
					`  ${t.id === active ? '▶' : ' '} ${t.name.padEnd(24)} ${t.muted ? '[MUTED]' : '       '} ${t.solo ? '[SOLO]' : ''}`
				)
			)
		]);
		return;
	}

	if (cmd === 'songs') {
		const current = get(builtinSongIdx);
		push([
			accent('BUILT-IN SONGS:'),
			...BUILTIN_SONGS.map((s, i) =>
				out(`  ${i === current ? '●' : '○'} ${s.name.padEnd(20)} ${String(s.bpm).padStart(3)}bpm · ${s.meter} · ${s.steps} steps`)
			)
		]);
		return;
	}

	if (cmd === 'load') {
		const q = args.trim().toLowerCase();
		if (!q) {
			push([err('Usage: load <song> — try "songs" to list them')]);
			return;
		}
		const idx = BUILTIN_SONGS.findIndex((s) => s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q));
		if (idx === -1) {
			push([err(`No song matches "${q}". Try "songs".`)]);
		} else {
			handleLoadBuiltinSong(idx);
			push([ok(`Loaded ${BUILTIN_SONGS[idx].name} (${BUILTIN_SONGS[idx].bpm} BPM, ${BUILTIN_SONGS[idx].meter})`)]);
		}
		return;
	}

	if (cmd === 'midi') {
		const device = get(midiConnectedDevice);
		const devices = get(midiDevices);
		push(
			device
				? [ok(`MIDI CONNECTED: ${device}`), ...devices.map((d) => out(`  · ${d.name}`))]
				: [out('MIDI: standby — no input device connected')]
		);
		return;
	}

	if (cmd === 'date' || cmd === 'time') {
		const now = new Date();
		const syd = new Intl.DateTimeFormat('en-AU', {
			timeZone: 'Australia/Sydney',
			dateStyle: 'medium',
			timeStyle: 'medium'
		}).format(now);
		push([out(`SYDNEY  ${syd}`), out(`UTC     ${now.toISOString().replace('T', ' ').slice(0, 19)}`)]);
		return;
	}

	if (cmd === 'history') {
		const h = get(commandHistory).slice(0, -1).slice(-15);
		push(h.length ? h.map((c, i) => out(`  ${String(i + 1).padStart(2)}  ${c}`)) : [out('history is empty')]);
		return;
	}

	if (cmd === 'banner') {
		push(BANNER.map((l) => ({ kind: 'gold' as LineKind, text: l })));
		return;
	}

	// ── synth ──
	if (cmd === 'play') {
		setMuted(false);
		play();
		push([ok('Sequencer playing.')]);
		return;
	}
	if (cmd === 'stop') {
		stop();
		push([ok('Sequencer stopped.')]);
		return;
	}
	if (cmd === 'seq' || cmd === 'sequence') {
		const playing = toggleSeq();
		if (playing) setMuted(false);
		push([ok(`Sequencer ${playing ? 'playing' : 'stopped'}.`)]);
		return;
	}

	if (cmd === 'bpm') {
		if (!args) {
			push([out(`BPM: ${get(bpm)} — ${get(isSeqPlaying) ? 'playing' : 'stopped'}`)]);
			return;
		}
		const val = parseInt(args, 10);
		if (!isNaN(val) && val >= 40 && val <= 300) {
			setBpm(val);
			push([ok(`BPM set to ${val}.`)]);
		} else {
			push([err(`Invalid BPM "${args}" — expected 40-300.`)]);
		}
		return;
	}

	if (cmd === 'vol' || cmd === 'volume') {
		const state = get(soundState);
		if (!args) {
			push([out(`Master volume: ${Math.round(state.volume * 100)}%${state.muted ? ' (muted)' : ''}`)]);
			return;
		}
		const val = parseInt(args, 10);
		if (!isNaN(val) && val >= 0 && val <= 100) {
			setVolume(val / 100);
			push([ok(`Master volume set to ${val}%.`)]);
		} else {
			push([err(`Invalid volume "${args}" — expected 0-100.`)]);
		}
		return;
	}
	if (cmd === 'mute') {
		setMuted(true);
		push([ok('Muted.')]);
		return;
	}
	if (cmd === 'unmute') {
		setMuted(false);
		push([ok('Unmuted.')]);
		return;
	}

	if (cmd === 'snap' || cmd === 'grid') {
		const d = args.trim();
		if (VALID_DIVS.includes(d)) {
			setSnapDiv(d as NoteDurationDiv);
			push([ok(`Grid snap set to ${d} beat.`)]);
		} else {
			push([err(`Invalid snap "${args}". Valid: ${VALID_DIVS.join(' ')}`)]);
		}
		return;
	}

	if (cmd === 'dur' || cmd === 'notelen' || cmd === 'div') {
		const d = args.trim();
		if (VALID_DIVS.includes(d)) {
			setNoteDur(d as NoteDurationDiv);
			push([ok(`Note duration set to ${d} beat.`)]);
		} else {
			push([err(`Invalid duration "${args}". Valid: ${VALID_DIVS.join(' ')}`)]);
		}
		return;
	}

	if (cmd === 'meter' || cmd === 'timesig' || cmd === 'sig') {
		const m = args.trim();
		if (VALID_METERS.includes(m)) {
			setTimeMeter(m as TimeSignature);
			push([ok(`Time signature set to ${m} (${METER_SPECS[m as TimeSignature].name}).`)]);
		} else {
			push([err(`Invalid meter "${args}". Valid: ${VALID_METERS.join(' ')}`)]);
		}
		return;
	}

	if (cmd === 'blend') {
		const mode = args.toLowerCase();
		if (['layer', 'fm', 'ring', 'sync'].includes(mode)) {
			updateActiveTrack({ blendMode: mode as BlendMode });
			push([ok(`Track ${get(activeTrackId) + 1} blend mode set to ${mode.toUpperCase()}`)]);
		} else {
			push([err('Usage: blend <layer|fm|ring|sync>')]);
		}
		return;
	}

	// ── misc ──
	if (cmd === 'eval' || cmd === 'calc' || cmd === 'js') {
		push([out(`=> ${evaluateSafeJS(args)}`)]);
		return;
	}

	if (cmd === 'echo') {
		push([out(args)]);
		return;
	}

	if (cmd === 'theme') {
		const q = args.trim().toLowerCase();
		if (!q) {
			cycleTheme();
			push([ok(`Theme: ${get(theme)}`)]);
			return;
		}
		const t = THEME_ALIASES[q];
		if (t) {
			theme.set(t);
			push([ok(`Theme set to ${t}.`)]);
		} else {
			push([err(`Unknown theme "${q}". Valid: ${Object.keys(THEME_STYLES).join(', ')}`)]);
		}
		return;
	}

	if (cmd === 'clear' || cmd === 'cls') {
		consoleBuffer.set([]);
		return;
	}

	push([err(`Command not recognized: "${cmd}". Type "help".`)]);
}

// ── Tab completion ──────────────────────────────────────────────────────────
const COMMAND_NAMES = [
	'help', 'clear', 'ls', 'open', 'whoami', 'date', 'history', 'banner', 'tracks', 'songs', 'load',
	'play', 'stop', 'seq', 'bpm', 'vol', 'mute', 'unmute', 'midi', 'theme', 'eval', 'echo',
	'snap', 'dur', 'meter', 'blend', 'modules', 'guestbook', 'synth',
	...Object.keys(EXTERNAL_LINKS)
];

const ARG_COMPLETIONS: Record<string, string[]> = {
	open: [...Object.keys(EXTERNAL_LINKS)],
	load: BUILTIN_SONGS.map((s) => s.id.toLowerCase()),
	theme: Object.keys(THEME_ALIASES),
	blend: ['layer', 'fm', 'ring', 'sync'],
	snap: VALID_DIVS,
	dur: VALID_DIVS,
	meter: VALID_METERS
};

/** Returns the completed input line, or null if there is no match. */
export function completeCommand(input: string): string | null {
	const parts = input.split(/\s+/);
	if (parts.length <= 1) {
		const q = (parts[0] ?? '').toLowerCase();
		if (!q) return null;
		const matches = COMMAND_NAMES.filter((c) => c.startsWith(q));
		if (matches.length === 0) return null;
		if (matches.length === 1) return matches[0] + ' ';
		push([out(matches.join('  '))]);
		return null;
	}
	const base = parts[0].toLowerCase();
	const candidates = ARG_COMPLETIONS[base];
	if (!candidates) return null;
	const q = parts[parts.length - 1].toLowerCase();
	const matches = candidates.filter((c) => c.startsWith(q));
	if (matches.length === 0) return null;
	if (matches.length === 1) return [...parts.slice(0, -1), matches[0]].join(' ') + ' ';
	push([out(matches.join('  '))]);
	return null;
}
