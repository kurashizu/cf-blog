import { get } from 'svelte/store';
import { MODULES } from './data/modules';
import { EXTERNAL_LINKS } from './links';
import { THEME_STYLES } from './stores/theme';
import { BUILTIN_SONGS, builtinSongIdx } from './stores/synth-patch';
import { tracksState } from './stores/synth-tracks';
import { edgeTrace, edgeTraceMs, edgeTraceStatus } from './stores/edge';

/**
 * A read-only virtual filesystem for the console. Nothing here is authored
 * separately from what the site already shows — every file is a projection of
 * `MODULES`, the live stores, or the edge trace, so it cannot drift out of sync
 * or state anything the rest of the portal doesn't.
 */
export interface VFile {
	type: 'file';
	name: string;
	/** Resolved at read time so `/synth` and `/edge` reflect live state. */
	read: () => string[];
	/** Extra column shown by `ls -l`. */
	note?: string;
}

export interface VDir {
	type: 'dir';
	name: string;
	children: VNode[];
	note?: string;
}

export type VNode = VFile | VDir;

const file = (name: string, read: () => string[], note?: string): VFile => ({ type: 'file', name, read, note });
const lines = (...xs: string[]) => () => xs;

function moduleDir(m: (typeof MODULES)[number]): VDir {
	return {
		type: 'dir',
		name: m.id,
		note: m.tag,
		children: [
			file(
				'README',
				lines(
					`${m.name}  [${m.badge}]`,
					`url:  ${m.url}`,
					`tag:  ${m.tag}`,
					'',
					...wrap(m.desc, 68)
				),
				m.name
			),
			file('tech.txt', lines(...m.tech.map((t) => `- ${t}`)), `${m.tech.length} entries`),
			file('facts.txt', lines(...m.facts.flatMap((f) => wrap(`* ${f}`, 68))), `${m.facts.length} verified`),
			file('topology.mmd', lines(...m.topology.split('\n')), 'mermaid'),
			file('url', lines(m.url))
		]
	};
}

/** Hard-wrap on word boundaries so long prose stays inside the console gutter. */
function wrap(text: string, width: number): string[] {
	const words = text.split(/\s+/);
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

function pad(label: string, width = 14): string {
	return label.padEnd(width);
}

export const ROOT: VDir = {
	type: 'dir',
	name: '',
	children: [
		{
			type: 'dir',
			name: 'projects',
			note: `${MODULES.length} live nodes`,
			children: [
				...MODULES.map(moduleDir),
				file(
					'index',
					lines(...MODULES.map((m) => `${m.id.padEnd(10)} ${m.name.padEnd(22)} ${m.tag}`)),
					`${MODULES.length} rows`
				)
			]
		},
		{
			type: 'dir',
			name: 'operator',
			note: 'kurashizu',
			children: [
				file(
					'profile.txt',
					lines(
						`${pad('operator')}kurashizu (IT Masters @ UNSW)`,
						`${pad('location')}Sydney, Australia [UTC+10/11]`,
						`${pad('motto')}"Follow best practices & KISS"`,
						`${pad('runtime')}100% serverless edge isolates`,
						`${pad('stack')}SvelteKit · uv · FFmpeg · D1 · Vectorize`,
						`${pad('status')}open for research`
					)
				),
				file(
					'links.txt',
					lines(
						...Object.entries(EXTERNAL_LINKS)
							.filter(([k]) => k !== 'rules')
							.map(([k, v]) => `${k.padEnd(10)} ${v}`)
					),
					'open <name>'
				)
			]
		},
		{
			type: 'dir',
			name: 'synth',
			note: 'live state',
			children: [
				file('songs.txt', () => {
					const current = get(builtinSongIdx);
					return BUILTIN_SONGS.map(
						(s, i) =>
							`${i === current ? '●' : '○'} ${s.name.padEnd(20)} ${String(s.bpm).padStart(3)}bpm · ${s.meter} · ${s.steps} steps`
					);
				}, `${BUILTIN_SONGS.length} built-in`),
				file('tracks.txt', () =>
					get(tracksState).map(
						(t) => `${String(t.id + 1).padStart(2)}  ${t.name.padEnd(24)} ${t.muted ? 'MUTED' : '     '} ${t.solo ? 'SOLO' : ''}`
					)
				)
			]
		},
		{
			type: 'dir',
			name: 'edge',
			note: 'cdn-cgi/trace',
			children: [
				file('trace', () => {
					const t = get(edgeTrace);
					if (!t) return [`trace ${get(edgeTraceStatus)} — run "trace" to probe the edge`];
					const ms = get(edgeTraceMs);
					return [
						...Object.entries(t.raw).map(([k, v]) => `${k.padEnd(13)}${v}`),
						...(ms === null ? [] : [`${pad('probe_rtt', 13)}${ms}ms (browser-measured)`])
					];
				})
			]
		},
		{
			type: 'dir',
			name: 'etc',
			children: [
				file(
					'motd',
					lines(
						"Kurashizu's Random-Stuff Zone — 100% serverless edge.",
						'Every number on this site is measured in your browser or read',
						'from the origin it describes. Nothing is decorative.'
					)
				),
				file('themes', lines(...Object.keys(THEME_STYLES)), 'theme <name>'),
				file(
					'hotkeys',
					lines(
						`${pad('Ctrl+0..3', 12)}switch tab`,
						`${pad('T', 12)}cycle theme`,
						`${pad('`', 12)}drop-down console`,
						`${pad('?', 12)}hotkey reference`,
						`${pad('Tab', 12)}complete / cycle in the console`
					)
				)
			]
		}
	]
};

// ── path resolution ─────────────────────────────────────────────────────────

/** Normalize `base` + `input` into an absolute, `..`-collapsed path. */
export function resolvePath(cwd: string, input: string): string {
	const startsAbsolute = input.startsWith('/');
	const parts = (startsAbsolute ? input : `${cwd}/${input}`).split('/');
	const stack: string[] = [];
	for (const part of parts) {
		if (!part || part === '.') continue;
		if (part === '..') stack.pop();
		else stack.push(part);
	}
	return `/${stack.join('/')}`;
}

export function lookup(path: string): VNode | null {
	const parts = path.split('/').filter(Boolean);
	let node: VNode = ROOT;
	for (const part of parts) {
		if (node.type !== 'dir') return null;
		const next: VNode | undefined = node.children.find((c) => c.name === part);
		if (!next) return null;
		node = next;
	}
	return node;
}

/** Every path in the tree, for Tab completion. */
export function allPaths(node: VNode = ROOT, prefix = ''): string[] {
	const path = node === ROOT ? '/' : `${prefix}/${node.name}`;
	if (node.type === 'file') return [path];
	return [
		...(node === ROOT ? [] : [`${path}/`]),
		...node.children.flatMap((c) => allPaths(c, node === ROOT ? '' : path))
	];
}

/** `tree`-style rendering with box-drawing connectors. */
export function renderTree(node: VNode, prefix = '', isLast = true, isRoot = true): string[] {
	const rows: string[] = [];
	if (!isRoot) {
		rows.push(`${prefix}${isLast ? '└── ' : '├── '}${node.name}${node.type === 'dir' ? '/' : ''}`);
	}
	if (node.type === 'dir') {
		const childPrefix = isRoot ? '' : prefix + (isLast ? '    ' : '│   ');
		node.children.forEach((c, i) =>
			rows.push(...renderTree(c, childPrefix, i === node.children.length - 1, false))
		);
	}
	return rows;
}
