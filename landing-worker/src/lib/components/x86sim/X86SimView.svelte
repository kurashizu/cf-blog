<script lang="ts">
	import { onMount } from 'svelte';
	import { playSound } from '../../sound';
	import { theme, THEME_STYLES } from '../../stores/theme';
	import { suspendNavHotkeys } from '../../stores/hotkeys';

	type Phase = 'idle' | 'loading' | 'running' | 'error';

	const SETTINGS_KEY = 'krsz.vm.settings';

	interface Settings {
		memoryMb: number;
		vgaMemoryMb: number;
		/** 'auto' prefers a purpose-built image and falls back to the ISO. */
		boot: 'auto' | 'kernel' | 'cdrom';
		cmdline: string;
		acpi: boolean;
		jit: boolean;
	}

	const MEMORY_CHOICES = [64, 128, 256, 512, 1024];
	const VGA_CHOICES = [2, 4, 8, 16];

	/**
	 * Kernel command line for the purpose-built image. tty0 is listed last so it
	 * becomes /dev/console and the VGA screen carries the session; ttyS0 still
	 * gets a getty from the image's inittab.
	 */
	const DEFAULT_CMDLINE = 'root=/dev/sda rw console=ttyS0,115200 console=tty0';

	const DEFAULTS: Settings = {
		// Alpine's ISO unpacks modloop into RAM, so it needs real headroom; a
		// disk-installed image is happy with much less.
		memoryMb: 512,
		vgaMemoryMb: 8,
		boot: 'auto',
		cmdline: DEFAULT_CMDLINE,
		acpi: false,
		jit: true
	};

	let settings = $state<Settings>({ ...DEFAULTS });
	let showSettings = $state(false);
	/** Must match CHUNK in the disk proxy so each read maps to one cache entry. */
	const CHUNK = 1024 * 1024;
	const IMAGE = 'alpine';
	/**
	 * Typed at the ISOLINUX prompt. `lts` is the ISO's default label; the extra
	 * option skips modloop signature verification, which otherwise reads and
	 * hashes the whole 240 MB module squashfs through an emulated IDE CD — slow
	 * enough that the guest never finishes booting.
	 */
	const BOOT_LINE = 'virt modloop_verify=no acpi=off nomodeset';

	let themeStyles = $derived(THEME_STYLES[$theme]);

	let phase = $state<Phase>('idle');
	let status = $state('');
	let errorText = $state<string | null>(null);
	let screenEl: HTMLDivElement | undefined = $state();

	let imageSize = $state<number | null>(null);
	let chunksFetched = $state(0);
	let bootedAt = $state(0);
	let uptime = $state(0);
	let mips = $state<number | null>(null);
	/** True once the guest has switched the VGA adapter out of text mode. */
	let graphical = $state(false);

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let emulator: any = null;
	let ticker: ReturnType<typeof setInterval> | null = null;
	let lastInstructions = 0;
	let lastSample = 0;
	let bootLineSent = $state(false);
	let mode = $state<'kernel' | 'cdrom'>('cdrom');

	function loadSettings() {
		try {
			const raw = localStorage.getItem(SETTINGS_KEY);
			if (!raw) return;
			const saved = JSON.parse(raw) as Partial<Settings>;
			// Merge rather than replace, so a stored blob from an older build cannot
			// leave a field undefined and break the emulator config.
			settings = { ...DEFAULTS, ...saved };
		} catch {
			/* unreadable or corrupt — the defaults are fine */
		}
	}

	function saveSettings() {
		try {
			localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
		} catch {
			/* private mode — the choice just won't survive a reload */
		}
	}

	function resetSettings() {
		settings = { ...DEFAULTS };
		saveSettings();
		playSound('click');
	}

	async function imageInfo(name: string): Promise<{ size: number } | null> {
		try {
			const res = await fetch(`/vm/img/${name}?info`);
			return res.ok ? ((await res.json()) as { size: number }) : null;
		} catch {
			return null;
		}
	}

	/**
	 * Every disk read goes through /vm/img, so counting fetches there is a real
	 * measure of how much of the image this boot actually touched — the whole
	 * point of streaming it rather than downloading 49 MiB up front.
	 */
	function installFetchCounter() {
		const original = window.XMLHttpRequest.prototype.open;
		window.XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]) {
			if (/\/vm\/img\/(alpine|rootfs)\b/.test(String(url))) {
				this.addEventListener('load', () => chunksFetched++, { once: true });
			}
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			return original.call(this, method, url as any, ...(rest as [boolean, string?, string?]));
		};
		return () => {
			window.XMLHttpRequest.prototype.open = original;
		};
	}

	let restoreFetch: (() => void) | null = null;

	async function boot() {
		if (phase === 'loading' || phase === 'running') return;
		phase = 'loading';
		errorText = null;
		chunksFetched = 0;
		playSound('toggle');

		try {
			status = 'reading image metadata…';
			// A purpose-built kernel + rootfs is preferred when the build workflow
			// has published one; otherwise fall back to booting the stock ISO.
			const wantKernel = settings.boot !== 'cdrom';
			const rootfs = wantKernel ? await imageInfo('rootfs') : null;
			const kernel = rootfs ? await imageInfo('vmlinuz') : null;
			if (settings.boot === 'kernel' && !kernel) {
				throw new Error('no purpose-built image is published on this deployment yet');
			}
			const meta = kernel ? rootfs : await imageInfo(IMAGE);
			if (!meta) throw new Error('no VM image is configured on this deployment');
			imageSize = meta.size;
			mode = kernel ? 'kernel' : 'cdrom';

			status = 'loading emulator (2 MB wasm)…';
			// v86 exports both a default and a named V86; only the named one is typed.
			const [{ V86 }, { default: wasmPath }] = await Promise.all([
				import('v86'),
				import('v86/build/v86.wasm?url')
			]);

			restoreFetch = installFetchCounter();
			status = 'starting SeaBIOS…';

			// v86 rounds async reads out to fixed_chunk_size, so the proxy's cache
			// is hit squarely instead of straddling two entries.
			const streamed = { async: true as const, size: meta.size, fixed_chunk_size: CHUNK };

			emulator = new V86({
				wasm_path: wasmPath,
				memory_size: settings.memoryMb * 1024 * 1024,
				vga_memory_size: settings.vgaMemoryMb * 1024 * 1024,
				acpi: settings.acpi,
				disable_jit: !settings.jit,
				screen_container: screenEl,
				bios: { url: '/vm/seabios.bin' },
				vga_bios: { url: '/vm/vgabios.bin' },
				...(mode === 'kernel'
					? {
							// Loading the kernel and initrd directly skips the bootloader
							// entirely, which is what makes the cmdline ours to set.
							bzimage: { url: '/vm/img/vmlinuz' },
							initrd: { url: '/vm/img/initramfs' },
							cmdline: settings.cmdline,
							hda: { url: '/vm/img/rootfs', ...streamed }
						}
					: {
							cdrom: { url: `/vm/img/${IMAGE}`, ...streamed },
							boot_order: 0x123 // CD, then hard disk, then floppy
						}),
				autostart: true,
				disable_speaker: true
			});

			emulator.add_listener('emulator-started', () => {
				phase = 'running';
				status = 'running';
				bootedAt = performance.now();
				lastSample = bootedAt;
				lastInstructions = 0;
				// Only the stock ISO needs its bootloader prompt driven.
				if (mode === 'cdrom') waitForBootPrompt();
			});
			emulator.add_listener('screen-set-size', (dims: [number, number, number]) => {
				graphical = dims[2] !== 0;
			});

			ticker = setInterval(sample, 1000);
		} catch (e) {
			phase = 'error';
			errorText = e instanceof Error ? e.message : String(e);
			status = '';
			playSound('ping', false);
		}
	}

	/**
	 * ISOLINUX offers a `boot:` prompt for a few seconds before auto-booting the
	 * default label. Typing our own line there is the only way to influence the
	 * kernel cmdline when booting a stock ISO.
	 */
	function waitForBootPrompt() {
		let attempts = 0;
		const poll = setInterval(() => {
			if (!emulator || phase !== 'running' || attempts++ > 60) {
				clearInterval(poll);
				return;
			}
			const text = screenEl?.textContent ?? '';
			if (!/boot:/.test(text)) return;
			clearInterval(poll);
			bootLineSent = true;
			emulator.keyboard_send_text(BOOT_LINE);
			// keyboard_send_text does not map "\n" to Enter, so press it by scancode
			// (0x1C make / 0x9C break) once the line has been typed out.
			setTimeout(() => emulator?.keyboard_send_scancodes?.([0x1c, 0x9c]), 300);
		}, 250);
	}

	function sample() {
		if (!emulator || phase !== 'running') return;
		uptime = (performance.now() - bootedAt) / 1000;
		const counter = emulator.get_instruction_counter?.();
		if (typeof counter === 'number') {
			const now = performance.now();
			const elapsed = (now - lastSample) / 1000;
			// v86 returns cpu.instruction_counter[0] >>> 0 — a 32-bit counter that
			// wraps roughly every seven minutes at 10 MIPS. A negative delta is a
			// wrap, not a slowdown, so drop the sample rather than print a bogus one.
			const delta = counter - lastInstructions;
			if (elapsed > 0 && delta >= 0) mips = delta / elapsed / 1e6;
			lastInstructions = counter;
			lastSample = now;
		}
	}

	function shutdown() {
		if (ticker) clearInterval(ticker);
		ticker = null;
		try {
			emulator?.destroy?.();
		} catch {
			/* already torn down */
		}
		emulator = null;
		restoreFetch?.();
		restoreFetch = null;
		phase = 'idle';
		status = '';
		bootLineSent = false;
		uptime = 0;
		mips = null;
		graphical = false;
	}

	function stop() {
		shutdown();
		playSound('click');
	}

	function sendCtrlAltDel() {
		// 0x1D ctrl, 0x38 alt, 0x53 delete — make, then break.
		emulator?.keyboard_send_scancodes?.([0x1d, 0x38, 0x53, 0xd3, 0xb8, 0x9d]);
		playSound('click');
	}

	function focusScreen() {
		// v86 reads keys off the document, so the tab's own hotkeys have to yield
		// while the guest has focus — otherwise "t" would flip the theme mid-shell.
		suspendNavHotkeys.set(true);
	}

	function blurScreen() {
		suspendNavHotkeys.set(false);
	}

	onMount(() => {
		loadSettings();
		return () => {
			shutdown();
			suspendNavHotkeys.set(false);
		};
	});

	$effect(() => {
		// Touch every field so any change is persisted.
		JSON.stringify(settings);
		saveSettings();
	});

	let fetchedBytes = $derived(chunksFetched * CHUNK);
	let imageMiB = $derived(imageSize === null ? null : imageSize / 1024 / 1024);

	let FACTS = $derived<{ label: string; value: string; title?: string }[]>([
		{ label: 'EMULATOR', value: 'v86 — x86-to-wasm JIT, BSD-2', title: 'copy/v86: a 32-bit x86 PC emulator that JIT-compiles guest code to WebAssembly' },
		{ label: 'GUEST', value: 'Alpine Linux 3.24.1, x86 (32-bit)', title: 'Alpine still ships 32-bit x86 as a release architecture, which is why it works here where Debian and Arch no longer would' },
		{ label: 'CPU', value: 'single core, ~Pentium 4 class, no x86-64' },
		{ label: 'RAM', value: `${settings.memoryMb} MB guest / ${settings.vgaMemoryMb} MB VGA` },
		{ label: 'DISK', value: 'read-only ISO, streamed in 1 MiB chunks' },
		{ label: 'NETWORK', value: 'relay ready, guest not wired', title: 'The OmniProxy relay at /net is live and tested, but the in-browser gateway that turns guest ethernet frames into relay streams is not written yet' },
		{ label: 'STATUS', value: 'boots, then resets at driver load' }
	]);
</script>

<div class="space-y-3 flex-1 min-h-0 flex flex-col">
	<div class="flex flex-wrap items-start justify-between gap-2 border-b border-white/10 pb-2 shrink-0">
		<pre class="text-[7px] sm:text-[10px] md:text-xs font-black tracking-tight text-[#98c379] leading-tight overflow-x-auto select-none">{`██╗     ██╗███╗   ██╗██╗   ██╗██╗  ██╗
██║     ██║████╗  ██║██║   ██║╚██╗██╔╝
██║     ██║██╔██╗ ██║██║   ██║ ╚███╔╝
██║     ██║██║╚██╗██║██║   ██║ ██╔██╗
███████╗██║██║ ╚████║╚██████╔╝██╔╝ ██╗
╚══════╝╚═╝╚═╝  ╚═══╝ ╚═════╝ ╚═╝  ╚═╝`}</pre>

		<div class="flex flex-wrap items-center gap-2">
			{#if phase === 'running'}
				<span class="text-xs font-mono font-bold text-[#98c379]">
					● RUNNING · {uptime.toFixed(0)}s
					{#if mips !== null}
						<span title="Instructions per second of wall clock. The emulated CPU is halted while a disk chunk is being fetched, so this counts network waits as if they were slow execution — during boot it says more about I/O than about the JIT.">
							· {mips.toFixed(2)} MIPS<span class="text-white/35"> incl. I/O waits</span>
						</span>
					{/if}
				</span>
				<button
					onclick={sendCtrlAltDel}
					title="Send Ctrl+Alt+Del to the guest"
					class="px-2.5 py-1 border border-[#e5c07b]/50 text-[#e5c07b] rounded-xs text-xs font-bold cursor-pointer hover:bg-[#e5c07b]/20"
				>
					CTRL+ALT+DEL
				</button>
				<button
					onclick={stop}
					class="px-2.5 py-1 border border-[#e06c75] text-[#e06c75] rounded-xs text-xs font-black cursor-pointer hover:bg-[#e06c75] hover:text-black"
				>
					POWER OFF
				</button>
			{:else if phase === 'loading'}
				<span class="text-xs font-mono text-[#e5c07b]">◐ {status}</span>
				<button
					onclick={stop}
					class="px-2.5 py-1 border border-white/25 text-white/70 rounded-xs text-xs font-bold cursor-pointer hover:bg-white/10"
				>
					CANCEL
				</button>
			{:else}
				<button
					onclick={() => (showSettings = !showSettings)}
					title="Machine configuration — applied when the VM is built, so it can only change while it is powered off"
					class="px-2.5 py-1.5 border rounded-xs text-xs font-bold cursor-pointer transition-colors {showSettings
						? 'border-[#56b6c2] bg-[#56b6c2]/20 text-[#56b6c2]'
						: 'border-white/25 text-white/70 hover:bg-white/10'}"
				>
					⚙ CONFIG
				</button>
				<button
					onclick={boot}
					class="px-3 py-1.5 border border-[#98c379] text-[#98c379] rounded-xs text-xs font-black cursor-pointer hover:bg-[#98c379] hover:text-black"
				>
					▶ BOOT ANYWAY
				</button>
			{/if}
		</div>
	</div>

	{#if phase === 'idle' || phase === 'error'}
		<div class="space-y-3">
			<p class="text-[11px] sm:text-xs text-white/60 leading-relaxed max-w-3xl">
				A real 32-bit x86 PC, emulated in this tab — SeaBIOS, a bootloader and an actual Linux
				kernel, not a shell simulation. It is a work in progress: the boot gets a long way and
				then resets, and the panel below says exactly where and what has been ruled out.
			</p>

			{#if showSettings}
				<div class="border border-[#56b6c2]/40 bg-black/30 rounded-xs p-2.5 space-y-2.5">
					<div class="flex items-center justify-between gap-2 border-b border-white/10 pb-1.5">
						<span class="text-xs font-black font-mono text-[#56b6c2]">MACHINE CONFIG</span>
						<div class="flex items-center gap-2">
							<span class="text-[10px] font-mono text-white/35">saved in this browser · applies at next boot</span>
							<button onclick={resetSettings} class="text-[10px] font-mono text-white/45 hover:text-white cursor-pointer underline">
								reset
							</button>
						</div>
					</div>

					<div class="flex flex-wrap items-center gap-2">
						<span class="text-[10px] font-mono font-bold text-white/45 uppercase w-[92px]">GUEST RAM</span>
						{#each MEMORY_CHOICES as mb (mb)}
							<button
								onclick={() => (settings.memoryMb = mb)}
								class="px-2 py-0.5 border rounded-xs text-[11px] font-mono font-bold cursor-pointer transition-colors {settings.memoryMb === mb
									? 'border-[#98c379] bg-[#98c379]/20 text-[#98c379]'
									: 'border-white/20 text-white/55 hover:border-white/50'}"
							>
								{mb} MB
							</button>
						{/each}
						<span class="text-[10px] font-mono text-white/30">this is browser memory, not your machine's</span>
					</div>

					<div class="flex flex-wrap items-center gap-2">
						<span class="text-[10px] font-mono font-bold text-white/45 uppercase w-[92px]">VGA RAM</span>
						{#each VGA_CHOICES as mb (mb)}
							<button
								onclick={() => (settings.vgaMemoryMb = mb)}
								class="px-2 py-0.5 border rounded-xs text-[11px] font-mono font-bold cursor-pointer transition-colors {settings.vgaMemoryMb === mb
									? 'border-[#c678dd] bg-[#c678dd]/20 text-[#c678dd]'
									: 'border-white/20 text-white/55 hover:border-white/50'}"
							>
								{mb} MB
							</button>
						{/each}
					</div>

					<div class="flex flex-wrap items-center gap-2">
						<span class="text-[10px] font-mono font-bold text-white/45 uppercase w-[92px]">BOOT</span>
						{#each [['auto', 'AUTO'], ['kernel', 'DIRECT KERNEL'], ['cdrom', 'ISO BOOTLOADER']] as const as [value, label] (value)}
							<button
								onclick={() => (settings.boot = value)}
								title={value === 'auto'
									? 'Use the purpose-built image when one is published, otherwise the stock ISO'
									: value === 'kernel'
										? 'Load the kernel and initramfs directly, with the command line below'
										: 'Boot the stock Alpine ISO through its bootloader'}
								class="px-2 py-0.5 border rounded-xs text-[11px] font-mono font-bold cursor-pointer transition-colors {settings.boot === value
									? 'border-[#61afef] bg-[#61afef]/20 text-[#61afef]'
									: 'border-white/20 text-white/55 hover:border-white/50'}"
							>
								{label}
							</button>
						{/each}
					</div>

					<div class="flex flex-wrap items-center gap-2">
						<span class="text-[10px] font-mono font-bold text-white/45 uppercase w-[92px]">CMDLINE</span>
						<input
							type="text"
							bind:value={settings.cmdline}
							spellcheck="false"
							title="Kernel command line, used only by direct kernel boot"
							class="flex-1 min-w-[240px] px-2 py-1 bg-black/60 border border-white/20 rounded-xs text-[11px] font-mono text-[#d8dee9] outline-none focus:border-[#56b6c2]"
						/>
					</div>

					<div class="flex flex-wrap items-center gap-3">
						<span class="text-[10px] font-mono font-bold text-white/45 uppercase w-[92px]">CPU</span>
						<label class="flex items-center gap-1.5 text-[11px] font-mono text-white/65 cursor-pointer">
							<input type="checkbox" bind:checked={settings.jit} class="accent-[#98c379]" />
							<span title="v86 interprets code until a block is hot, then compiles it to WebAssembly. Turning this off is much slower and only useful for comparison.">JIT</span>
						</label>
						<label class="flex items-center gap-1.5 text-[11px] font-mono text-white/65 cursor-pointer">
							<input type="checkbox" bind:checked={settings.acpi} class="accent-[#98c379]" />
							<span title="Expose an ACPI table to the guest. Off by default: it gives the kernel more hardware to probe, and probing is where this emulator is weakest.">ACPI</span>
						</label>
					</div>
				</div>
			{/if}

			<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
				{#each FACTS as fact (fact.label)}
					<div class="border border-white/15 bg-black/40 rounded-xs px-2.5 py-2 flex items-baseline justify-between gap-2" title={fact.title}>
						<span class="text-[10px] font-mono font-bold text-white/45 uppercase shrink-0">{fact.label}</span>
						<span class="text-xs font-mono font-bold text-[#d8dee9] text-right">{fact.value}</span>
					</div>
				{/each}
			</div>

			<div class="border border-[#e06c75]/40 bg-[#e06c75]/5 rounded-xs p-2.5 space-y-1.5">
				<div class="text-xs font-black font-mono text-[#e06c75]">UNFINISHED — IT DOES NOT REACH A SHELL YET</div>
				<p class="text-[11px] text-white/65 leading-relaxed">
					Press BOOT and you will watch SeaBIOS post, ISOLINUX load, Linux 6.18 come up and
					OpenRC start mounting filesystems — all real. Then, at
					<span class="text-[#e5c07b] font-mono">Loading hardware drivers</span>, the machine
					resets and starts over. That step is where the guest probes emulated PCI hardware
					and modprobes drivers for it, and something there triple-faults v86.
				</p>
				<p class="text-[11px] text-white/50 leading-relaxed">
					Ruled out so far: it is not the disk stream (every chunk request returns 206 in a
					few ms), not guest RAM (identical at 256 and 512 MB), not kernel age (Alpine 3.16
					on 5.15 fails earlier than 3.24 on 6.18), and not ACPI or KMS
					(<span class="font-mono">acpi=off nomodeset</span> changes nothing). The likely fix
					is a purpose-built disk image rather than a stock ISO, which is how essentially
					every working v86 Linux is put together.
				</p>
			</div>

			<div class="border border-white/15 bg-black/25 rounded-xs p-2.5 space-y-1">
				<div class="text-xs font-black font-mono text-white/60">WHAT ALREADY WORKS</div>
				<ul class="text-[11px] text-white/55 leading-relaxed list-disc pl-4 space-y-0.5">
					<li>The ISO is never downloaded whole: v86 reads 1 MiB chunks over HTTP Range as the guest touches them, through a proxy that caches each chunk at the edge.</li>
					<li>The kernel command line above is typed into the ISOLINUX prompt by the page, which is the only way to influence it when booting a stock ISO.</li>
					<li>Nothing starts on its own — opening this tab costs you nothing until you press BOOT.</li>
					<li>Keyboard input goes to the guest while the screen has focus, so the site's own shortcuts pause there. Click outside to get them back.</li>
				</ul>
			</div>

			{#if errorText}
				<div class="border border-[#e06c75]/50 bg-[#e06c75]/10 rounded-xs p-2.5">
					<div class="text-xs font-black font-mono text-[#e06c75]">BOOT FAILED</div>
					<div class="text-[11px] font-mono text-white/70 mt-1 break-all">{errorText}</div>
				</div>
			{/if}
		</div>
	{/if}

	<!-- v86 wants exactly this shape: a <div> it fills in text mode and a <canvas> for graphics -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div
		class="flex-1 min-h-0 border {themeStyles.border} bg-black rounded-xs overflow-auto {phase === 'idle' || phase === 'error'
			? 'hidden'
			: ''}"
		onfocusin={focusScreen}
		onfocusout={blurScreen}
		onmousedown={focusScreen}
	>
		<div bind:this={screenEl} class="inline-block origin-top-left">
			<div style="white-space: pre; font: 15px/15px monospace; color: #d8dee9; padding: 6px;"></div>
			<canvas style="display: none"></canvas>
		</div>
	</div>

	{#if phase === 'running' || phase === 'loading'}
		<div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] font-mono text-white/40 shrink-0">
			<span>
				IMAGE <span class="text-[#56b6c2]">{imageMiB === null ? '—' : `${imageMiB.toFixed(0)} MiB`}</span>
			</span>
			<span title="Chunks actually pulled by this boot — the rest of the image was never downloaded">
				STREAMED <span class="text-[#98c379]">{(fetchedBytes / 1024 / 1024).toFixed(0)} MiB</span>
				<span class="text-white/25">({chunksFetched} × 1 MiB chunks)</span>
			</span>
			<span>MODE <span class="text-[#c678dd]">{graphical ? 'graphical' : 'text'}</span></span>
			<span>BOOT <span class="text-[#61afef]">{mode === 'kernel' ? 'direct kernel' : 'ISO bootloader'}</span></span>
			{#if bootLineSent}
				<span title="Typed at the ISOLINUX prompt to control the kernel cmdline">
					CMDLINE <span class="text-[#e5c07b]">{BOOT_LINE}</span>
				</span>
			{/if}
			<span class="text-white/25">read-only · nothing is persisted</span>
		</div>
	{/if}
</div>
