<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { playSound } from '../../sound';
	import { theme, THEME_STYLES } from '../../stores/theme';
	import { renderMarkdown, splitThink } from './markdown';
	import {
		ALL_BUILDS,
		CONTEXT_WINDOW,
		SAMPLING,
		buildById,
		cachedModelIds,
		cachedSizeMb,
		createEngine,
		evictModel,
		pickModel,
		probeGpu,
		type ChatCompletionMessageParam,
		type GpuSupport,
		type MLCEngineInterface
	} from './engine';

	type Phase = 'idle' | 'loading' | 'ready' | 'generating' | 'error';

	interface Turn {
		role: 'user' | 'assistant';
		content: string;
		/** Set on system notices (slash-command output), which are not sent to the model. */
		notice?: boolean;
	}

	const BASE_PROMPT =
		'You are a concise assistant embedded in krsz.in, a terminal-styled personal site. ' +
		'You run entirely inside the visitor’s browser on their own GPU — no server sees this conversation. ' +
		'Always reply in the same language the user wrote in.';

	/**
	 * Qwen3 has a native reasoning mode driven by a soft switch in the prompt:
	 * `/think` opens a real <think> block, `/no_think` suppresses it. Those tags
	 * are tokens the model was trained on, not an instruction it has to obey, so
	 * this is a switch rather than a suggestion. The transcript folds the block
	 * away either way.
	 */
	const THINK_ON = ' /think';
	const THINK_OFF = ' /no_think';

	let phase = $state<Phase>('idle');
	let gpu = $state<GpuSupport | null>(null);
	let modelId = $state<string>('');
	let engine: MLCEngineInterface | null = null;
	let worker: Worker | null = null;

	let progressText = $state('');
	let progressPct = $state(0);
	let errorText = $state('');

	let turns = $state<Turn[]>([]);
	let draft = $state('');
	let scroller: HTMLDivElement | undefined = $state();
	let inputEl: HTMLTextAreaElement | undefined = $state();

	let lastStats = $state('');
	let thinkMode = $state(false);
	/** Which assistant turns have their reasoning expanded. */
	let openThink = $state<Set<number>>(new Set());

	let cached = $state<Set<string>>(new Set());
	let storageOpen = $state(false);
	let evicting = $state('');

	/** Prompt tokens reported for the last exchange — drives the context meter. */
	let usedTokens = $state(0);

	let themeStyles = $derived(THEME_STYLES[$theme]);
	let build = $derived(buildById(modelId));
	let busy = $derived(phase === 'loading' || phase === 'generating');
	let ctxPct = $derived(Math.min(100, Math.round((usedTokens / CONTEXT_WINDOW) * 100)));

	onMount(() => {
		probeGpu().then((g) => {
			gpu = g;
			if (!modelId) modelId = pickModel(g);
			if (!g.ok) {
				phase = 'error';
				errorText = g.reason ?? 'WebGPU is unavailable.';
			}
		});
		void refreshCached();
		return () => teardown();
	});

	function teardown() {
		engine?.unload?.();
		worker?.terminate();
		engine = null;
		worker = null;
	}

	async function refreshCached() {
		cached = await cachedModelIds();
	}

	async function load() {
		if (busy || !gpu?.ok) return;
		phase = 'loading';
		errorText = '';
		progressPct = 0;
		progressText = 'requesting the weights…';
		playSound('click');
		try {
			const created = await createEngine(modelId, (r) => {
				progressText = r.text;
				progressPct = Math.round((r.progress ?? 0) * 100);
			});
			engine = created.engine;
			worker = created.worker;
			phase = 'ready';
			progressText = '';
			void refreshCached();
			await tick();
			inputEl?.focus();
		} catch (err) {
			phase = 'error';
			errorText = (err as Error).message || String(err);
			teardown();
		}
	}

	async function evict(id: string) {
		if (evicting) return;
		evicting = id;
		try {
			if (id === modelId && (phase === 'ready' || phase === 'generating')) {
				teardown();
				resetConversation();
				phase = 'idle';
			}
			await evictModel(id);
			await refreshCached();
			playSound('click');
		} catch (err) {
			errorText = `could not free the cached weights: ${(err as Error).message}`;
			phase = 'error';
		} finally {
			evicting = '';
		}
	}

	function resetConversation() {
		turns = [];
		lastStats = '';
		usedTokens = 0;
		openThink = new Set();
	}

	function notice(text: string) {
		turns = [...turns, { role: 'assistant', content: text, notice: true }];
	}

	/**
	 * Slash commands are handled here and never reach the model. They mirror the
	 * site's console conventions: a bare word, no arguments unless stated.
	 */
	function runCommand(raw: string): boolean {
		const [cmd] = raw.slice(1).trim().split(/\s+/);
		switch (cmd.toLowerCase()) {
			case 'help':
				notice(
					'/help — this list\n' +
						'/clear — wipe the conversation\n' +
						'/compact — replace the history with a short summary, freeing context\n' +
						'/think — toggle the reasoning block\n' +
						'/stats — context use and last decode speed'
				);
				return true;
			case 'clear':
				resetConversation();
				return true;
			case 'think':
				thinkMode = !thinkMode;
				notice(`thinking ${thinkMode ? 'on' : 'off'}.`);
				return true;
			case 'stats':
				notice(
					`context ${usedTokens}/${CONTEXT_WINDOW} tokens (${ctxPct}%)\n` +
						`last decode ${lastStats || '—'}\n` +
						`turns ${turns.filter((t) => !t.notice).length}`
				);
				return true;
			case 'compact':
				void compact();
				return true;
			default:
				notice(`unknown command: /${cmd} — try /help`);
				return true;
		}
	}

	/**
	 * Asks the model to summarise the conversation so far, then replaces the
	 * history with that summary. The point is to free context, so the summary
	 * has to replace the transcript rather than be appended to it.
	 */
	async function compact() {
		if (!engine || phase !== 'ready') {
			notice('nothing to compact — the model is not loaded.');
			return;
		}
		const real = turns.filter((t) => !t.notice);
		if (real.length < 2) {
			notice('nothing to compact yet.');
			return;
		}
		phase = 'generating';
		try {
			const transcript = real
				.map((t) => `${t.role === 'user' ? 'User' : 'Assistant'}: ${t.content}`)
				.join('\n');
			const res = await engine.chat.completions.create({
				messages: [
					{
						role: 'user',
						content:
							'Summarise the following conversation in under 120 words, keeping any facts, ' +
							'names, and decisions that later turns might rely on. Reply with the summary only.\n\n' +
							transcript
					}
				],
				temperature: 0.3,
				max_tokens: 300
			});
			const summary = res.choices[0]?.message?.content?.trim();
			if (!summary) {
				notice('compact failed — the model returned nothing.');
			} else {
				resetConversation();
				turns = [
					{ role: 'assistant', content: `[compacted]\n${splitThink(summary).answer}`, notice: true }
				];
				compactedSummary = splitThink(summary).answer;
			}
			phase = 'ready';
		} catch (err) {
			phase = 'ready';
			notice(`compact failed: ${(err as Error).message}`);
		}
		await scrollToEnd();
	}

	/** Carried into the next request's system prompt after /compact. */
	let compactedSummary = $state('');

	async function send() {
		const text = draft.trim();
		if (!text || busy || phase !== 'ready' || !engine) return;

		if (text.startsWith('/')) {
			draft = '';
			runCommand(text);
			await scrollToEnd();
			return;
		}

		turns = [...turns, { role: 'user', content: text }, { role: 'assistant', content: '' }];
		draft = '';
		phase = 'generating';
		lastStats = '';
		await scrollToEnd();

		let system = BASE_PROMPT + (thinkMode ? THINK_ON : THINK_OFF);
		if (compactedSummary) {
			system += `\n\nEarlier conversation, summarised: ${compactedSummary}`;
		}

		const messages: ChatCompletionMessageParam[] = [
			{ role: 'system', content: system },
			...turns
				.slice(0, -1)
				.filter((t) => !t.notice)
				.map((t) => ({ role: t.role, content: t.content }) as ChatCompletionMessageParam)
		];

		try {
			const stream = await engine.chat.completions.create({
				messages,
				stream: true,
				stream_options: { include_usage: true },
				...SAMPLING,
				max_tokens: 800
			});
			for await (const chunk of stream) {
				const delta = chunk.choices[0]?.delta?.content;
				if (delta) {
					const next = [...turns];
					next[next.length - 1] = {
						role: 'assistant',
						content: next[next.length - 1].content + delta
					};
					turns = next;
					await scrollToEnd();
				}
				if (chunk.usage) {
					if (chunk.usage.extra?.decode_tokens_per_s) {
						lastStats = `${chunk.usage.extra.decode_tokens_per_s.toFixed(1)} tok/s`;
					}
					if (chunk.usage.total_tokens) usedTokens = chunk.usage.total_tokens;
				}
			}
			phase = 'ready';
		} catch (err) {
			const msg = (err as Error).message || String(err);
			if (/context window/i.test(msg)) {
				const next = [...turns];
				next[next.length - 1] = {
					role: 'assistant',
					content: 'the conversation outgrew the context window — run /compact, or /clear to start over',
					notice: true
				};
				turns = next;
				phase = 'ready';
			} else {
				phase = 'error';
				errorText = msg;
			}
		}
		await tick();
		inputEl?.focus();
	}

	async function stopGenerating() {
		if (phase !== 'generating' || !engine) return;
		await engine.interruptGenerate();
		phase = 'ready';
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

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			send();
		}
	}

	/** Grows the composer with its content, up to a few lines. */
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

<div class="flex flex-col gap-2 min-h-0 flex-1">
	<!-- Control strip -->
	<div
		class="flex flex-wrap items-center gap-2 px-2 py-1.5 border {themeStyles.border} rounded-xs bg-black/30 text-xs"
	>
		<span class="font-black text-[#61afef]">6:chatbot</span>
		<span class="text-white/40 hidden sm:inline">runs on your GPU · nothing is sent anywhere</span>

		<div class="flex-1"></div>

		{#if phase === 'ready' || phase === 'generating'}
			<!-- Context meter -->
			<span
				class="flex items-center gap-1.5 font-mono"
				title="How much of the {CONTEXT_WINDOW}-token context window the conversation occupies"
			>
				<span class="text-white/40 hidden sm:inline">ctx</span>
				<span class="w-14 h-1 bg-white/10 rounded-full overflow-hidden hidden sm:block">
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

		{#if lastStats}
			<span class="text-[#98c379] tabular-nums" title="Decode speed of the last reply">{lastStats}</span>
		{/if}

		<button
			onclick={() => {
				thinkMode = !thinkMode;
				playSound('toggle');
			}}
			title="Let the model reason before answering, folded away above the reply. Slower, and a model this size reasons only so well."
			class="px-2 py-0.5 border rounded-xs font-bold cursor-pointer transition-colors {thinkMode
				? 'border-[#c678dd] bg-[#c678dd]/20 text-[#c678dd]'
				: 'border-[#c678dd]/40 text-[#c678dd]/70 hover:bg-[#c678dd]/20'}"
		>
			THINK {thinkMode ? 'ON' : 'OFF'}
		</button>

		<button
			onclick={() => {
				storageOpen = !storageOpen;
				if (storageOpen) void refreshCached();
				playSound('toggle');
			}}
			title="What this page has stored in your browser, and how to free it"
			class="px-2 py-0.5 border rounded-xs font-bold cursor-pointer transition-colors {storageOpen
				? 'border-[#e5c07b] bg-[#e5c07b]/20 text-[#e5c07b]'
				: 'border-[#e5c07b]/50 text-[#e5c07b] hover:bg-[#e5c07b]/20'}"
		>
			STORAGE{cached.size ? ` (${cachedSizeMb(cached)} MB)` : ''}
		</button>

		{#if phase === 'ready' || phase === 'generating'}
			<button
				onclick={() => {
					resetConversation();
					compactedSummary = '';
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

	{#if storageOpen}
		<div class="border {themeStyles.border} rounded-xs bg-black/30 px-2 py-2 text-xs flex flex-col gap-1.5">
			<div class="text-white/50 leading-relaxed">
				The weights are cached by your browser so a second visit skips the download. Freeing them
				reclaims the space; they download again next time you load the model.
			</div>
			{#each ALL_BUILDS as b (b.id)}
				{@const isCached = cached.has(b.id)}
				{#if isCached || b.id === modelId}
					<div class="flex items-center gap-2 font-mono">
						<span class="{isCached ? 'text-[#98c379]' : 'text-white/25'} w-3">{isCached ? '●' : '○'}</span>
						<span class="{isCached ? 'text-[#d8dee9]' : 'text-white/35'} flex-1">
							model weights{b.id === modelId ? '' : ' (other GPU build)'}
						</span>
						<span class="text-white/35 tabular-nums">{b.downloadMb} MB</span>
						{#if isCached}
							<button
								onclick={() => evict(b.id)}
								disabled={!!evicting}
								class="px-1.5 py-0.5 border border-[#e06c75]/50 text-[#e06c75] rounded-xs font-bold cursor-pointer hover:bg-[#e06c75]/20 disabled:opacity-40"
							>
								{evicting === b.id ? '…' : 'FREE'}
							</button>
						{:else}
							<span class="text-white/20 px-1.5">not cached</span>
						{/if}
					</div>
				{/if}
			{/each}
		</div>
	{/if}

	<!-- Transcript -->
	<div
		bind:this={scroller}
		class="flex-1 min-h-[45vh] overflow-y-auto border {themeStyles.border} rounded-xs bg-black/40 px-3 py-3 flex flex-col gap-4"
	>
		{#if phase === 'error'}
			<div class="m-auto max-w-md text-center flex flex-col gap-3">
				<div class="text-[#e06c75] font-bold">✗ {errorText}</div>
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
					A language model runs <span class="text-[#61afef] font-bold">entirely in this tab</span>, on
					your own GPU through WebGPU. Nothing you type leaves the machine — there is no server on the
					other end of this box.
				</div>
				<div class="text-white/40 text-xs">
					{#if build && cached.has(build.id)}
						Already cached — this loads straight from disk.
					{:else if build}
						First run downloads {build.downloadMb} MB and caches it, so later visits start immediately.
					{/if}
					{#if build}
						<br />Needs about {(build.vramMb / 1024).toFixed(1)} GB of GPU memory while running.
					{/if}
				</div>
				<button
					onclick={load}
					class="mx-auto px-4 py-2 border border-[#98c379] text-[#98c379] rounded-xs text-xs font-black cursor-pointer hover:bg-[#98c379] hover:text-black"
				>
					▶ LOAD MODEL
				</button>
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
				ready — say something.<br />
				<span class="text-white/20">/help lists the commands</span>
			</div>
		{/if}

		{#each turns as turn, i (i)}
			{#if turn.role === 'user'}
				<div class="flex justify-end">
					<div
						class="max-w-[80%] px-3 py-2 rounded-md text-sm bg-[#61afef]/12 border border-[#61afef]/25 text-[#d8dee9] whitespace-pre-wrap break-words"
					>
						{turn.content}
					</div>
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
							class="self-start text-[10px] font-mono text-[#c678dd]/80 hover:text-[#c678dd] cursor-pointer"
						>
							{parts.thinking ? '◐ thinking…' : openThink.has(i) ? '▾ reasoning' : '▸ reasoning'}
						</button>
						{#if openThink.has(i) || parts.thinking}
							<div
								class="text-xs font-mono text-white/45 whitespace-pre-wrap border-l-2 border-[#c678dd]/30 pl-2 py-0.5"
							>
								{parts.think}
							</div>
						{/if}
					{/if}
					{#if parts.answer}
						<div class="chat-md text-sm text-[#d8dee9] break-words">
							{@html renderMarkdown(parts.answer)}
						</div>
					{:else if !parts.thinking}
						<span class="text-white/40 text-sm">▋</span>
					{/if}
				</div>
			{/if}
		{/each}
	</div>

	<!-- Composer -->
	<div
		class="flex items-end gap-2 border {themeStyles.border} rounded-xs bg-black/40 px-2 py-1.5 focus-within:border-[#61afef] transition-colors"
	>
		<textarea
			bind:this={inputEl}
			bind:value={draft}
			use:autosize
			onkeydown={onKeydown}
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
			<button
				onclick={send}
				disabled={phase !== 'ready' || !draft.trim()}
				class="px-3 py-1 border border-[#98c379] text-[#98c379] rounded-xs text-xs font-black cursor-pointer hover:bg-[#98c379] hover:text-black disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
			>
				SEND
			</button>
		{/if}
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
