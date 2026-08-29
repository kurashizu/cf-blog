<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { playSound } from '../../sound';
	import { theme, THEME_STYLES } from '../../stores/theme';
	import {
		MODELS,
		createEngine,
		modelById,
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
	}

	const SYSTEM_PROMPT =
		'You are a concise assistant embedded in krsz.in, a terminal-styled personal site. ' +
		'You run entirely inside the visitor’s browser on their own GPU — no server sees this conversation. ' +
		'Keep answers short unless asked to elaborate. Reply in the language the user writes in.';

	let phase = $state<Phase>('idle');
	let gpu = $state<GpuSupport | null>(null);
	let selectedModel = $state<string>('');
	let engine: MLCEngineInterface | null = null;
	let worker: Worker | null = null;

	let progressText = $state('');
	let progressPct = $state(0);
	let errorText = $state('');

	let turns = $state<Turn[]>([]);
	let draft = $state('');
	let scroller: HTMLDivElement | undefined = $state();
	let inputEl: HTMLTextAreaElement | undefined = $state();

	/** Tokens/sec of the last completed reply, straight from the engine's stats. */
	let lastStats = $state('');

	let themeStyles = $derived(THEME_STYLES[$theme]);
	let activeModel = $derived(modelById(selectedModel));
	let busy = $derived(phase === 'loading' || phase === 'generating');

	onMount(() => {
		probeGpu().then((g) => {
			gpu = g;
			// Only auto-pick when the user has not already chosen.
			if (!selectedModel) selectedModel = pickModel(g);
			if (!g.ok) {
				phase = 'error';
				errorText = g.reason ?? 'WebGPU is unavailable.';
			}
		});
		return () => teardown();
	});

	function teardown() {
		engine?.unload?.();
		worker?.terminate();
		engine = null;
		worker = null;
	}

	async function load() {
		if (busy || !gpu?.ok) return;
		phase = 'loading';
		errorText = '';
		progressPct = 0;
		progressText = 'requesting the weights…';
		playSound('click');
		try {
			const created = await createEngine(selectedModel, (r) => {
				progressText = r.text;
				progressPct = Math.round((r.progress ?? 0) * 100);
			});
			engine = created.engine;
			worker = created.worker;
			phase = 'ready';
			progressText = '';
			await tick();
			inputEl?.focus();
		} catch (err) {
			phase = 'error';
			errorText = (err as Error).message || String(err);
			teardown();
		}
	}

	/** Swapping models throws away the loaded engine — the next send reloads. */
	function onModelChange() {
		if (phase === 'generating') return;
		teardown();
		turns = [];
		lastStats = '';
		if (phase === 'ready') phase = 'idle';
		playSound('toggle');
	}

	async function send() {
		const text = draft.trim();
		if (!text || busy || phase !== 'ready' || !engine) return;

		turns = [...turns, { role: 'user', content: text }, { role: 'assistant', content: '' }];
		draft = '';
		phase = 'generating';
		lastStats = '';
		await scrollToEnd();

		// The system prompt is prepended each time rather than stored in `turns`,
		// so it never renders as a bubble and never gets dropped by history trimming.
		const messages: ChatCompletionMessageParam[] = [
			{ role: 'system', content: SYSTEM_PROMPT },
			...turns.slice(0, -1).map((t) => ({ role: t.role, content: t.content }) as ChatCompletionMessageParam)
		];

		try {
			const stream = await engine.chat.completions.create({
				messages,
				stream: true,
				stream_options: { include_usage: true },
				temperature: 0.7,
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
				if (chunk.usage?.extra?.decode_tokens_per_s) {
					lastStats = `${chunk.usage.extra.decode_tokens_per_s.toFixed(1)} tok/s`;
				}
			}
			phase = 'ready';
		} catch (err) {
			const msg = (err as Error).message || String(err);
			// The model has a fixed 4096-token window and web-llm throws rather than
			// dropping old turns. Keep the session alive and say what to do about it.
			if (/context window/i.test(msg)) {
				const next = [...turns];
				next[next.length - 1] = {
					role: 'assistant',
					content:
						'[the conversation outgrew this model’s 4096-token context window — press CLEAR to start a fresh one]'
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

	function clearChat() {
		if (phase === 'generating') return;
		turns = [];
		lastStats = '';
		playSound('click');
		inputEl?.focus();
	}

	async function scrollToEnd() {
		await tick();
		if (scroller) scroller.scrollTop = scroller.scrollHeight;
	}

	function onKeydown(e: KeyboardEvent) {
		// Enter sends, Shift+Enter makes a newline — the usual chat contract.
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			send();
		}
	}
</script>

<div class="flex flex-col gap-2 min-h-0 flex-1">
	<!-- Control strip -->
	<div
		class="flex flex-wrap items-center gap-2 px-2 py-1.5 border {themeStyles.border} rounded-xs bg-black/30 text-xs"
	>
		<span class="font-black text-[#61afef]">6:chatbot</span>

		<select
			bind:value={selectedModel}
			onchange={onModelChange}
			disabled={phase === 'generating'}
			title="Which model to run. Everything is downloaded once and cached by the browser."
			class="bg-black/50 border border-white/25 rounded-xs px-1.5 py-0.5 font-mono text-xs text-[#d8dee9] cursor-pointer disabled:opacity-50"
		>
			{#each MODELS as m (m.id)}
				<option value={m.id}>{m.label} — {(m.vramMb / 1024).toFixed(2)} GB</option>
			{/each}
		</select>

		{#if activeModel}
			<span class="text-white/40 hidden sm:inline">{activeModel.note}</span>
		{/if}

		<div class="flex-1"></div>

		{#if lastStats}
			<span class="text-[#98c379]" title="Decode speed of the last reply">{lastStats}</span>
		{/if}

		{#if phase === 'ready' || phase === 'generating'}
			<span class="text-[#98c379]" title="The model is resident in GPU memory">● LOADED</span>
			<button
				onclick={clearChat}
				disabled={phase === 'generating'}
				class="px-2 py-0.5 border border-white/25 text-white/70 rounded-xs font-bold cursor-pointer hover:bg-white/10 disabled:opacity-40"
			>
				CLEAR
			</button>
		{/if}
	</div>

	<!-- Transcript -->
	<div
		bind:this={scroller}
		class="flex-1 min-h-[45vh] overflow-y-auto border {themeStyles.border} rounded-xs bg-black/40 p-3 flex flex-col gap-3"
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
					First run downloads ~{activeModel ? (activeModel.vramMb / 1024).toFixed(2) : '1.6'} GB of weights
					and caches them, so later visits start immediately.
					{#if gpu && !gpu.f16}
						<br />Your GPU lacks <code>shader-f16</code>, so the f32 build was selected.
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
			<div class="m-auto text-white/30 text-xs font-mono">ready — say something.</div>
		{/if}

		{#each turns as turn, i (i)}
			<div class="flex flex-col gap-1 {turn.role === 'user' ? 'items-end' : 'items-start'}">
				<span class="text-[10px] font-mono {turn.role === 'user' ? 'text-[#61afef]' : 'text-[#98c379]'}">
					{turn.role === 'user' ? 'you' : 'model'}
				</span>
				<div
					class="max-w-[85%] px-2.5 py-1.5 rounded-xs text-sm whitespace-pre-wrap break-words border {turn.role ===
					'user'
						? 'bg-[#61afef]/10 border-[#61afef]/30'
						: 'bg-white/5 border-white/15'}"
				>
					{#if turn.content}
						{turn.content}
					{:else}
						<span class="text-white/40">▋</span>
					{/if}
				</div>
			</div>
		{/each}
	</div>

	<!-- Composer -->
	<div class="flex items-end gap-2">
		<textarea
			bind:this={inputEl}
			bind:value={draft}
			onkeydown={onKeydown}
			disabled={phase !== 'ready' && phase !== 'generating'}
			rows="2"
			placeholder={phase === 'ready' || phase === 'generating'
				? 'Enter sends · Shift+Enter for a newline'
				: 'Load the model first.'}
			class="flex-1 resize-none bg-black/40 border {themeStyles.border} rounded-xs px-2 py-1.5 font-mono text-sm text-[#d8dee9] outline-none focus:border-[#61afef] disabled:opacity-40 placeholder:text-white/25"
		></textarea>
		{#if phase === 'generating'}
			<button
				onclick={stopGenerating}
				class="px-3 py-2 border border-[#e06c75] text-[#e06c75] rounded-xs text-xs font-black cursor-pointer hover:bg-[#e06c75] hover:text-black"
			>
				STOP
			</button>
		{:else}
			<button
				onclick={send}
				disabled={phase !== 'ready' || !draft.trim()}
				class="px-3 py-2 border border-[#98c379] text-[#98c379] rounded-xs text-xs font-black cursor-pointer hover:bg-[#98c379] hover:text-black disabled:opacity-30 disabled:cursor-not-allowed"
			>
				SEND
			</button>
		{/if}
	</div>
</div>
