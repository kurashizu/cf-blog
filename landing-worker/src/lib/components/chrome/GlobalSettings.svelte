<script lang="ts">
	import { onMount } from 'svelte';
	import { fade, scale } from '$lib/perf-transitions';
	import { cubicOut } from 'svelte/easing';
	import { t, tr } from '$lib/i18n';
	import BoxHeader from './BoxHeader.svelte';
	import HorizontalHardwareFader from '../hardware/HorizontalHardwareFader.svelte';
	import { resolvedTheme, THEME_STYLES } from '../../stores/theme';
	import { playSound, soundEngine, setSoundMuted, setSoundVolume } from '../../sound';
	import { clearOverlay, storedOverlaySize } from '../krsz-vm/disk-overlay';
	import { clearSessions, sessionsSize } from '../chatbot/sessions';
	import { performanceMode, setPerformanceMode } from '../../stores/performance';
	import {
		textSize,
		textSizeAuto,
		setTextSize,
		setTextSizeAuto,
		autoTextSize,
		physicalScreenWidth,
		TEXT_SIZES,
		DEFAULT_TEXT_SIZE
	} from '../../stores/text-scale';

	let { onClose }: { onClose: () => void } = $props();

	let themeStyles = $derived(THEME_STYLES[$resolvedTheme]);

	/** Every localStorage key any part of the site writes, gathered from each
	 *  owner's own constant so this list cannot silently drift out of sync --
	 *  see sound.ts, stores/chrome.ts, stores/synth-patch.ts, stores/console.ts,
	 *  krsz-vm/KrszVmView.svelte and chatbot/engine.ts for where each is read. */
	const GUIDE_KEYS = ['krsz.guide.seen', 'krsz.guide.synth', 'krsz.guide.lm-space', 'krsz.guide.lifelab', 'krsz.welcome.seen'];
	const SYNTH_PATCH_KEY = 'krsz-synth-patch-v1';
	const CONSOLE_KEYS = ['krsz.console.history', 'krsz.console.aliases'];
	const VM_SETTINGS_KEY = 'krsz.vm.settings';
	const CHATBOT_CONFIG_KEY = 'krsz.chatbot.config.v2';
	const VM_OVERLAYS = ['rootfs', 'rootfs-pc'] as const;

	function fmtBytes(b: number): string {
		if (b < 1024) return `${Math.round(b)} B`;
		if (b < 1048576) return `${(b / 1024).toFixed(b < 10240 ? 1 : 0)} KB`;
		return `${(b / 1048576).toFixed(1)} MB`;
	}

	interface Section {
		id: string;
		label: string;
		color: string;
		/** null while still measuring, 0 for "nothing stored" -- both render differently. */
		size: number | null;
		count?: number;
		detail: string;
		clear: () => Promise<void>;
	}

	let sections = $state<Section[]>([]);
	let clearingId = $state<string | null>(null);
	let clearingAll = $state(false);
	let doneId = $state<string | null>(null);

	async function measureVmOverlays(): Promise<number> {
		const sizes = await Promise.all(VM_OVERLAYS.map((n) => storedOverlaySize(n)));
		return sizes.reduce((a, b) => a + b, 0);
	}

	async function measureModelCache(): Promise<{ bytes: number; count: number } | null> {
		try {
			const { CacheManager } = await import('@wllama/wllama/esm/index.js');
			const entries = await new CacheManager().list();
			return { count: entries.length, bytes: entries.reduce((n, e) => n + (e.size || 0), 0) };
		} catch {
			return null;
		}
	}

	function localStorageBytes(keys: string[]): number {
		let total = 0;
		for (const k of keys) {
			try {
				const v = localStorage.getItem(k);
				if (v) total += v.length;
			} catch {
				/* private mode -- nothing to measure */
			}
		}
		return total;
	}

	function removeKeys(keys: string[]) {
		for (const k of keys) {
			try {
				localStorage.removeItem(k);
			} catch {
				/* private mode -- nothing was ever saved */
			}
		}
	}

	async function buildSections(): Promise<Section[]> {
		const [modelCache, vmBytes, chatBytes] = await Promise.all([measureModelCache(), measureVmOverlays(), sessionsSize()]);

		const list: Section[] = [
			{
				id: 'chatbot-model',
				label: tr('chrome.settings.storage.modelWeightsLabel'),
				color: '#61afef',
				size: modelCache?.bytes ?? null,
				count: modelCache?.count,
				detail: modelCache
					? tr('chrome.settings.storage.modelWeightsDetail', { count: modelCache.count })
					: tr('chrome.settings.storage.notAvailable'),
				clear: async () => {
					const { CacheManager } = await import('@wllama/wllama/esm/index.js');
					await new CacheManager().clear();
				}
			},
			{
				id: 'chatbot-sessions',
				label: tr('chrome.settings.storage.conversationsLabel'),
				color: '#c678dd',
				size: chatBytes.bytes,
				count: chatBytes.count,
				detail: tr('chrome.settings.storage.conversationsDetail', { count: chatBytes.count }),
				clear: () => clearSessions()
			},
			{
				id: 'vm-disks',
				label: tr('chrome.settings.storage.vmDisksLabel'),
				color: '#d19a66',
				size: vmBytes,
				detail: tr('chrome.settings.storage.vmDisksDetail'),
				clear: async () => {
					await Promise.all(VM_OVERLAYS.map((n) => clearOverlay(n)));
				}
			},
			{
				id: 'synth-patch',
				label: tr('chrome.settings.storage.synthAutosaveLabel'),
				color: '#98c379',
				size: localStorageBytes([SYNTH_PATCH_KEY]),
				detail: tr('chrome.settings.storage.synthAutosaveDetail'),
				clear: async () => removeKeys([SYNTH_PATCH_KEY])
			},
			{
				id: 'console-history',
				label: tr('chrome.settings.storage.consoleHistoryLabel'),
				color: '#56b6c2',
				size: localStorageBytes(CONSOLE_KEYS),
				detail: tr('chrome.settings.storage.consoleHistoryDetail'),
				clear: async () => removeKeys(CONSOLE_KEYS)
			},
			{
				id: 'vm-settings',
				label: tr('chrome.settings.storage.vmConfigLabel'),
				color: '#e5c07b',
				size: localStorageBytes([VM_SETTINGS_KEY]),
				detail: tr('chrome.settings.storage.vmConfigDetail'),
				clear: async () => removeKeys([VM_SETTINGS_KEY])
			},
			{
				id: 'chatbot-config',
				label: tr('chrome.settings.storage.genConfigLabel'),
				color: '#61afef',
				size: localStorageBytes([CHATBOT_CONFIG_KEY]),
				detail: tr('chrome.settings.storage.genConfigDetail'),
				clear: async () => removeKeys([CHATBOT_CONFIG_KEY])
			},
			{
				id: 'tours',
				label: tr('chrome.settings.storage.toursLabel'),
				color: '#e06c75',
				size: localStorageBytes(GUIDE_KEYS),
				detail: tr('chrome.settings.storage.toursDetail'),
				clear: async () => removeKeys(GUIDE_KEYS)
			}
		];
		return list;
	}

	async function refresh() {
		sections = await buildSections();
	}

	async function clearOne(s: Section) {
		if (clearingId || clearingAll) return;
		clearingId = s.id;
		playSound('click');
		try {
			await s.clear();
		} finally {
			clearingId = null;
			doneId = s.id;
			setTimeout(() => {
				if (doneId === s.id) doneId = null;
			}, 1400);
			await refresh();
		}
	}

	async function clearEverything() {
		if (clearingId || clearingAll) return;
		clearingAll = true;
		playSound('power');
		try {
			await Promise.all(sections.map((s) => s.clear()));
		} finally {
			clearingAll = false;
			await refresh();
		}
	}

	/** True once every measurable section reads zero -- "clear all" has nothing left to do. */
	let nothingStored = $derived(sections.length > 0 && sections.every((s) => !s.size));

	// Sound preferences, mirrored from the engine's own subscribe() -- not a
	// real Svelte store, so kept in local state instead of a $-prefixed import.
	let soundMuted = $state(false);
	let soundVolume = $state(0.28);

	onMount(() => {
		const unsub = soundEngine.subscribe((s) => {
			soundMuted = s.muted;
			soundVolume = s.volume;
		});
		void refresh();
		return unsub;
	});

	function onWindowKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.stopPropagation();
			onClose();
		}
	}

	/* Only so AUTO's tooltip can name the size it would pick. Tracks the window
	   so the number stays honest if the panel is open while the window is moved
	   to a display of a different resolution. */
	let screenWidth = $state(physicalScreenWidth());
	function syncScreenWidth() {
		screenWidth = physicalScreenWidth();
	}
</script>

<svelte:window onkeydown={onWindowKeydown} onresize={syncScreenWidth} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="fixed inset-0 z-[160] bg-black/70 backdrop-blur-[2px] flex items-start sm:items-center justify-center p-2 sm:p-6 overflow-y-auto"
	onclick={onClose}
	transition:fade={{ duration: 180 }}
>
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="w-full max-w-2xl {themeStyles.cardBgVideo} border {themeStyles.border} rounded-sm shadow-[0_16px_48px_rgba(0,0,0,0.8)] font-mono my-auto transform-gpu"
		onclick={(e) => e.stopPropagation()}
		transition:scale={{ duration: 180, start: 0.96, opacity: 0, easing: cubicOut }}
	>
		<BoxHeader title="GLOBAL_SETTINGS // KRSZ.IN" short="SETTINGS" class="text-xs sm:text-sm font-black px-3 py-2 border-b {themeStyles.border} {themeStyles.headerBgVideo} rounded-t-sm" style="color: {themeStyles.cursorColor}">
			<button onclick={onClose} class="press text-xs text-white/50 hover:text-white cursor-pointer font-normal transition-colors">[ Esc ]</button>
		</BoxHeader>

		<div class="p-3 sm:p-4 space-y-4 max-h-[80vh] overflow-y-auto custom-scrollbar">
			<!-- Sound -->
			<div class="border border-white/15 rounded-xs bg-black/25 p-2.5 space-y-2.5">
				<div class="text-xs sm:text-sm font-black text-[#98c379] border-b border-white/10 pb-1">{$t('chrome.settings.sound')}</div>
				<div class="flex items-center justify-between gap-3">
					<span class="text-xs text-white/70">{$t('chrome.settings.soundDesc')}</span>
					<button
						onclick={() => {
							setSoundMuted(!soundMuted);
							playSound('toggle');
						}}
						class="press px-2.5 py-1 border rounded-xs text-xs font-bold cursor-pointer transition-colors {soundMuted
							? 'border-white/20 text-white/40 hover:border-white/40'
							: 'border-[#98c379] bg-[#98c379]/15 text-[#98c379]'}"
					>
						{soundMuted ? $t('chrome.settings.muted') : $t('common.on')}
					</button>
				</div>
				<div class="flex items-center {soundMuted ? 'opacity-30 pointer-events-none' : ''}">
					<HorizontalHardwareFader
						label="VOLUME"
						value={Math.round(soundVolume * 100)}
						min={0}
						max={100}
						step={1}
						unit="%"
						width={140}
						showValue
						color="#98c379"
						onChange={(v) => setSoundVolume(v / 100)}
					/>
				</div>
			</div>

			<!-- Text size -->
			<div class="border border-white/15 rounded-xs bg-black/25 p-2.5 space-y-2">
				<div class="text-xs sm:text-sm font-black text-[#e5c07b] border-b border-white/10 pb-1">{$t('chrome.settings.textSize')}</div>
				<div class="flex items-center justify-between gap-3 flex-wrap">
					<span class="text-xs text-white/70 max-w-[70%]">
						{$t('chrome.settings.textSizeDesc')}
					</span>
					<div class="flex items-center gap-1 shrink-0">
						<button
							onclick={() => {
								setTextSizeAuto();
								playSound('click');
							}}
							title={$t('chrome.settings.textSizeAutoHint', { px: autoTextSize(screenWidth) })}
							class="press px-2 py-1 border rounded-xs text-xs font-bold cursor-pointer transition-colors {$textSizeAuto
								? 'border-[#e5c07b] bg-[#e5c07b]/15 text-[#e5c07b]'
								: 'border-white/20 text-white/40 hover:border-white/40'}"
						>
							{$t('common.lang.auto').toUpperCase()}
						</button>
						{#each TEXT_SIZES as px (px)}
							<button
								onclick={() => {
									setTextSize(px);
									playSound('click');
								}}
								title="{px}px{px % 12 === 0 ? $t('chrome.settings.textSizeExact') : ''}{px === DEFAULT_TEXT_SIZE ? ` ${$t('chrome.settings.textSizeDefault')}` : ''}"
								class="press px-2 py-1 border rounded-xs text-xs font-bold cursor-pointer transition-colors {!$textSizeAuto &&
								$textSize === px
									? 'border-[#e5c07b] bg-[#e5c07b]/15 text-[#e5c07b]'
									: 'border-white/20 text-white/40 hover:border-white/40'}"
							>
								{px}
							</button>
						{/each}
					</div>
				</div>
			</div>

			<!-- Performance -->
			<div class="border border-white/15 rounded-xs bg-black/25 p-2.5 space-y-2">
				<div class="text-xs sm:text-sm font-black text-[#61afef] border-b border-white/10 pb-1">{$t('chrome.settings.performance')}</div>
				<div class="flex items-center justify-between gap-3">
					<span class="text-xs text-white/70 max-w-[70%]">
						{$t('chrome.settings.performanceDesc')}
					</span>
					<button
						onclick={() => {
							setPerformanceMode(!$performanceMode);
							playSound('toggle');
						}}
						class="press px-2.5 py-1 border rounded-xs text-xs font-bold cursor-pointer transition-colors shrink-0 {$performanceMode
							? 'border-[#61afef] bg-[#61afef]/15 text-[#61afef]'
							: 'border-white/20 text-white/40 hover:border-white/40'}"
					>
						{$performanceMode ? $t('common.on') : $t('common.off')}
					</button>
				</div>
			</div>

			<!-- Storage -->
			<div class="border border-white/15 rounded-xs bg-black/25 p-2.5 space-y-2">
				<div class="flex items-center justify-between gap-2 border-b border-white/10 pb-1">
					<span class="text-xs sm:text-sm font-black text-[#e06c75]">{$t('chrome.settings.storageTitle')}</span>
					<button
						onclick={clearEverything}
						disabled={clearingAll || clearingId !== null || nothingStored}
						class="press px-2 py-0.5 border border-[#e06c75]/60 text-[#e06c75] rounded-xs text-[10px] font-bold cursor-pointer hover:bg-[#e06c75]/15 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
					>
						{clearingAll ? $t('chrome.settings.clearing') : $t('chrome.settings.clearEverything')}
					</button>
				</div>
				<p class="text-[10px] text-white/40 leading-relaxed">
					{$t('chrome.settings.storageDesc')}
				</p>

				{#if sections.length === 0}
					<div class="text-xs text-white/40 py-2">{$t('chrome.settings.measuring')}</div>
				{:else}
					<div class="space-y-1">
						{#each sections as s (s.id)}
							<div class="flex items-center justify-between gap-2 border border-white/10 bg-black/30 rounded-xs px-2.5 py-1.5">
								<div class="min-w-0">
									<div class="flex items-baseline gap-2">
										<span class="text-[11px] font-bold" style="color: {s.color}">{s.label}</span>
										<span class="text-[10px] text-white/35 tabular-nums">
											{s.size === null ? '—' : s.size === 0 ? $t('chrome.settings.empty') : fmtBytes(s.size)}
										</span>
									</div>
									<div class="text-[10px] text-white/40 leading-snug">{s.detail}</div>
								</div>
								<button
									onclick={() => clearOne(s)}
									disabled={clearingId !== null || clearingAll || !s.size}
									class="press shrink-0 px-2 py-1 border rounded-xs text-[10px] font-bold cursor-pointer transition-colors disabled:opacity-30 disabled:cursor-not-allowed {doneId ===
									s.id
										? 'border-[#98c379] text-[#98c379]'
										: 'border-white/25 text-white/60 hover:border-white/50 hover:text-white'}"
								>
									{clearingId === s.id ? '…' : doneId === s.id ? $t('chrome.settings.cleared') : $t('chrome.settings.clear')}
								</button>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	</div>
</div>
