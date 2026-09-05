<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { fade, fly, scale } from '$lib/perf-transitions';
	import { cubicOut } from 'svelte/easing';
	import { playSound } from '../../sound';
	import { resolvedTheme, THEME_STYLES } from '../../stores/theme';
	import { isLooping } from './markdown';
	import {
		CONFIG_LIMITS,
		DEFAULT_CONFIG,
		PART_SIZES_MB,
		TOTAL_DOWNLOAD_MB,
		loadConfig,
		probeGpu,
		saveConfig,
		type Attachment,
		type ChatConfig,
		type GpuSupport
	} from './engine';
	import {
		loadSessions,
		putSession,
		deleteSession as dbDeleteSession,
		clearSessions,
		sessionsSize,
		titleFor,
		newSessionId,
		type Session,
		type StoredAttachment
	} from './sessions';
	import { TOOLS, callTool } from './tools';
	import RichReply from './RichReply.svelte';

	type Phase = 'idle' | 'loading' | 'ready' | 'generating' | 'error';

	interface ToolCall {
		id: string;
		name: string;
		args: string;
	}

	interface Turn {
		role: 'user' | 'assistant';
		content: string;
		/**
		 * The model's reasoning, kept apart from the answer. The runtime reports
		 * the two separately, so unlike the previous engine there is nothing to
		 * parse back out of the text.
		 */
		reasoning?: string;
		attachments?: Attachment[];
		/** Set on system notices, which are never sent to the model. */
		notice?: boolean;
		/** Tools this reply asked for, shown in the transcript and sent back. */
		toolCalls?: ToolCall[];
		/** True on a turn holding what a tool returned. */
		toolResult?: boolean;
		toolCallId?: string;
		toolName?: string;
	}

	/**
	 * The site is deliberately not described as "terminal-styled": a model this
	 * size read that as a role to play and answered "hi" with invented console
	 * chrome ([SYSTEM ONLINE], [ERROR] Invalid input) instead of a greeting.
	 */
	const SYSTEM_PROMPT =
		'A helpful assistant on krsz.in, running in the visitor’s browser. ' +
		'run_js is for exact calculation only; for diagrams write a ```mermaid block. ' +
		'Use the conversation’s language. Never act as a terminal.';

	let phase = $state<Phase>('idle');
	let gpu = $state<GpuSupport | null>(null);
	let worker: Worker | null = null;

	let progressText = $state('');
	let progressPct = $state(0);
	let errorText = $state('');

	let turns = $state<Turn[]>([]);
	let draft = $state('');
	let pending = $state<Attachment[]>([]);
	let scroller: HTMLDivElement | undefined = $state();
	let inputEl: HTMLTextAreaElement | undefined = $state();
	let fileEl: HTMLInputElement | undefined = $state();

	let lastStats = $state('');

	/**
	 * What the model is doing before the first token arrives.
	 *
	 * Reading a prompt is not instant — on a cold cache the whole conversation
	 * has to be read before a word comes back, which is seconds of silence — and
	 * a reply that has begun streaming is a different wait from one that has not.
	 * The two are named separately so neither looks like a stall.
	 */
	const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
	let spinnerTick = $state(0);
	let waitedSecs = $state(0);

	/** Real prompt length of the last turn, reported by the worker. */
	let usedTokens = $state(0);
	/**
	 * What the wait actually is.
	 *
	 * Not "thinking": before the first token the model is reading the prompt,
	 * which it does whether or not reasoning is switched on, and calling that
	 * thinking is wrong in the common case. Once reasoning is on and tokens have
	 * started arriving, it genuinely is thinking, and the reasoning block says so
	 * on its own.
	 */
	let waitLabel = $derived(
		usedTokens > 0 && waitedSecs >= 4 ? 'reading the conversation…' : 'processing…'
	);
	let thinkMode = $state(false);
	let sessions = $state<Session[]>([]);
	let sessionId = $state('');
	/** Refreshed whenever the storage panel opens, so the figure is current. */
	let savedSize = $state<{ count: number; bytes: number } | null>(null);
	/** What the model weights actually occupy on this device, once measured. */
	let modelCacheSize = $state<{ count: number; bytes: number } | null>(null);
	let wipingModel = $state(false);
	/** Microphones offered in CONFIG; labels need permission, so this is lazy. */
	let openThink = $state<Set<number>>(new Set());
	let compacting = $state('');
	let completionIdx = $state(-1);

	let config = $state<ChatConfig>({ ...DEFAULT_CONFIG });
	let ctxPct = $derived(
		config.contextWindow ? Math.min(100, Math.round((usedTokens / config.contextWindow) * 100)) : 0
	);
	let configOpen = $state(false);
	let storageOpen = $state(false);

	/** Bytes seen per file during load, so one bar can cover four downloads. */
	let fileProgress = $state<Record<string, { loaded: number; total: number }>>({});

	let themeStyles = $derived(THEME_STYLES[$resolvedTheme]);
	let busy = $derived(phase === 'loading' || phase === 'generating');

	const COMMANDS = [
		{ name: 'help', hint: 'list these commands' },
		{ name: 'clear', hint: 'wipe the conversation' },
		{ name: 'new', hint: 'start a fresh conversation, keeping this one' },
		{ name: 'compact', hint: 'summarise the history, freeing context' },
		{ name: 'stats', hint: 'last decode speed and turn count' }
	] as const;

	let completions = $derived.by(() => {
		const m = draft.match(/^\/(\w*)$/);
		if (!m) return [];
		const q = m[1].toLowerCase();
		const hits = COMMANDS.filter((c) => c.name.startsWith(q));
		return hits.length === 1 && hits[0].name === q ? [] : hits;
	});

	$effect(() => {
		// Reads `phase` and nothing else. The earlier version also wrote
		// `waitedSecs` on the non-generating path, and `waitedSecs` feeds
		// `waitLabel`, which the template renders — so the effect depended on its
		// own writes. Svelte then stopped propagating the update that triggered
		// it, and `phase = 'ready'` never reached the DOM: the worker reported
		// itself loaded while the page sat on the loading screen.
		if (phase !== 'generating') return;

		const started = Date.now();
		spinnerTick = 0;
		waitedSecs = 0;
		const id = setInterval(() => {
			spinnerTick++;
			waitedSecs = Math.floor((Date.now() - started) / 1000);
		}, 120);
		return () => clearInterval(id);
	});

	onMount(() => {
		config = loadConfig();
		sessionId = newSessionId();
		// Reopen the most recent conversation, so a reload continues where the
		// visitor left off rather than dropping them into a blank page.
		void loadSessions().then((list) => {
			sessions = list;
			if (list.length) restoreSession(list[0]);
		});
		probeGpu().then((g) => {
			gpu = g;
			// No WebGPU is not fatal any more — wasm still runs, just slowly. The
			// idle screen explains the trade rather than refusing to start.
		});
		return () => teardown();
	});

	function teardown() {
		worker?.terminate();
		worker = null;
		for (const t of turns) t.attachments?.forEach((a) => URL.revokeObjectURL(a.url));
		pending.forEach((a) => URL.revokeObjectURL(a.url));
	}

	function fmtMb(mb: number): string {
		return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${Math.round(mb)} MB`;
	}

	/** Conversations are usually kilobytes, where fmtMb would just read "0 MB". */
	function fmtBytes(b: number): string {
		if (b < 1024) return `${Math.round(b)} B`;
		if (b < 1048576) return `${(b / 1024).toFixed(b < 10240 ? 1 : 0)} KB`;
		return `${(b / 1048576).toFixed(1)} MB`;
	}

	/** Starts the worker and wires its protocol to this component's state. */
	function spawnWorker(): Worker {
		const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
		w.onmessage = (e: MessageEvent) => {
			const m = e.data;
			switch (m.type) {
				case 'log':
					// Surfaced so a failed load says why instead of silently
					// returning to the idle screen.
					if (m.level === 'error') onWorkerError(m.text);
					break;
				case 'progress':
					onProgress(m.loaded, m.total);
					break;
				case 'ready':
					phase = 'ready';
					progressText = '';
					void tick().then(() => inputEl?.focus());
					break;
				case 'reasoning':
					// The runtime separates reasoning from the answer, so it arrives
					// already delimited rather than having to be parsed back out.
					appendReasoning(m.text);
					break;
				case 'token':
					appendToken(m.text);
					break;
				case 'done':
					void finishTurn(m.tokensPerSecond, m.toolCalls ?? []);
					break;
				case 'error':
					onWorkerError(m.message);
					break;
			}
		};
		w.onerror = (e) => onWorkerError(e.message || 'the worker failed');
		return w;
	}

	/** The runtime reports bytes across every shard as one running total. */
	function onProgress(loaded: number, total: number) {
		// Before the first byte arrives the reported total is 0; the published
		// figure keeps the bar from racing to 100% and then restarting.
		const denom = total || TOTAL_DOWNLOAD_MB * 1048576;
		progressPct = Math.min(99, Math.round((loaded / denom) * 100));
		progressText = loaded
			? `${fmtMb(loaded / 1048576)} of ${fmtMb(denom / 1048576)}`
			: 'preparing the model…';
	}

	function onWorkerError(message: string) {
		if (phase === 'generating') {
			// A failed turn keeps the session: the model is still resident.
			const next = [...turns];
			next[next.length - 1] = { role: 'assistant', content: `that turn failed: ${message}`, notice: true };
			turns = next;
			phase = 'ready';
		} else {
			phase = 'error';
			errorText = message;
			teardown();
		}
	}

	function appendToken(text: string) {
		const next = [...turns];
		const last = next[next.length - 1];
		const grown = last.content + text;
		next[next.length - 1] = { ...last, role: 'assistant', content: grown };
		turns = next;
		void scrollToEnd();

		if (config.loopGuard && isLooping(grown)) {
			worker?.postMessage({ type: 'interrupt' });
		}
	}

	function appendReasoning(text: string) {
		const next = [...turns];
		const last = next[next.length - 1];
		next[next.length - 1] = { ...last, role: 'assistant', reasoning: (last.reasoning ?? '') + text };
		turns = next;
		void scrollToEnd();
	}

	async function finishTurn(tps: number, toolCalls: ToolCall[] = []) {
		if (tps > 0) lastStats = `${tps.toFixed(1)} tok/s`;

		// A reply that ends in tool calls is only half a turn: run them, hand the
		// results back, and let the model finish with what it learned.
		if (toolCalls.length && !compacting) {
			await runToolCalls(toolCalls);
			return;
		}

		if (compacting) {
			// The summary was streamed into the last turn; fold it into history.
			const summary = (turns[turns.length - 1]?.content ?? '').trim();
			compacting = '';
			if (summary) {
				dropAttachments();
				turns = [{ role: 'assistant', content: `[compacted]\n${summary}`, notice: true }];
			} else {
				notice('compact failed — the model returned nothing.');
			}
		}
		phase = 'ready';
		void persist();
		void tick().then(() => inputEl?.focus());
	}


	function load() {
		if (busy) return;
		// An explicit webgpu choice on a machine without it would fail deep in the
		// runtime with an opaque error; say so here instead.
		if (!gpu?.ok) {
			phase = 'error';
			errorText = gpu?.reason ?? 'WebGPU is unavailable.';
			return;
		}
		phase = 'loading';
		errorText = '';
		progressPct = 0;
		fileProgress = {};
		progressText = 'requesting the weights…';
		playSound('click');
		worker = spawnWorker();
		worker.postMessage({ type: 'load', contextWindow: config.contextWindow });
	}

	/**
	 * Writes the current exchange to IndexedDB, attachments included.
	 *
	 * The object URLs held in memory are not storable, so each one is fetched
	 * back into the Blob it points at — the bytes are still in the page, this
	 * just takes a reference to them the database can keep.
	 */
	async function persist() {
		if (!sessionId) return;
		const real = turns.filter((t) => t.content.trim() || t.attachments?.length);
		if (!real.length) {
			await dbDeleteSession(sessionId);
			sessions = sessions.filter((x) => x.id !== sessionId);
			return;
		}
		const stored = await Promise.all(
			real.map(async (t) => {
				const atts: StoredAttachment[] = [];
				for (const a of t.attachments ?? []) {
					try {
						atts.push({ kind: a.kind, name: a.name, blob: await (await fetch(a.url)).blob() });
					} catch {
						// A revoked URL cannot be recovered; the turn keeps its text.
					}
				}
				return {
					role: t.role,
					content: t.content,
					...(t.notice ? { notice: true } : {}),
					...(atts.length ? { attachments: atts } : {})
				};
			})
		);
		const entry: Session = {
			id: sessionId,
			title: titleFor(real),
			updated: Date.now(),
			think: thinkMode,
			turns: stored
		};
		await putSession(entry);
		sessions = [entry, ...sessions.filter((x) => x.id !== sessionId)];
		// Keep the storage panel's figure honest while it is open.
		if (storageOpen) void refreshSize();
	}

	function restoreSession(sess: Session) {
		dropAttachments();
		sessionId = sess.id;
		thinkMode = sess.think;
		usedTokens = 0;
		lastStats = '';
		turns = sess.turns.map((t) => ({
			role: t.role,
			content: t.content,
			notice: t.notice,
			// Fresh object URLs: the stored blobs outlive the ones this page made.
			attachments: t.attachments?.map((a) => ({
				kind: a.kind,
				name: a.name,
				url: URL.createObjectURL(a.blob)
			}))
		}));
		void scrollToEnd();
	}

	async function startSession() {
		await persist();
		dropAttachments();
		sessionId = newSessionId();
		usedTokens = 0;
		lastStats = '';
		void tick().then(() => inputEl?.focus());
	}

	/** The panel reports what is actually stored, so it is recomputed on change. */
	async function refreshSize() {
		savedSize = await sessionsSize();
		void refreshModelCache();
	}

	/**
	 * How much the weights occupy, read from wllama's own cache rather than
	 * assumed from the download size: a part-finished download leaves a file
	 * that is smaller than the figure the panel advertises, and after a wipe
	 * there is nothing there at all.
	 */
	async function refreshModelCache() {
		try {
			const { CacheManager } = await import('@wllama/wllama/esm/index.js');
			const entries = await new CacheManager().list();
			modelCacheSize = {
				count: entries.length,
				bytes: entries.reduce((n, e) => n + (e.size || 0), 0)
			};
		} catch {
			// No OPFS, or the library could not be loaded: the panel just omits it.
			modelCacheSize = null;
		}
	}

	/**
	 * Deletes the downloaded weights. The engine holds them open while it is
	 * loaded, so the worker is torn down first -- otherwise the files are
	 * removed from the directory listing but the space is not returned until
	 * the tab is closed.
	 */
	async function wipeModelCache() {
		if (wipingModel) return;
		wipingModel = true;
		try {
			teardown();
			const { CacheManager } = await import('@wllama/wllama/esm/index.js');
			await new CacheManager().clear();
			phase = 'idle';
			await refreshModelCache();
			playSound('click');
		} catch (e) {
			notice(`could not clear the model cache: ${e instanceof Error ? e.message : String(e)}`);
		} finally {
			wipingModel = false;
		}
	}

	async function wipeSessions() {
		await clearSessions();
		sessions = [];
		dropAttachments();
		sessionId = newSessionId();
		usedTokens = 0;
		savedSize = { count: 0, bytes: 0 };
	}

	async function removeSession(id: string) {
		await dbDeleteSession(id);
		sessions = sessions.filter((x) => x.id !== id);
		void refreshSize();
		// Deleting the open conversation leaves the page on a fresh one.
		if (id === sessionId) {
			dropAttachments();
			sessionId = newSessionId();
			usedTokens = 0;
		}
	}

	function dropAttachments() {
		for (const t of turns) t.attachments?.forEach((a) => URL.revokeObjectURL(a.url));
		turns = [];
		lastStats = '';
		usedTokens = 0;
		openThink = new Set();
	}

	/**
	 * Reasoning takes effect on the next reply, mid-conversation and all.
	 *
	 * The previous model needed a fresh conversation to change this — its
	 * template injected the switch into the first system turn, so flipping it
	 * later rewrote the prefix every earlier turn had been written under. This
	 * runtime passes it per request instead, verified by toggling it after a
	 * plain turn and watching the reasoning appear on the very next one.
	 */
	function setThinkMode(on: boolean) {
		thinkMode = on;
		playSound('toggle');
		void persist();
	}

	function notice(text: string) {
		turns = [...turns, { role: 'assistant', content: text, notice: true }];
	}

	function runCommand(raw: string): void {
		const [cmd] = raw.slice(1).trim().split(/\s+/);
		switch (cmd.toLowerCase()) {
			case 'help':
				notice(COMMANDS.map((c) => `/${c.name} — ${c.hint}`).join('\n'));
				return;
			case 'clear':
				dropAttachments();
				void persist();
				return;
			case 'new':
				void startSession();
				return;
			case 'stats':
				notice(
					`last decode ${lastStats || '—'}\n` +
						`turns ${turns.filter((t) => !t.notice).length}\n` +
						`attachments ${turns.reduce((a, t) => a + (t.attachments?.length ?? 0), 0)}`
				);
				return;
			case 'compact':
				compact();
				return;
			default:
				notice(`unknown command: /${cmd} — try /help`);
		}
	}

	/**
	 * Replaces the transcript with a summary of it. Runs through the same worker
	 * path as a normal turn, so it streams and can be interrupted.
	 */
	function compact() {
		const real = turns.filter((t) => !t.notice);
		if (phase !== 'ready' || !worker) {
			notice('nothing to compact — the model is not loaded.');
			return;
		}
		if (real.length < 2) {
			notice('nothing to compact yet.');
			return;
		}
		const transcript = real
			.map((t) => `${t.role === 'user' ? 'User' : 'Assistant'}: ${t.content}`)
			.join('\n');

		compacting = `summarising ${real.length} messages…`;
		turns = [...turns, { role: 'assistant', content: '' }];
		phase = 'generating';
		worker.postMessage({
			type: 'generate',
			messages: [
				{
					role: 'user',
					content: [
						{
							type: 'text',
							text:
								'Summarise the following conversation in under 120 words, keeping any facts, ' +
								'names, and decisions that later turns might rely on. Reply with the summary only.\n\n' +
								transcript
						}
					]
				}
			],
			opts: { max_tokens: 300, temperature: 0 }
		});
	}

	/** Attachments the composer is holding, added by the file picker or a paste. */
	async function addFiles(files: FileList | File[] | null) {
		if (!files) return;
		for (const f of Array.from(files)) {
			if (!f.type.startsWith('image/')) {
				notice(`${f.name} is not an image — skipped.`);
				continue;
			}
			pending = [...pending, { kind: 'image', url: URL.createObjectURL(f), name: f.name }];
		}
		await tick();
		inputEl?.focus();
	}

	function removePending(i: number) {
		URL.revokeObjectURL(pending[i].url);
		pending = pending.filter((_, n) => n !== i);
	}



	async function send() {
		const text = draft.trim();
		if (busy || phase !== 'ready' || !worker) return;
		if (!text && !pending.length) return;

		if (text.startsWith('/')) {
			draft = '';
			runCommand(text);
			void scrollToEnd();
			return;
		}

		const attachments = pending;
		turns = [
			...turns,
			{ role: 'user', content: text, attachments: attachments.length ? attachments : undefined },
			{ role: 'assistant', content: '' }
		];
		draft = '';
		pending = [];
		phase = 'generating';
		lastStats = '';
		void scrollToEnd();

		await dispatch();
	}

	/**
	 * Builds the conversation in the runtime's message shape and starts a reply.
	 *
	 * Split out from send() because a tool call finishes the same way: the tool's
	 * result is appended and this runs again, so the model can answer with what
	 * it learned.
	 */
	async function dispatch() {
		if (!worker) return;
		const history = turns.slice(0, -1).filter((t) => !t.notice);
		// Only the newest turn's images are attached. Re-sending earlier ones
		// re-encodes every past picture on every turn for nothing; what they
		// showed is already carried by the replies about them.
		const lastIdx = history.length - 1;

		const messages: Record<string, unknown>[] = [{ role: 'system', content: SYSTEM_PROMPT }];
		for (const [i, t] of history.entries()) {
			if (t.toolResult) {
				messages.push({ role: 'tool', tool_call_id: t.toolCallId, content: t.content });
				continue;
			}
			if (t.toolCalls?.length) {
				messages.push({
					role: 'assistant',
					content: t.content || null,
					tool_calls: t.toolCalls.map((c) => ({
						id: c.id,
						type: 'function',
						function: { name: c.name, arguments: c.args }
					}))
				});
				continue;
			}
			const imgs = i === lastIdx ? (t.attachments ?? []).filter((a) => a.kind === 'image') : [];
			if (imgs.length) {
				const parts: Record<string, unknown>[] = [];
				if (t.content) parts.push({ type: 'text', text: t.content });
				for (const a of imgs) {
					try {
						parts.push({ type: 'image', data: await (await fetch(a.url)).arrayBuffer() });
					} catch {
						// A revoked object URL cannot be recovered; the text still stands.
					}
				}
				messages.push({ role: t.role, content: parts });
			} else if (t.content) {
				messages.push({ role: t.role, content: t.content });
			}
		}

		// Tools are withheld from a turn that carries an image. Told it can run
		// code, a model this size reaches for it to "analyse" the picture — it
		// wrote a canvas snippet to read the pixels, which the sandbox has no DOM
		// to satisfy — when it could simply look. Wording the description against
		// it did not hold; not offering the tool does.
		const hasImage = history.some(
			(t, i) => i === lastIdx && (t.attachments ?? []).some((a) => a.kind === 'image')
		);

		worker.postMessage({
			type: 'generate',
			messages,
			tools: hasImage ? [] : TOOLS,
			enableThinking: thinkMode,
			opts: {
				max_tokens: config.maxTokens,
				temperature: config.doSample ? config.temperature : 0,
				top_p: config.topP,
				top_k: config.topK,
				repeat_penalty: config.repetitionPenalty
			}
		});
	}

	/**
	 * Runs the tools the model asked for and continues the turn.
	 *
	 * Each result becomes a turn of its own so the transcript shows what was run
	 * and what came back — a reply that silently depended on a calculation would
	 * be impossible to check.
	 */
	async function runToolCalls(calls: ToolCall[]) {
		const next = [...turns];
		const last = next[next.length - 1];
		next[next.length - 1] = { ...last, role: 'assistant', toolCalls: calls };
		turns = next;

		for (const c of calls) {
			const result = await callTool(c.name, c.args);
			turns = [
				...turns,
				{ role: 'user', content: result, toolResult: true, toolCallId: c.id, toolName: c.name }
			];
		}
		// Placeholder for the reply that reads the results.
		turns = [...turns, { role: 'assistant', content: '' }];
		void scrollToEnd();
		await dispatch();
	}

	function stopGenerating() {
		if (phase !== 'generating') return;
		worker?.postMessage({ type: 'interrupt' });
	}

	async function scrollToEnd() {
		await tick();
		if (scroller) scroller.scrollTop = scroller.scrollHeight;
	}

	function toggleThink(i: number) {
		const next = new Set(openThink);
		if (next.has(i)) next.delete(i);
		else next.add(i);
		openThink = next;
	}

	function acceptCompletion(name: string) {
		draft = `/${name}`;
		completionIdx = -1;
		inputEl?.focus();
	}

	function onKeydown(e: KeyboardEvent) {
		if (completions.length) {
			if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) {
				e.preventDefault();
				completionIdx = (Math.max(0, completionIdx) + 1) % completions.length;
				if (e.key === 'Tab') acceptCompletion(completions[completionIdx].name);
				return;
			}
			if (e.key === 'ArrowUp') {
				e.preventDefault();
				completionIdx = (Math.max(0, completionIdx) - 1 + completions.length) % completions.length;
				return;
			}
			if (e.key === 'Escape') {
				e.preventDefault();
				draft = draft + ' ';
				completionIdx = -1;
				return;
			}
			if (e.key === 'Enter' && !e.shiftKey && completionIdx >= 0) {
				e.preventDefault();
				acceptCompletion(completions[completionIdx].name);
				return;
			}
		}
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			void send();
		}
	}

	/** Pasting an image straight into the composer is the fastest way to attach. */
	function onPaste(e: ClipboardEvent) {
		const files = Array.from(e.clipboardData?.files ?? []);
		if (files.length) {
			e.preventDefault();
			void addFiles(files);
		}
	}

	function autosize(el: HTMLTextAreaElement) {
		const fit = () => {
			el.style.height = 'auto';
			el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
		};
		fit();
		el.addEventListener('input', fit);
		return { destroy: () => el.removeEventListener('input', fit) };
	}
</script>

<div
	class="flex flex-col gap-2 min-h-0 flex-1"
	ondragover={(e) => e.preventDefault()}
	ondrop={(e) => {
		e.preventDefault();
		void addFiles(e.dataTransfer?.files ?? null);
	}}
	role="region"
	aria-label="chatbot"
>
	<!-- Control strip -->
	<div
		class="flex flex-wrap items-center gap-2 px-2 py-1.5 border {themeStyles.border} rounded-xs bg-black/30 text-xs"
	>
		<span class="font-black text-[#61afef]">6:chatbot</span>
		<span class="text-white/40 hidden sm:inline">
			text · images · tools, all on your machine
		</span>

		<div class="flex-1"></div>

		{#if usedTokens > 0}
			<span
				class="hidden sm:flex items-center gap-1.5 font-mono"
				title="How much of the {config.contextWindow}-token context window the conversation occupies. /compact summarises it."
			>
				<span class="text-white/35">ctx</span>
				<span class="block h-1 w-14 bg-white/10 rounded-full overflow-hidden">
					<span
						class="block h-full transition-[width] duration-300 {ctxPct > 85
							? 'bg-[#e06c75]'
							: ctxPct > 60
								? 'bg-[#e5c07b]'
								: 'bg-[#98c379]'}"
						style="width: {ctxPct}%"
					></span>
				</span>
				<span class="tabular-nums {ctxPct > 85 ? 'text-[#e06c75]' : 'text-white/50'}">{ctxPct}%</span>
			</span>
		{/if}

		{#if compacting}
			<span class="text-[#e5c07b] font-mono">◐ {compacting}</span>
		{:else if lastStats}
			<span class="text-[#98c379] tabular-nums" title="Decode speed of the last reply">{lastStats}</span>
		{/if}

		<button
			onclick={() => {
				configOpen = !configOpen;
				if (configOpen) storageOpen = false;
				playSound('toggle');
			}}
			title="Generation limits and sampling"
			class="press px-2 py-0.5 border rounded-xs font-bold cursor-pointer transition-colors {configOpen
				? 'border-[#56b6c2] bg-[#56b6c2]/20 text-[#56b6c2]'
				: 'border-[#56b6c2]/50 text-[#56b6c2] hover:bg-[#56b6c2]/20'}"
		>
			CONFIG
		</button>

		<button
			onclick={() => {
				storageOpen = !storageOpen;
				if (storageOpen) {
					configOpen = false;
					void refreshSize();
				}
				playSound('toggle');
			}}
			title="What this page downloads and stores in your browser"
			class="press px-2 py-0.5 border rounded-xs font-bold cursor-pointer transition-colors {storageOpen
				? 'border-[#e5c07b] bg-[#e5c07b]/20 text-[#e5c07b]'
				: 'border-[#e5c07b]/50 text-[#e5c07b] hover:bg-[#e5c07b]/20'}"
		>
			STORAGE
		</button>

		{#if phase === 'ready' || phase === 'generating'}
			<!-- Live during generation too: it only drops the pending
			     attachments, which has nothing to do with the reply being
			     streamed. Disabled, it greyed out to 40% at exactly the moment
			     the two buttons beside it stayed lit, and read as broken. -->
			<button
				onclick={() => {
					dropAttachments();
					playSound('click');
					inputEl?.focus();
				}}
				class="press px-2 py-0.5 border border-white/25 text-white/70 rounded-xs font-bold cursor-pointer hover:bg-white/10"
			>
				CLEAR
			</button>
		{/if}
	</div>

	{#if configOpen}
		{@const F = [
			{ k: 'contextWindow' as const, label: 'context window', hint: 'budget before /compact' },
			{ k: 'maxTokens' as const, label: 'max output', hint: 'tokens per reply' },
			{ k: 'temperature' as const, label: 'temperature', hint: 'lower is steadier' },
			{ k: 'topP' as const, label: 'top_p', hint: 'nucleus sampling' },
			{ k: 'topK' as const, label: 'top_k', hint: 'candidates considered' },
			{ k: 'repetitionPenalty' as const, label: 'repetition penalty', hint: 'discourages repeats' }
		]}
		<div class="border {themeStyles.border} rounded-xs bg-black/30 px-2 py-2 text-xs flex flex-col gap-2" transition:fly={{ y: -6, duration: 150, opacity: 0 }}>
			<div class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
				{#each F as f (f.k)}
					<label class="flex items-center gap-2 font-mono">
						<span class="text-white/60 w-36 shrink-0" title={f.hint}>{f.label}</span>
						<input
							type="number"
							bind:value={config[f.k]}
							min={CONFIG_LIMITS[f.k].min}
							max={CONFIG_LIMITS[f.k].max}
							step={CONFIG_LIMITS[f.k].step}
							onchange={() => saveConfig(config)}
							class="no-spinner w-24 bg-black/50 border border-white/20 rounded-xs px-1.5 py-0.5 text-[#d8dee9] outline-none focus:border-[#56b6c2] tabular-nums"
						/>
					</label>
				{/each}
				<div class="flex items-center gap-2 font-mono">
					<span
						class="text-white/60 w-36 shrink-0"
						title="Let the model reason before answering. Applies to the whole conversation, so it belongs here rather than beside the message box."
					>
						reasoning
					</span>
					<button
						onclick={() => setThinkMode(!thinkMode)}
						aria-pressed={thinkMode}
						class="press px-2 py-0.5 border rounded-xs font-bold cursor-pointer transition-colors {thinkMode
							? 'border-[#c678dd] bg-[#c678dd]/20 text-[#c678dd]'
							: 'border-white/20 text-white/55 hover:border-white/50'}"
					>
						{thinkMode ? 'ON' : 'OFF'}
					</button>
					<span class="text-white/30 text-[11px]">also on the THINK button, beside the message box</span>
				</div>
				<div class="flex items-center gap-2 font-mono">
					<span class="text-white/60 w-36 shrink-0" title="Sample, rather than always take the likeliest token">
						sampling
					</span>
					<button
						onclick={() => {
							config.doSample = !config.doSample;
							saveConfig(config);
						}}
						aria-pressed={config.doSample}
						class="press px-2 py-0.5 border rounded-xs font-bold cursor-pointer transition-colors {config.doSample
							? 'border-[#56b6c2] bg-[#56b6c2]/20 text-[#56b6c2]'
							: 'border-white/20 text-white/55 hover:border-white/50'}"
					>
						{config.doSample ? 'ON' : 'OFF'}
					</button>
				</div>
				<div class="flex items-center gap-2 font-mono">
					<span class="text-white/60 w-36 shrink-0" title="Stop a reply that collapses into repetition">
						loop guard
					</span>
					<button
						onclick={() => {
							config.loopGuard = !config.loopGuard;
							saveConfig(config);
						}}
						aria-pressed={config.loopGuard}
						class="press px-2 py-0.5 border rounded-xs font-bold cursor-pointer transition-colors {config.loopGuard
							? 'border-[#56b6c2] bg-[#56b6c2]/20 text-[#56b6c2]'
							: 'border-white/20 text-white/55 hover:border-white/50'}"
					>
						{config.loopGuard ? 'ON' : 'OFF'}
					</button>
				</div>
			</div>
			<div class="flex items-center gap-2 border-t border-white/10 pt-1.5">
				<span class="text-white/35 flex-1">
					Saved in this browser. Sampling applies to the next message; the backend needs a reload.
				</span>
				<button
					onclick={() => {
						config = { ...DEFAULT_CONFIG };
						saveConfig(config);
						playSound('click');
					}}
					class="press px-2 py-0.5 border border-white/25 text-white/70 rounded-xs font-bold cursor-pointer hover:bg-white/10"
				>
					DEFAULTS
				</button>
			</div>
		</div>
	{/if}

	{#if storageOpen}
		<div class="border {themeStyles.border} rounded-xs bg-black/30 px-2 py-2 text-xs flex flex-col gap-1.5" transition:fly={{ y: -6, duration: 150, opacity: 0 }}>
			<div class="text-white/50 leading-relaxed">
				The model downloads once and is cached by the browser, so a second visit skips it. Both the
				weights and the inference runtime come from this site's own storage — nothing is fetched
				from a third party.
			</div>
			<div class="font-mono text-white/45 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-0.5">
				<span>language model</span><span class="tabular-nums">{fmtMb(PART_SIZES_MB.model)}</span>
				<span>vision projector</span><span class="tabular-nums">{fmtMb(PART_SIZES_MB.vision)}</span>
			</div>
			<div class="font-mono text-[#e5c07b] border-t border-white/10 pt-1 flex items-center justify-between gap-2">
				<span>
					total {fmtMb(TOTAL_DOWNLOAD_MB)}
					{#if modelCacheSize}
						<span class="text-white/35">
							· {modelCacheSize.count
								? `${fmtBytes(modelCacheSize.bytes)} cached here`
								: 'not downloaded yet'}
						</span>
					{/if}
				</span>
				<button
					onclick={wipeModelCache}
					disabled={wipingModel || !modelCacheSize?.count}
					title="Delete the downloaded weights from this device. The next load downloads them again."
					class="press px-2 py-0.5 border border-[#e06c75]/50 text-[#e06c75] rounded-xs font-bold cursor-pointer hover:bg-[#e06c75]/20 disabled:opacity-30 disabled:cursor-not-allowed"
				>
					{wipingModel ? 'CLEARING…' : 'WIPE MODEL'}
				</button>
			</div>

			<!-- Saved conversations -->
			<div class="border-t border-white/10 pt-1.5 flex flex-col gap-1.5">
				<div class="flex items-center justify-between gap-2">
					<span class="text-white/50">
						conversations
						{#if savedSize}
							<span class="font-mono text-white/35">
								· {savedSize.count} saved · {fmtBytes(savedSize.bytes)}
							</span>
						{/if}
					</span>
					<div class="flex gap-1">
						<button
							onclick={startSession}
							class="press px-2 py-0.5 border border-[#98c379]/50 text-[#98c379] rounded-xs font-bold cursor-pointer hover:bg-[#98c379]/20"
						>
							NEW
						</button>
						<button
							onclick={wipeSessions}
							disabled={!sessions.length}
							class="press px-2 py-0.5 border border-[#e06c75]/50 text-[#e06c75] rounded-xs font-bold cursor-pointer hover:bg-[#e06c75]/20 disabled:opacity-30 disabled:cursor-not-allowed"
						>
							DELETE ALL
						</button>
					</div>
				</div>
				<div class="text-white/35 leading-relaxed">
					Conversations, including the images and audio in them, are kept in this browser only —
					they are never uploaded.
				</div>
				{#if sessions.length}
					<div class="flex flex-col gap-0.5 max-h-56 overflow-y-auto">
						{#each sessions as sess (sess.id)}
							<div
								class="flex items-center gap-2 px-1.5 py-1 rounded-xs {sess.id === sessionId
									? 'bg-[#61afef]/10 border border-[#61afef]/30'
									: 'border border-transparent hover:bg-white/5'}"
							>
								<button
									onclick={() => restoreSession(sess)}
									class="press flex-1 text-left truncate cursor-pointer transition-colors {sess.id === sessionId
										? 'text-[#61afef]'
										: 'text-white/70 hover:text-white'}"
									title={sess.title}
								>
									{sess.title}
								</button>
								{#if sess.think}
									<span class="text-[#c678dd]/70 font-mono text-[10px] shrink-0">THINK</span>
								{/if}
								<span class="font-mono text-white/30 text-[10px] tabular-nums shrink-0">
									{sess.turns.length} turns
								</span>
								<button
									onclick={() => removeSession(sess.id)}
									title="Delete this conversation"
									aria-label="Delete conversation"
									class="press text-white/30 hover:text-[#e06c75] cursor-pointer shrink-0 px-1 transition-colors"
								>
									×
								</button>
							</div>
						{/each}
					</div>
				{:else}
					<div class="text-white/25 font-mono">no saved conversations yet</div>
				{/if}
			</div>
		</div>
	{/if}

	<!-- Transcript -->
	<div
		bind:this={scroller}
		class="flex-1 min-h-[45vh] overflow-y-auto border {themeStyles.border} rounded-xs bg-black/40 px-3 py-3 flex flex-col gap-4"
	>
		{#if phase === 'error'}
			<div class="m-auto max-w-lg text-center flex flex-col gap-3">
				<div class="text-[#e06c75] font-bold">✗ {errorText}</div>
				{#if !gpu?.ok && gpu?.fixes?.length}
					<!-- A WebGPU failure is fixable by the visitor, so say how. -->
					<ul
						class="text-left text-white/50 text-xs list-disc pl-5 space-y-1 leading-relaxed border border-white/10 rounded-xs px-3 py-2"
					>
						{#each gpu.fixes as fix (fix)}
							<li>{fix}</li>
						{/each}
					</ul>
				{/if}
				{#if gpu?.ok}
					<button
						onclick={load}
						class="press mx-auto px-3 py-1.5 border border-[#98c379] text-[#98c379] rounded-xs text-xs font-black cursor-pointer hover:bg-[#98c379] hover:text-black transition-colors"
					>
						RETRY
					</button>
				{/if}
			</div>
		{:else if phase === 'idle'}
			<div class="m-auto max-w-lg text-center flex flex-col gap-4">
				<div class="text-white/70 text-sm leading-relaxed">
					A model that reads <span class="text-[#61afef] font-bold">text and images</span>, and
					<span class="text-[#e5c07b] font-bold">runs code</span> when a number has to be exact, works
					entirely in this tab, on your own hardware. Nothing you send leaves the machine — there is
					no server on the other end of this box.
				</div>
				<div class="text-white/40 text-xs">
					First run downloads {fmtMb(TOTAL_DOWNLOAD_MB)} and caches it, so later visits start
					immediately. Runs on the GPU through WebGPU and wants roughly 4 GB of video memory —
					integrated graphics will struggle.
				</div>
				{#if gpu && !gpu.ok}
					<!-- Loading cannot work here, so lead with why and what to do about it. -->
					<div
						class="text-left border border-[#e06c75]/40 bg-[#e06c75]/5 rounded-xs px-3 py-2 text-xs flex flex-col gap-1.5"
					>
						<div class="text-[#e06c75] font-bold">✗ {gpu.reason}</div>
						{#if gpu.fixes?.length}
							<ul class="text-white/50 list-disc pl-4 space-y-1 leading-relaxed">
								{#each gpu.fixes as fix (fix)}
									<li>{fix}</li>
								{/each}
							</ul>
						{/if}
					</div>
				{:else}
					<button
						onclick={load}
						disabled={!gpu}
						class="press mx-auto px-4 py-2 border border-[#98c379] text-[#98c379] rounded-xs text-xs font-black cursor-pointer hover:bg-[#98c379] hover:text-black disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
					>
						{gpu ? '▶ LOAD MODEL' : 'checking WebGPU…'}
					</button>
				{/if}
				{#if gpu?.adapterLabel}
					<div class="text-white/30 text-[10px] font-mono">gpu: {gpu.adapterLabel}</div>
				{/if}
			</div>
		{:else if phase === 'loading'}
			<div class="m-auto w-full max-w-md flex flex-col gap-2">
				<!--
					Never blank: once the bytes are in, the runtime spends a while
					building the model before it says it is ready, and an empty panel
					in that gap reads as a crash.
				-->
				<div class="text-[#e5c07b] text-xs font-mono">
					◐ {progressText || 'preparing the model…'}
				</div>
				<div class="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
					<div class="h-full bg-[#98c379] transition-[width] duration-200" style="width: {progressPct}%"></div>
				</div>
				<div class="text-white/40 text-[10px] font-mono text-right">{progressPct}%</div>
			</div>
		{:else if turns.filter((t) => !t.notice).length === 0}
			<div class="m-auto text-white/30 text-xs font-mono text-center leading-relaxed">
				ready — say something, or drop in an image.<br />
				<span class="text-white/20">/help lists the commands</span>
			</div>
		{/if}
		<!--
			A conversation restored from a previous visit reaches none of the
			branches above — the phase is ready and turns is not empty — so the
			panel came up blank until this block, which is guarded on the phase
			rather than chained onto it.
		-->


		<!--
			The transcript only appears once the model is loaded. A restored
			conversation shown beside a LOAD MODEL button reads as though the chat
			were live, and a message typed into it would go nowhere.
		-->
		{#if phase === 'ready' || phase === 'generating'}
			{#each turns as turn, i (i)}
			<!-- Only the newly-appended turn ever plays this: existing turns keep
			     their old i and never remount, and a streaming turn's own content
			     changes in place without touching this wrapper, so the entrance
			     cannot re-fire mid-stream. -->
			<div in:fly={{ y: 6, duration: 160, opacity: 0 }}>
			{#if turn.toolResult}
				<div
					class="self-start font-mono text-[11px] text-white/45 border-l-2 border-[#e5c07b]/40 pl-2 py-0.5 whitespace-pre-wrap max-w-[85%] overflow-x-auto"
				>
					{turn.toolName} → {turn.content}
				</div>
			{:else if turn.role === 'user'}
				<div class="flex flex-col items-end gap-1">
					{#if turn.attachments?.length}
						<div class="flex flex-wrap gap-1.5 justify-end max-w-[80%]">
							{#each turn.attachments as a (a.url)}
								{#if a.kind === 'image'}
									<img
										src={a.url}
										alt={a.name}
										class="max-h-40 rounded-md border border-[#61afef]/25"
									/>
								{/if}
							{/each}
						</div>
					{/if}
					{#if turn.content}
						<div
							class="max-w-[80%] px-3 py-2 rounded-md text-sm bg-[#61afef]/12 border border-[#61afef]/25 text-[#d8dee9] whitespace-pre-wrap break-words"
						>
							{turn.content}
						</div>
					{/if}
				</div>
			{:else if turn.notice}
				<div class="text-[11px] font-mono text-white/35 whitespace-pre-wrap border-l-2 border-white/15 pl-2">
					{turn.content}
				</div>
			{:else}
				<div class="flex flex-col gap-1.5 max-w-[85%]">
					{#if turn.reasoning}
						<button
							onclick={() => toggleThink(i)}
							title="The model's reasoning, kept folded away."
							class="press self-start text-[10px] font-mono text-[#c678dd]/80 hover:text-[#c678dd] cursor-pointer transition-colors"
						>
							{openThink.has(i) ? '▾' : '▸'}
							{phase === 'generating' && i === turns.length - 1 && !turn.content
								? 'thinking…'
								: 'reasoning'} ({turn.reasoning.length} chars)

						</button>
						{#if openThink.has(i)}
							<div
								class="text-xs font-mono text-white/45 whitespace-pre-wrap border-l-2 border-[#c678dd]/30 pl-2 py-0.5 max-h-64 overflow-y-auto"
							>
								{turn.reasoning}
							</div>
						{/if}
					{/if}
					{#if turn.toolCalls?.length}
						<!-- What the model ran, so a reply that leans on a result can be checked. -->
						{#each turn.toolCalls as c (c.id)}
							<div
								class="self-start font-mono text-[11px] text-[#e5c07b]/80 border border-[#e5c07b]/25 bg-[#e5c07b]/5 rounded-xs px-2 py-1"
							>
								⚙ {c.name}({c.args})
							</div>
						{/each}
					{/if}
					{#if turn.content}
						<div
							class="self-start px-3 py-2 rounded-md text-sm bg-white/[0.06] border border-white/15 text-[#d8dee9] break-words"
						>
							{#if phase === 'generating' && i === turns.length - 1}
								<!--
									Do not rebuild the whole Markdown/KaTeX tree for every token.
									In particular, a completed formula otherwise disappears back
									to its marker while the async KaTeX pass starts again, which
									makes the reply flash. Format it once when streaming ends.
								-->
								<div class="whitespace-pre-wrap">{turn.content}</div>
							{:else}
								<RichReply content={turn.content} />
							{/if}
						</div>
					{:else if phase === 'generating' && i === turns.length - 1 && !turn.reasoning}
						<!--
							Only while nothing at all has arrived. Once reasoning starts
							streaming the model is plainly working and the reasoning block
							says so; before that there is a silent gap, seconds long on a
							cold cache, that a bare cursor made look like a hang.
						-->
						<div
							class="self-start px-3 py-2 rounded-md bg-white/[0.06] border border-white/15 text-white/45 text-sm flex items-center gap-2 font-mono"
						>
							<span class="text-[#61afef]">{SPINNER[spinnerTick % SPINNER.length]}</span>
							<span>{waitLabel}</span>
							{#if waitedSecs >= 2}
								<span class="text-white/25 tabular-nums">{waitedSecs}s</span>
							{/if}
						</div>
					{:else if !turn.reasoning && !turn.toolCalls?.length}
						<!--
							Generation finished without producing anything. The cursor alone
							left such a turn looking permanently stuck.
						-->
						<div
							class="self-start px-3 py-2 rounded-md text-xs bg-white/[0.03] border border-white/10 text-white/40 italic"
						>
							no reply — the model stopped without generating anything.
						</div>
						{/if}
					</div>
				{/if}
			</div>
			{/each}
		{/if}
	</div>

	<!-- Composer -->
	<div class="relative">
		{#if completions.length}
			<div
				class="absolute bottom-full left-0 mb-1 min-w-56 border {themeStyles.border} rounded-xs bg-black/95 py-1 text-xs font-mono shadow-lg z-20 origin-bottom"
				transition:scale={{ duration: 140, start: 0.95, opacity: 0, easing: cubicOut }}
			>
				{#each completions as c, ci (c.name)}
					<button
						onclick={() => acceptCompletion(c.name)}
						onmouseenter={() => (completionIdx = ci)}
						class="w-full text-left px-2 py-1 cursor-pointer flex gap-2 transition-colors {ci === completionIdx
							? 'bg-[#61afef]/20 text-[#61afef]'
							: 'text-[#d8dee9] hover:bg-white/10'}"
					>
						<span class="font-bold">/{c.name}</span>
						<span class="text-white/40 truncate">{c.hint}</span>
					</button>
				{/each}
				<div class="px-2 pt-1 text-[10px] text-white/25 border-t border-white/10 mt-1">
					tab completes · ↑↓ to choose · esc dismisses
				</div>
			</div>
		{/if}

		{#if pending.length}
			<div class="flex flex-wrap gap-1.5 mb-1.5">
				{#each pending as a, pi (a.url)}
					<div
						class="flex items-center gap-1.5 border {themeStyles.border} rounded-xs bg-black/40 pl-1.5 pr-1 py-1 text-[11px] font-mono"
					>
						{#if a.kind === 'image'}
							<img src={a.url} alt={a.name} class="h-8 w-8 object-cover rounded-xs" />
						{:else}
							<span class="text-[#c678dd]">♪</span>
						{/if}
						<span class="text-white/60 max-w-32 truncate">{a.name}</span>
						<button
							onclick={() => removePending(pi)}
							aria-label="remove {a.name}"
							class="press text-white/40 hover:text-[#e06c75] cursor-pointer px-1 transition-colors"
						>
							×
						</button>
					</div>
				{/each}
			</div>
		{/if}

		<div
			class="flex items-end gap-2 border {themeStyles.border} rounded-xs bg-black/40 px-2 py-1.5 focus-within:border-[#61afef] transition-colors"
		>
			<input
				bind:this={fileEl}
				type="file"
				accept="image/*"
				multiple
				class="hidden"
				onchange={(e) => {
					void addFiles(e.currentTarget.files);
					e.currentTarget.value = '';
				}}
			/>
			<button
				onclick={() => fileEl?.click()}
				disabled={phase === 'generating'}
				title="Attach an image — you can also paste or drag one in"
				class="press px-2 py-0.5 border border-[#c678dd]/50 text-[#c678dd] rounded-xs text-xs font-bold cursor-pointer hover:bg-[#c678dd]/20 disabled:opacity-30 disabled:cursor-not-allowed shrink-0 self-end mb-0.5"
			>
				IMAGE
			</button>
			<!--
				Beside IMAGE rather than buried in CONFIG: this model reads
				enable_thinking per request, so switching mid-conversation takes
				effect on the very next reply — verified by toggling it after a
				plain turn and watching the reasoning appear.
			-->
			<button
				onclick={() => setThinkMode(!thinkMode)}
				disabled={phase === 'generating'}
				title="Let the model reason before answering. Slower, and better on anything with steps."
				class="press px-2 py-0.5 border rounded-xs text-xs font-bold cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed shrink-0 self-end mb-0.5 transition-colors {thinkMode
					? 'border-[#c678dd] bg-[#c678dd]/20 text-[#c678dd]'
					: 'border-[#c678dd]/50 text-[#c678dd]/60 hover:bg-[#c678dd]/20'}"
			>
				THINK
			</button>
			<!-- Divides the action buttons from the message field. -->
			<div class="self-stretch w-px bg-white/15 shrink-0 my-0.5" aria-hidden="true"></div>
			<textarea
				bind:this={inputEl}
				bind:value={draft}
				use:autosize
				onkeydown={onKeydown}
				onpaste={onPaste}
				disabled={phase !== 'ready' && phase !== 'generating'}
				rows="1"
				placeholder={phase === 'ready' || phase === 'generating'
					? 'message, or /help'
					: 'Load the model first.'}
				style="caret-color: {themeStyles.cursorColor}"
				class="flex-1 resize-none bg-transparent border-0 outline-none font-mono text-sm text-[#d8dee9] leading-relaxed disabled:opacity-40 placeholder:text-white/25 max-h-40"
			></textarea>
			{#if phase === 'generating'}
				<button
					onclick={stopGenerating}
					class="press px-3 py-1 border border-[#e06c75] text-[#e06c75] rounded-xs text-xs font-black cursor-pointer hover:bg-[#e06c75] hover:text-black shrink-0 transition-colors"
				>
					STOP
				</button>
			{:else}
				<button
					onclick={send}
					disabled={phase !== 'ready' || (!draft.trim() && !pending.length)}
					class="press px-3 py-1 border border-[#98c379] text-[#98c379] rounded-xs text-xs font-black cursor-pointer hover:bg-[#98c379] hover:text-black disabled:opacity-30 disabled:cursor-not-allowed shrink-0 transition-colors"
				>
					SEND
				</button>
			{/if}
		</div>
	</div>
</div>

<style>
	/* Markdown produced by renderMarkdown(). Scoped to the transcript so it
	   cannot leak into the rest of the terminal chrome. */

	/* The number fields keep their typing and their validation but lose the
	   platform spinner, which was the one control on this panel the browser
	   drew in its own style -- a grey stepper beside flat bordered boxes. */
	.no-spinner {
		appearance: textfield;
		-moz-appearance: textfield;
	}
	.no-spinner::-webkit-outer-spin-button,
	.no-spinner::-webkit-inner-spin-button {
		appearance: none;
		-webkit-appearance: none;
		margin: 0;
	}
</style>
