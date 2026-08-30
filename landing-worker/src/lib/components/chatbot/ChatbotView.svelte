<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { playSound } from '../../sound';
	import { theme, THEME_STYLES } from '../../stores/theme';
	import { isLooping, renderMarkdown, splitThink } from './markdown';
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
	import AudioClip from './AudioClip.svelte';

	type Phase = 'idle' | 'loading' | 'ready' | 'generating' | 'error';

	interface Turn {
		role: 'user' | 'assistant';
		content: string;
		attachments?: Attachment[];
		/** Set on system notices, which are never sent to the model. */
		notice?: boolean;
	}

	/**
	 * Every clause here is load-bearing, and two were found by testing rather than
	 * by writing what read well.
	 *
	 * The site is not described as "terminal-styled": a model this size read that
	 * as a role to play and answered "hi" with invented console chrome ([SYSTEM
	 * ONLINE], [ERROR] Invalid input) instead of a greeting.
	 *
	 * The language line says "the language the conversation uses" rather than
	 * "the language the user wrote in". Phrasing it around what the user *writes*
	 * made the model treat the exchange as text-only and deny hearing anything —
	 * an attached recording came back as "please provide the sound". Naming the
	 * media it can perceive fixes that; the two sentences were verified against
	 * the running model, holding a 440 Hz tone constant.
	 */
	const SYSTEM_PROMPT =
		'You are a helpful assistant on krsz.in, a personal website. ' +
		'You run entirely inside the visitor’s browser on their own hardware — no server sees this conversation. ' +
		'You can see images and hear audio the visitor sends. ' +
		'Reply in the language the conversation uses. ' +
		'Never imitate a command line, and never invent system messages, status banners, or error codes.';

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
	/** Real prompt length of the last turn, reported by the worker. */
	let usedTokens = $state(0);
	let thinkMode = $state(false);
	let sessions = $state<Session[]>([]);
	let sessionId = $state('');
	/** Refreshed whenever the storage panel opens, so the figure is current. */
	let savedSize = $state<{ count: number; bytes: number } | null>(null);
	/** Shown once per session when THINK is flipped with turns already present. */
	let thinkWarned = $state(false);
	/** Microphones offered in CONFIG; labels need permission, so this is lazy. */
	let mics = $state<MediaDeviceInfo[]>([]);
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

	let themeStyles = $derived(THEME_STYLES[$theme]);
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
		// Leaving mid-take would otherwise leave the mic indicator lit.
		recorder?.stop();
		recStream?.getTracks().forEach((t) => t.stop());
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
				case 'progress':
					onProgress(m.payload);
					break;
				case 'ready':
							phase = 'ready';
					progressText = '';
					void tick().then(() => inputEl?.focus());
					break;
				case 'context':
					usedTokens = m.promptTokens;
					break;
				case 'channel':
					// The delimiters never survive decoding (they are special tokens
					// the streamer strips), so they are put back into the accumulated
					// text here and splitThink() folds the block away as before.
					appendToken(m.open ? '<|channel>' : '<channel|>');
					break;
				case 'token':
					appendToken(m.text);
					break;
				case 'done':
					finishTurn(m.tokensPerSecond);
					break;
				case 'error':
					onWorkerError(m.message);
					break;
			}
		};
		w.onerror = (e) => onWorkerError(e.message || 'the worker failed');
		return w;
	}

	/**
	 * transformers.js reports each file separately, so the bar shows total bytes
	 * across all of them rather than jumping back to zero four times.
	 */
	function onProgress(p: Record<string, unknown>) {
		const status = p.status as string;
		const file = (p.file as string) ?? '';
		if (status === 'progress' && typeof p.loaded === 'number' && typeof p.total === 'number') {
			fileProgress = { ...fileProgress, [file]: { loaded: p.loaded, total: p.total } };
		} else if (status === 'done' && fileProgress[file]) {
			const f = fileProgress[file];
			fileProgress = { ...fileProgress, [file]: { loaded: f.total, total: f.total } };
		}

		const vals = Object.values(fileProgress);
		const loaded = vals.reduce((a, v) => a + v.loaded, 0);
		// Until every file has been announced, the known total understates the
		// download — fall back to the published figure so the bar does not race
		// to 100% and then restart.
		const known = vals.reduce((a, v) => a + v.total, 0);
		const total = Math.max(known, TOTAL_DOWNLOAD_MB * 1048576);
		progressPct = total ? Math.min(99, Math.round((loaded / total) * 100)) : 0;
		progressText =
			status === 'ready' || !vals.length
				? 'preparing the model…'
				: `${fmtMb(loaded / 1048576)} of ${fmtMb(total / 1048576)}`;
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
		const grown = next[next.length - 1].content + text;
		next[next.length - 1] = { role: 'assistant', content: grown };
		turns = next;
		void scrollToEnd();

		if (config.loopGuard && isLooping(grown)) {
			worker?.postMessage({ type: 'interrupt' });
		}
	}

	function finishTurn(tps: number) {
		if (tps > 0) lastStats = `${tps.toFixed(1)} tok/s`;
		if (compacting) {
			// The summary was streamed into the last turn; fold it into history.
			const summary = splitThink(turns[turns.length - 1]?.content ?? '').answer.trim();
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
		worker.postMessage({ type: 'load' });
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
		thinkWarned = false;
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
		thinkWarned = false;
		usedTokens = 0;
		lastStats = '';
		void tick().then(() => inputEl?.focus());
	}

	/** The panel reports what is actually stored, so it is recomputed on change. */
	async function refreshSize() {
		savedSize = await sessionsSize();
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
	 * Enumerates microphones for the CONFIG list.
	 *
	 * Device labels are empty until the page has been granted microphone access
	 * once, so this is called after a successful recording as well as when the
	 * panel opens — before that the entries would all read "microphone 2".
	 */
	async function listMics() {
		try {
			const all = await navigator.mediaDevices.enumerateDevices();
			mics = all.filter((d) => d.kind === 'audioinput');
		} catch {
			mics = [];
		}
	}

	/**
	 * Reasoning is a property of the conversation, not of one message: the chat
	 * template injects `<|think|>` into the first system turn, so it governs the
	 * whole exchange. Turning it on midway rewrites the prefix every earlier turn
	 * was generated under, and the model keeps answering in the style it already
	 * sees — which is why this says so rather than silently doing nothing.
	 */
	function setThinkMode(on: boolean) {
		thinkMode = on;
		playSound('toggle');
		void persist();
		if (turns.some((t) => !t.notice) && !thinkWarned) {
			thinkWarned = true;
			notice(
				`reasoning is ${on ? 'on' : 'off'} from here, but it applies to the whole ` +
					'conversation — start a new one (NEW) for a clean run.'
			);
		}
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
			.map((t) => `${t.role === 'user' ? 'User' : 'Assistant'}: ${splitThink(t.content).answer || t.content}`)
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
			images: [],
			audio: [],
			opts: { max_new_tokens: 300, do_sample: false }
		});
	}

	/** Attachments the composer is holding, added by the file picker or a paste. */
	async function addFiles(files: FileList | File[] | null) {
		if (!files) return;
		for (const f of Array.from(files)) {
			const kind = f.type.startsWith('image/') ? 'image' : f.type.startsWith('audio/') ? 'audio' : null;
			if (!kind) {
				notice(`${f.name} is neither an image nor audio — skipped.`);
				continue;
			}
			pending = [...pending, { kind, url: URL.createObjectURL(f), name: f.name }];
		}
		await tick();
		inputEl?.focus();
	}

	function removePending(i: number) {
		URL.revokeObjectURL(pending[i].url);
		pending = pending.filter((_, n) => n !== i);
	}

	let recording = $state(false);
	let recorder: MediaRecorder | null = null;
	let recStream: MediaStream | null = null;

	/** What the audio tower was trained on. */
	const AUDIO_SAMPLE_RATE = 16000;

	/**
	 * Decodes an attachment into mono PCM at the model's sample rate.
	 *
	 * This lives on the main thread rather than in the worker because WebKit does
	 * not expose the Web Audio API to workers at all, so constructing an
	 * OfflineAudioContext there throws before any decoding can happen. Safari also
	 * still needs the webkit-prefixed constructor.
	 */
	async function decodeAudio(url: string): Promise<Float32Array> {
		const Ctor =
			(globalThis as unknown as { OfflineAudioContext?: typeof OfflineAudioContext })
				.OfflineAudioContext ??
			(globalThis as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext })
				.webkitOfflineAudioContext;
		if (!Ctor) throw new Error('this browser has no Web Audio support, so audio cannot be decoded');

		const buf = await (await fetch(url)).arrayBuffer();
		const ctx = new Ctor(1, 1, AUDIO_SAMPLE_RATE);
		const decoded = await ctx.decodeAudioData(buf);
		if (decoded.numberOfChannels === 1) return decoded.getChannelData(0);

		// Downmix: the encoder takes mono.
		const n = decoded.length;
		const mixed = new Float32Array(n);
		for (let c = 0; c < decoded.numberOfChannels; c++) {
			const ch = decoded.getChannelData(c);
			for (let i = 0; i < n; i++) mixed[i] += ch[i] / decoded.numberOfChannels;
		}
		return mixed;
	}

	/**
	 * Records from the microphone straight into an attachment. The blob's own
	 * container does not matter — decodeAudio() resamples whatever comes out.
	 */
	async function startRecording() {
		if (recording) return;
		try {
			// An exact deviceId would throw if that microphone has been unplugged;
			// asking for it as a preference falls back to the default instead.
			recStream = await navigator.mediaDevices.getUserMedia({
				audio: config.micId ? { deviceId: config.micId } : true
			});
			void listMics();
		} catch (err) {
			notice(`could not reach the microphone: ${(err as Error).message}`);
			return;
		}
		const chunks: Blob[] = [];
		const rec = new MediaRecorder(recStream);
		recorder = rec;
		rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
		rec.onstop = () => {
			// Release the mic as soon as the take ends, so no tab indicator lingers.
			recStream?.getTracks().forEach((t) => t.stop());
			recStream = null;
			recording = false;
			recorder = null;
			if (!chunks.length) return;
			// Read the type from `rec` rather than the `recorder` field, and only
			// now: stopRecording() clears that field synchronously while this fires
			// afterwards, so the field is already null, and the recorder only
			// settles on a concrete container once started. The old code took
			// `recorder?.mimeType` here and always fell back to audio/webm — which
			// happens to name what Chrome produces, but Safari records mp4, and an
			// mp4 labelled webm will not play back.
			const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
			const stamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
			pending = [...pending, { kind: 'audio', url: URL.createObjectURL(blob), name: `recording ${stamp}` }];
			void tick().then(() => inputEl?.focus());
		};
		rec.start();
		recording = true;
		playSound('click');
	}

	function stopRecording() {
		// The field is cleared in onstop, once the recorder has finished with it.
		recorder?.stop();
		playSound('click');
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

		// The processor's template wants content as typed parts, with one
		// {type:'image'} / {type:'audio'} placeholder per attachment in order.
		const history = turns.slice(0, -1).filter((t) => !t.notice);
		const images: string[] = [];
		const audioUrls: string[] = [];
		// Only the newest turn's media is sent. Re-sending earlier attachments
		// emits a placeholder for each one, but the processor derives audio
		// features from the first waveform alone, so a second recording asked
		// about later was answered from the first — and every past image would be
		// re-encoded on every turn for nothing. What those attachments showed is
		// already carried by the replies about them, which do stay in history.
		const lastIdx = history.length - 1;
		const messages = [
			// The system message must be a plain string: the chat template applies
			// `| trim` to it unconditionally, where user and assistant turns branch
			// on string-vs-sequence first. An array here fails with
			// "Unknown ArrayValue filter: trim".
			{ role: 'system', content: SYSTEM_PROMPT },
			...history.map((t, i) => {
				const parts: Record<string, string>[] = [];
				if (i === lastIdx) {
					for (const a of t.attachments ?? []) {
						parts.push({ type: a.kind });
						(a.kind === 'image' ? images : audioUrls).push(a.url);
					}
				}
				// Assistant turns go back as their answer only — reasoning stripped,
				// which is what the chat template itself does.
				const body = t.role === 'assistant' ? splitThink(t.content).answer : t.content;
				if (body) parts.push({ type: 'text', text: body });
				return { role: t.role, content: parts };
			})
			// A past turn that carried only an attachment has nothing left once its
			// media is dropped, so it is not sent as an empty turn.
			.filter((m) => m.content.length > 0)
		];

		// Decoded here rather than in the worker: WebKit gives workers no Web Audio
		// API, so the worker receives finished samples.
		let audio: Float32Array[];
		try {
			audio = await Promise.all(audioUrls.map(decodeAudio));
		} catch (err) {
			phase = 'ready';
			turns = turns.slice(0, -1);
			notice(`that recording could not be decoded: ${(err as Error).message}`);
			return;
		}

		worker.postMessage({
			type: 'generate',
			messages,
			images,
			audio,
			// Read by the chat template, not by generate().
			enableThinking: thinkMode,
			opts: {
				max_new_tokens: config.maxTokens,
				do_sample: config.doSample,
				temperature: config.temperature,
				top_p: config.topP,
				top_k: config.topK,
				repetition_penalty: config.repetitionPenalty
			}
		});
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
			text · images · audio, all on your machine
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
				if (configOpen) {
					storageOpen = false;
					void listMics();
				}
				playSound('toggle');
			}}
			title="Generation limits and sampling"
			class="px-2 py-0.5 border rounded-xs font-bold cursor-pointer transition-colors {configOpen
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
			class="px-2 py-0.5 border rounded-xs font-bold cursor-pointer transition-colors {storageOpen
				? 'border-[#e5c07b] bg-[#e5c07b]/20 text-[#e5c07b]'
				: 'border-[#e5c07b]/50 text-[#e5c07b] hover:bg-[#e5c07b]/20'}"
		>
			STORAGE
		</button>

		{#if phase === 'ready' || phase === 'generating'}
			<button
				onclick={() => {
					dropAttachments();
					playSound('click');
					inputEl?.focus();
				}}
				disabled={phase === 'generating'}
				class="px-2 py-0.5 border border-white/25 text-white/70 rounded-xs font-bold cursor-pointer hover:bg-white/10 disabled:opacity-40"
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
		<div class="border {themeStyles.border} rounded-xs bg-black/30 px-2 py-2 text-xs flex flex-col gap-2">
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
							class="w-24 bg-black/50 border border-white/20 rounded-xs px-1.5 py-0.5 text-[#d8dee9] outline-none focus:border-[#56b6c2] tabular-nums"
						/>
					</label>
				{/each}
				<label class="flex items-center gap-2 font-mono">
					<span
						class="text-white/60 w-36 shrink-0"
						title="Let the model reason before answering. Applies to the whole conversation, so it belongs here rather than beside the message box."
					>
						reasoning
					</span>
					<input
						type="checkbox"
						checked={thinkMode}
						onchange={(e) => setThinkMode(e.currentTarget.checked)}
						class="accent-[#c678dd] cursor-pointer"
					/>
					<span class="text-white/30 text-[11px]">whole conversation — use NEW to switch cleanly</span>
				</label>
				<label class="flex items-center gap-2 font-mono">
					<span class="text-white/60 w-36 shrink-0" title="Sample, rather than always take the likeliest token">
						sampling
					</span>
					<input
						type="checkbox"
						bind:checked={config.doSample}
						onchange={() => saveConfig(config)}
						class="accent-[#56b6c2] cursor-pointer"
					/>
				</label>
				<label class="flex items-center gap-2 font-mono sm:col-span-2">
					<span class="text-white/60 w-36 shrink-0" title="Which microphone REC records from">
						microphone
					</span>
					<select
						bind:value={config.micId}
						onchange={() => saveConfig(config)}
						class="flex-1 min-w-0 bg-black/50 border border-white/20 rounded-xs px-1.5 py-0.5 text-[#d8dee9] outline-none focus:border-[#56b6c2] cursor-pointer"
					>
						<option value="">system default</option>
						{#each mics as d (d.deviceId)}
							<!-- Labels are blank until the mic has been used once. -->
							<option value={d.deviceId}>{d.label || `microphone ${d.deviceId.slice(0, 6)}`}</option>
						{/each}
					</select>
				</label>
				<label class="flex items-center gap-2 font-mono">
					<span class="text-white/60 w-36 shrink-0" title="Stop a reply that collapses into repetition">
						loop guard
					</span>
					<input
						type="checkbox"
						bind:checked={config.loopGuard}
						onchange={() => saveConfig(config)}
						class="accent-[#56b6c2] cursor-pointer"
					/>
				</label>
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
					class="px-2 py-0.5 border border-white/25 text-white/70 rounded-xs font-bold cursor-pointer hover:bg-white/10"
				>
					DEFAULTS
				</button>
			</div>
		</div>
	{/if}

	{#if storageOpen}
		<div class="border {themeStyles.border} rounded-xs bg-black/30 px-2 py-2 text-xs flex flex-col gap-1.5">
			<div class="text-white/50 leading-relaxed">
				The model downloads once and is cached by the browser, so a second visit skips it. Clearing
				this site's data in your browser frees the space. Both the weights and the inference runtime
				come from this site's own storage — nothing is fetched from a third party.
			</div>
			<div class="font-mono text-white/45 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-0.5">
				<span>language model</span><span class="tabular-nums">{fmtMb(PART_SIZES_MB.decoder)}</span>
				<span>embeddings</span><span class="tabular-nums">{fmtMb(PART_SIZES_MB.embed)}</span>
				<span>vision encoder</span><span class="tabular-nums">{fmtMb(PART_SIZES_MB.vision)}</span>
				<span>audio encoder</span><span class="tabular-nums">{fmtMb(PART_SIZES_MB.audio)}</span>
			</div>
			<div class="font-mono text-[#e5c07b] border-t border-white/10 pt-1">
				total {fmtMb(TOTAL_DOWNLOAD_MB)}
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
							class="px-2 py-0.5 border border-[#98c379]/50 text-[#98c379] rounded-xs font-bold cursor-pointer hover:bg-[#98c379]/20"
						>
							NEW
						</button>
						<button
							onclick={wipeSessions}
							disabled={!sessions.length}
							class="px-2 py-0.5 border border-[#e06c75]/50 text-[#e06c75] rounded-xs font-bold cursor-pointer hover:bg-[#e06c75]/20 disabled:opacity-30 disabled:cursor-not-allowed"
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
									class="flex-1 text-left truncate cursor-pointer {sess.id === sessionId
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
									class="text-white/30 hover:text-[#e06c75] cursor-pointer shrink-0 px-1"
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
						class="mx-auto px-3 py-1.5 border border-[#98c379] text-[#98c379] rounded-xs text-xs font-black cursor-pointer hover:bg-[#98c379] hover:text-black"
					>
						RETRY
					</button>
				{/if}
			</div>
		{:else if phase === 'idle'}
			<div class="m-auto max-w-lg text-center flex flex-col gap-4">
				<div class="text-white/70 text-sm leading-relaxed">
					A model that reads <span class="text-[#61afef] font-bold">text, images and sound</span> runs
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
						class="mx-auto px-4 py-2 border border-[#98c379] text-[#98c379] rounded-xs text-xs font-black cursor-pointer hover:bg-[#98c379] hover:text-black disabled:opacity-30 disabled:cursor-not-allowed"
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
				<div class="text-[#e5c07b] text-xs font-mono">◐ {progressText}</div>
				<div class="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
					<div class="h-full bg-[#98c379] transition-[width] duration-200" style="width: {progressPct}%"></div>
				</div>
				<div class="text-white/40 text-[10px] font-mono text-right">{progressPct}%</div>
			</div>
		{:else if turns.length === 0}
			<div class="m-auto text-white/30 text-xs font-mono text-center leading-relaxed">
				ready — say something, or drop in an image or a sound.<br />
				<span class="text-white/20">/help lists the commands</span>
			</div>
		{/if}

		{#each turns as turn, i (i)}
			{#if turn.role === 'user'}
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
								{:else}
									<AudioClip src={a.url} name={a.name} />
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
				{@const parts = splitThink(turn.content)}
				<div class="flex flex-col gap-1.5 max-w-[85%]">
					{#if parts.think || parts.thinking}
						<button
							onclick={() => toggleThink(i)}
							title="The model's reasoning, kept folded away."
							class="self-start text-[10px] font-mono text-[#c678dd]/80 hover:text-[#c678dd] cursor-pointer"
						>
							{openThink.has(i) ? '▾' : '▸'}
							{parts.thinking ? 'thinking…' : 'reasoning'} ({parts.think.length} chars)
						</button>
						{#if openThink.has(i)}
							<div
								class="text-xs font-mono text-white/45 whitespace-pre-wrap border-l-2 border-[#c678dd]/30 pl-2 py-0.5 max-h-64 overflow-y-auto"
							>
								{parts.think}
							</div>
						{/if}
					{/if}
					{#if parts.answer}
						<div
							class="chat-md self-start px-3 py-2 rounded-md text-sm bg-white/[0.06] border border-white/15 text-[#d8dee9] break-words"
						>
							{@html renderMarkdown(parts.answer)}
						</div>
					{:else if !parts.thinking}
						<span
							class="self-start px-3 py-2 rounded-md bg-white/[0.06] border border-white/15 text-white/40 text-sm"
							>▋</span
						>
					{/if}
				</div>
			{/if}
		{/each}
	</div>

	<!-- Composer -->
	<div class="relative">
		{#if completions.length}
			<div
				class="absolute bottom-full left-0 mb-1 min-w-56 border {themeStyles.border} rounded-xs bg-black/95 py-1 text-xs font-mono shadow-lg z-20"
			>
				{#each completions as c, ci (c.name)}
					<button
						onclick={() => acceptCompletion(c.name)}
						onmouseenter={() => (completionIdx = ci)}
						class="w-full text-left px-2 py-1 cursor-pointer flex gap-2 {ci === completionIdx
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
							class="text-white/40 hover:text-[#e06c75] cursor-pointer px-1"
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
				accept="image/*,audio/*"
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
				title="Attach an image or a sound — you can also paste or drag one in"
				class="px-2 py-0.5 border border-[#c678dd]/50 text-[#c678dd] rounded-xs text-xs font-bold cursor-pointer hover:bg-[#c678dd]/20 disabled:opacity-30 disabled:cursor-not-allowed shrink-0 self-end mb-0.5"
			>
				FILE
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
					class="px-3 py-1 border border-[#e06c75] text-[#e06c75] rounded-xs text-xs font-black cursor-pointer hover:bg-[#e06c75] hover:text-black shrink-0"
				>
					STOP
				</button>
			{:else}
				<!-- Beside SEND: recording is the first half of sending a voice message. -->
				<button
					onclick={recording ? stopRecording : startRecording}
					disabled={phase !== 'ready'}
					title={recording ? 'Stop recording and attach it' : 'Record from your microphone'}
					class="px-3 py-1 border rounded-xs text-xs font-black cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed shrink-0 transition-colors {recording
						? 'border-[#e06c75] bg-[#e06c75]/20 text-[#e06c75]'
						: 'border-[#c678dd] text-[#c678dd] hover:bg-[#c678dd] hover:text-black'}"
				>
					{recording ? '■ STOP' : '● REC'}
				</button>
				<button
					onclick={send}
					disabled={phase !== 'ready' || (!draft.trim() && !pending.length)}
					class="px-3 py-1 border border-[#98c379] text-[#98c379] rounded-xs text-xs font-black cursor-pointer hover:bg-[#98c379] hover:text-black disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
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
	.chat-md :global(p) {
		margin: 0 0 0.6em;
	}
	.chat-md :global(p:last-child) {
		margin-bottom: 0;
	}
	.chat-md :global(h1),
	.chat-md :global(h2),
	.chat-md :global(h3),
	.chat-md :global(h4) {
		font-weight: 800;
		margin: 0.7em 0 0.35em;
		line-height: 1.25;
	}
	.chat-md :global(h1) {
		font-size: 1.15em;
	}
	.chat-md :global(h2) {
		font-size: 1.08em;
	}
	.chat-md :global(h3),
	.chat-md :global(h4) {
		font-size: 1em;
	}
	.chat-md :global(ul),
	.chat-md :global(ol) {
		margin: 0 0 0.6em;
		padding-left: 1.3em;
	}
	.chat-md :global(ul) {
		list-style: disc;
	}
	.chat-md :global(ol) {
		list-style: decimal;
	}
	.chat-md :global(li) {
		margin: 0.15em 0;
	}
	.chat-md :global(code) {
		font-family: inherit;
		background: rgb(255 255 255 / 0.08);
		border-radius: 3px;
		padding: 0.1em 0.3em;
		font-size: 0.92em;
	}
	.chat-md :global(pre) {
		background: rgb(0 0 0 / 0.5);
		border: 1px solid rgb(255 255 255 / 0.12);
		border-radius: 3px;
		padding: 0.6em 0.7em;
		margin: 0 0 0.6em;
		overflow-x: auto;
	}
	.chat-md :global(pre code) {
		background: none;
		padding: 0;
		font-size: 0.88em;
		line-height: 1.5;
	}
	.chat-md :global(blockquote) {
		border-left: 2px solid rgb(255 255 255 / 0.2);
		padding-left: 0.7em;
		margin: 0 0 0.6em;
		color: rgb(255 255 255 / 0.6);
	}
	.chat-md :global(a) {
		color: #61afef;
		text-decoration: underline;
	}
	.chat-md :global(strong) {
		font-weight: 800;
	}
</style>
