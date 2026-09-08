<script lang="ts">
	import { onMount } from 'svelte';
	import { t, tr } from '$lib/i18n';
	import { Dialog, Card, Toggle, Button } from '$lib/components/ui';
	import { reduceMotion, setReduceMotion, singleKeyHotkeys, setSingleKeyHotkeys, announce } from '../../stores/a11y';
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


	/* Only so AUTO's tooltip can name the size it would pick. Tracks the window
	   so the number stays honest if the panel is open while the window is moved
	   to a display of a different resolution. */
	let screenWidth = $state(physicalScreenWidth());
	function syncScreenWidth() {
		screenWidth = physicalScreenWidth();
	}
</script>

<svelte:window onresize={syncScreenWidth} />

<Dialog title="GLOBAL_SETTINGS // KRSZ.IN" short="SETTINGS" label={$t('a11y.dialog.settings')} {onClose} bodyClass="p-3 sm:p-4 space-y-4 max-h-[80vh] overflow-y-auto custom-scrollbar">
	<!-- Sound -->
	<Card tone="flat" title={$t('chrome.settings.sound')} color="#98c379" class="space-y-2.5">
		<div class="flex items-center justify-between gap-3">
			<span class="text-xs text-white/70">{$t('chrome.settings.soundDesc')}</span>
			<Toggle
				checked={!soundMuted}
				label={$t('chrome.settings.sound')}
				color="#98c379"
				offText={$t('chrome.settings.muted')}
				onchange={(on) => setSoundMuted(!on)}
			/>
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
	</Card>

	<!-- Text size -->
	<Card tone="flat" title={$t('chrome.settings.textSize')} color="#e5c07b" class="space-y-2">
		<div class="flex items-center justify-between gap-3 flex-wrap">
			<span class="text-xs text-white/70 max-w-[70%]">
				{$t('chrome.settings.textSizeDesc')}
			</span>
			<div class="flex items-center gap-1 shrink-0" role="group" aria-label={$t('chrome.settings.textSize')}>
				<Button
					variant="neutral"
					color="#e5c07b"
					active={$textSizeAuto}
					title={$t('chrome.settings.textSizeAutoHint', { px: autoTextSize(screenWidth) })}
					onclick={setTextSizeAuto}
				>
					{$t('common.lang.auto').toUpperCase()}
				</Button>
				{#each TEXT_SIZES as px (px)}
					<Button
						variant="neutral"
						color="#e5c07b"
						active={!$textSizeAuto && $textSize === px}
						title="{px}px{px % 12 === 0 ? $t('chrome.settings.textSizeExact') : ''}{px === DEFAULT_TEXT_SIZE ? ` ${$t('chrome.settings.textSizeDefault')}` : ''}"
						onclick={() => setTextSize(px)}
					>
						{px}
					</Button>
				{/each}
			</div>
		</div>
	</Card>

	<!-- Accessibility -->
	<Card tone="flat" title={$t('a11y.settings.title')} color="#56b6c2" class="space-y-2.5">
		<div class="flex items-center justify-between gap-3">
			<div class="min-w-0">
				<div class="text-xs font-bold text-white/80">{$t('a11y.settings.reduceMotion')}</div>
				<div class="text-[10px] text-white/60 leading-snug">{$t('a11y.settings.reduceMotionDesc')}</div>
			</div>
			<Toggle
				checked={$reduceMotion}
				label={$t('a11y.settings.reduceMotion')}
				color="#56b6c2"
				onchange={(on) => {
					setReduceMotion(on);
					announce($t(on ? 'a11y.announce.on' : 'a11y.announce.off', { name: $t('a11y.settings.reduceMotion') }));
				}}
			/>
		</div>
		<div class="flex items-center justify-between gap-3">
			<div class="min-w-0">
				<div class="text-xs font-bold text-white/80">{$t('a11y.settings.singleKey')}</div>
				<div class="text-[10px] text-white/60 leading-snug">{$t('a11y.settings.singleKeyDesc')}</div>
			</div>
			<Toggle
				checked={$singleKeyHotkeys}
				label={$t('a11y.settings.singleKey')}
				color="#56b6c2"
				onchange={(on) => {
					setSingleKeyHotkeys(on);
					announce($t(on ? 'a11y.announce.on' : 'a11y.announce.off', { name: $t('a11y.settings.singleKey') }));
				}}
			/>
		</div>
		<p class="text-[10px] text-white/60 leading-relaxed">{$t('a11y.settings.textSizeNote')}</p>
	</Card>

	<!-- Performance -->
	<Card tone="flat" title={$t('chrome.settings.performance')} color="#61afef" class="space-y-2">
		<div class="flex items-center justify-between gap-3">
			<span class="text-xs text-white/70 max-w-[70%]">
				{$t('chrome.settings.performanceDesc')}
			</span>
			<Toggle checked={$performanceMode} label={$t('chrome.settings.performance')} color="#61afef" onchange={setPerformanceMode} />
		</div>
	</Card>

	<!-- Storage -->
	<Card tone="flat" title={$t('chrome.settings.storageTitle')} color="#e06c75" class="space-y-2">
		{#snippet titleRight()}
			<Button
				variant="outline"
				color="#e06c75"
				size="xs"
				onclick={clearEverything}
				disabled={clearingAll || clearingId !== null || nothingStored}
			>
				{clearingAll ? $t('chrome.settings.clearing') : $t('chrome.settings.clearEverything')}
			</Button>
		{/snippet}
		<p class="text-[10px] text-white/60 leading-relaxed">
			{$t('chrome.settings.storageDesc')}
		</p>

		{#if sections.length === 0}
			<div class="text-xs text-white/60 py-2" aria-live="polite">{$t('chrome.settings.measuring')}</div>
		{:else}
			<ul class="space-y-1">
				{#each sections as s (s.id)}
					<li class="flex items-center justify-between gap-2 border border-white/10 bg-black/30 rounded-xs px-2.5 py-1.5">
						<div class="min-w-0">
							<div class="flex items-baseline gap-2">
								<span class="text-[11px] font-bold" style="color: {s.color}">{s.label}</span>
								<span class="text-[10px] text-white/50 tabular-nums">
									{s.size === null ? '—' : s.size === 0 ? $t('chrome.settings.empty') : fmtBytes(s.size)}
								</span>
							</div>
							<div class="text-[10px] text-white/60 leading-snug">{s.detail}</div>
						</div>
						<Button
							variant="neutral"
							color="#98c379"
							size="xs"
							active={doneId === s.id}
							label="{$t('chrome.settings.clear')}: {s.label}"
							onclick={() => clearOne(s)}
							disabled={clearingId !== null || clearingAll || !s.size}
						>
							{clearingId === s.id ? '…' : doneId === s.id ? $t('chrome.settings.cleared') : $t('chrome.settings.clear')}
						</Button>
					</li>
				{/each}
			</ul>
		{/if}
	</Card>
</Dialog>
