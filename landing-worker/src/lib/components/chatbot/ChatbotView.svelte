<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { playSound } from '../../sound';
	import { theme, THEME_STYLES } from '../../stores/theme';
	import { isLooping, renderMarkdown, splitThink } from './markdown';
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
	 * Thinking is switched off through web-llm's own `extra_body.enable_thinking`
	 * flag, not by anything in the prompt. It encodes a closed `<think></think>`
	 * block straight into the generation, so the model resumes after reasoning it
	 * never got to open.
	 *
	 * Two earlier attempts were wrong: `/no_think` in the system message appears
	 * nowhere in Qwen3.5's template, so the model read it as prose and reasoned
	 * about what it meant; and appending the prefill as an assistant message is
	 * rejected outright, since web-llm requires the last message to be from
	 * `user` or `tool`.
	 */

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

	/** How far /compact has got, so a slow summary is not a frozen screen. */
	let compacting = $state('');

	/** Index of the highlighted completion, or -1 when the menu is closed. */
	let completionIdx = $state(-1);

	let themeStyles = $derived(THEME_STYLES[$theme]);
	let build = $derived(buildById(modelId));
	let busy = $derived(phase === 'loading' || phase === 'generating');
	let ctxPct = $derived(Math.min(100, Math.round((usedTokens / CONTEXT_WINDOW) * 100)));

	/**
	 * Completions for a lone `/word` being typed. Only while the draft is exactly
	 * one slash-prefixed word, so a message that merely mentions a slash later on
	 * does not pop the menu open.
	 */
	let completions = $derived.by(() => {
		const m = draft.match(/^\/(\w*)$/);
		if (!m) return [];
		const q = m[1].toLowerCase();
		const hits = COMMANDS.filter((c) => c.name.startsWith(q));
		// An exact single match is already typed out — nothing left to complete.
		return hits.length === 1 && hits[0].name === q ? [] : hits;
	});

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
	 * The commands, as data: the completion menu and /help both read this, so a
	 * new command cannot appear in one and go missing from the other.
	 */
	const COMMANDS = [
		{ name: 'help', hint: 'list these commands' },
		{ name: 'clear', hint: 'wipe the conversation' },
		{ name: 'compact', hint: 'summarise the history, freeing context' },
		{ name: 'think', hint: 'toggle the reasoning block' },
		{ name: 'stats', hint: 'context use and last decode speed' }
	] as const;

	/**
	 * Slash commands are handled here and never reach the model. They mirror the
	 * site's console conventions: a bare word, no arguments unless stated.
	 */
	function runCommand(raw: string): boolean {
		const [cmd] = raw.slice(1).trim().split(/\s+/);
		switch (cmd.toLowerCase()) {
			case 'help':
				notice(COMMANDS.map((c) => `/${c.name} — ${c.hint}`).join('\n'));
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
		compacting = `summarising ${real.length} messages…`;
		try {
			const transcript = real
				.map((t) => `${t.role === 'user' ? 'User' : 'Assistant'}: ${t.content}`)
				.join('\n');
			// Streamed rather than awaited whole: summarising is slow enough on a
			// small model that a silent wait reads as a hang.
			const stream = await engine.chat.completions.create({
				messages: [
					{
						role: 'user',
						content:
							'Summarise the following conversation in under 120 words, keeping any facts, ' +
							'names, and decisions that later turns might rely on. Reply with the summary only.\n\n' +
							transcript
					}
				],
				stream: true,
				// Never reason about a summary — it is a mechanical step, and the
				// tokens would come out of the same budget.
				extra_body: { enable_thinking: false },
				temperature: 0.3,
				max_tokens: 300
			});
			let summary = '';
			for await (const chunk of stream) {
				summary += chunk.choices[0]?.delta?.content ?? '';
				compacting = `summarising… ${summary.length} chars`;
			}
			summary = splitThink(summary).answer.trim();
			if (!summary) {
				notice('compact failed — the model returned nothing.');
			} else {
				const before = usedTokens;
				resetConversation();
				turns = [{ role: 'assistant', content: `[compacted]\n${summary}`, notice: true }];
				compactedSummary = summary;
				if (before) notice(`context freed — was ${before} tokens.`);
			}
			phase = 'ready';
		} catch (err) {
			phase = 'ready';
			notice(`compact failed: ${(err as Error).message}`);
		}
		compacting = '';
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

		let system = BASE_PROMPT;
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
				extra_body: { enable_thinking: thinkMode },
				...SAMPLING,
				// A backstop, not a budget: if the model does loop, this bounds how
				// long you wait before STOP becomes the obvious move. Thinking needs
				// the extra room, since the reasoning block spends from the same pot.
				// Thinking spends from this same budget, and this model reasons at
				// length — 2000+ characters to answer "hi" — so a cap that is fine
				// for a direct answer gets consumed entirely by the reasoning,
				// leaving the block unclosed and no answer at all. Give it room.
				max_tokens: thinkMode ? 2500 : 500
			});
			let looped = false;
			for await (const chunk of stream) {
				const delta = chunk.choices[0]?.delta?.content;
				if (delta) {
					const next = [...turns];
					const grown = next[next.length - 1].content + delta;
					next[next.length - 1] = { role: 'assistant', content: grown };
					turns = next;
					await scrollToEnd();

					// Cut a loop short rather than let it run to max_tokens.
					if (isLooping(grown)) {
						looped = true;
						await engine.interruptGenerate();
						break;
					}
				}
				if (chunk.usage) {
					if (chunk.usage.extra?.decode_tokens_per_s) {
						lastStats = `${chunk.usage.extra.decode_tokens_per_s.toFixed(1)} tok/s`;
					}
					if (chunk.usage.total_tokens) usedTokens = chunk.usage.total_tokens;
				}
			}
			if (looped) {
				// Say so rather than leaving a reply that just stops mid-repetition.
				turns = [
					...turns,
					{
						role: 'assistant',
						content: 'cut short — the model started repeating itself. ask again, or /clear.',
						notice: true
					}
				];
			} else {
				// A reasoning block that never closed means generation ran out of
				// room inside it, so there is no answer to show — only a cursor. Say
				// what happened instead of leaving an empty bubble.
				const final = splitThink(turns[turns.length - 1]?.content ?? '');
				if (final.thinking && !final.answer) {
					turns = [
						...turns,
						{
							role: 'assistant',
							content:
								'the model was still reasoning when it ran out of room, so it never got to an answer. ask again, or turn THINK off.',
							notice: true
						}
					];
				}
			}
			await scrollToEnd();
			phase = 'ready';
		} catch (err) {
			// The engine is still loaded and the transcript is still worth reading,
			// so a failed turn is reported in place rather than replacing the view
			// with an error screen. Only a broken engine gets 'error'.
			const msg = (err as Error).message || String(err);
			const next = [...turns];
			next[next.length - 1] = {
				role: 'assistant',
				notice: true,
				content: /context window/i.test(msg)
					? 'the conversation outgrew the context window — run /compact, or /clear to start over'
					: `that turn failed: ${msg}`
			};
			turns = next;
			phase = 'ready';
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

	function acceptCompletion(name: string) {
		draft = `/${name}`;
		completionIdx = -1;
		inputEl?.focus();
	}

	function onKeydown(e: KeyboardEvent) {
		// The completion menu owns these keys while it is open.
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
				// Closes the menu without clearing what was typed.
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

		{#if compacting}
			<span class="text-[#e5c07b] font-mono">◐ {compacting}</span>
		{:else if lastStats}
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
							title="A model this size reasons at length and not always to the point. Kept folded away."
							class="self-start text-[10px] font-mono text-[#c678dd]/80 hover:text-[#c678dd] cursor-pointer"
						>
							{openThink.has(i) ? '▾' : '▸'}
							{parts.thinking ? 'thinking…' : 'reasoning'} ({parts.think.length} chars)
						</button>
						<!-- Stays folded while streaming: this model can reason for
						     thousands of characters, and unfolding it buries the answer. -->
						{#if openThink.has(i)}
							<div
								class="text-xs font-mono text-white/45 whitespace-pre-wrap border-l-2 border-[#c678dd]/30 pl-2 py-0.5 max-h-64 overflow-y-auto"
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
						<!-- While reasoning streams, the toggle above already says so; a
						     second cursor here reads as a stalled answer. -->
						<span class="text-white/40 text-sm">▋</span>
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
