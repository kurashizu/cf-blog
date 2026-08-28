<script lang="ts">
	import { onMount } from 'svelte';
	import { playSound } from '../../sound';
	import { theme, THEME_STYLES } from '../../stores/theme';
	import { suspendNavHotkeys } from '../../stores/hotkeys';
	import VirtualKeyboard from './VirtualKeyboard.svelte';
	import MermaidDiagram from '../projects/MermaidDiagram.svelte';

	type Phase = 'idle' | 'loading' | 'running' | 'error';

	const SETTINGS_KEY = 'krsz.vm.settings';

	interface Settings {
		/** Bumped when a default changes in a way a stored value must not survive. */
		version: number;
		memoryMb: number;
		vgaMemoryMb: number;
		/** 'auto' prefers a purpose-built image and falls back to the ISO. */
		boot: 'auto' | 'kernel' | 'cdrom';
		cmdline: string;
		acpi: boolean;
		jit: boolean;
		/** Attach a NIC and point it at the relay. */
		network: boolean;
		/**
		 * 'terminal' attaches xterm.js to the guest's serial port; 'screen' shows
		 * the emulated VGA adapter. The VGA text console cannot report the mouse,
		 * so anything that wants a pointer — tmux, ncurses apps — needs the former.
		 */
		display: 'terminal' | 'screen';
	}

	const MEMORY_CHOICES = [64, 128, 256, 512, 1024];
	const VGA_CHOICES = [2, 4, 8, 16];

	/**
	 * Kernel command line for the purpose-built image.
	 *
	 * `modules=` force-loads sd_mod: Alpine's initramfs loads drivers by modalias,
	 * and sd_mod has none — it binds when the SCSI layer offers it a disk. Without
	 * it the guest enumerates 0:0:0:0 and never creates /dev/sda. The name is
	 * spelled with an underscore because the initramfs's busybox modprobe does not
	 * translate "sd-mod" the way kmod's does — it answers "Module sd-mod not
	 * found" and carries on.
	 *
	 * The root is named by device rather than by LABEL: with sd-mod loading, the
	 * disk shows up as /dev/sda, while `root=LABEL=` left the initramfs reporting
	 * "Can't lookup blockdev" — it has no blkid to resolve a label with.
	 *
	 * tty0 is listed last so it becomes /dev/console and the VGA screen carries
	 * the session; ttyS0 still gets a getty from the image's inittab.
	 */
	const DEFAULT_CMDLINE =
		'root=/dev/sda rw modules=sd_mod,ata_piix,ext4 rootwait console=ttyS0,115200 console=tty0';

	const SETTINGS_VERSION = 5;

	const DEFAULTS: Settings = {
		version: SETTINGS_VERSION,
		// Alpine's ISO unpacks modloop into RAM, so it needs real headroom; a
		// disk-installed image is happy with much less.
		memoryMb: 512,
		vgaMemoryMb: 8,
		boot: 'auto',
		cmdline: DEFAULT_CMDLINE,
		acpi: false,
		jit: true,
		network: true,
		display: 'terminal'
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
	/** Shown by default on coarse pointers, where there is no real keyboard. */
	let showKeyboard = $state(false);
	/** Scale the emulated screen down so an 80-column console fits a phone. */
	let screenScale = $state(1);
	let keyboardCaptured = $state(false);
	let screenWrap: HTMLDivElement | undefined = $state();
	let termEl: HTMLDivElement | undefined = $state();
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let fitAddon: any = null;

	function sendScancodes(codes: number[]) {
		emulator?.keyboard_send_scancodes?.(codes);
	}

	function loadSettings() {
		try {
			const raw = localStorage.getItem(SETTINGS_KEY);
			if (!raw) return;
			const saved = JSON.parse(raw) as Partial<Settings>;
			// Merge rather than replace, so a stored blob from an older build cannot
			// leave a field undefined and break the emulator config. A stale version
			// drops the fields whose defaults have since been corrected.
			const stale = (saved.version ?? 0) < SETTINGS_VERSION;
			if (stale) delete saved.cmdline;
			settings = { ...DEFAULTS, ...saved, version: SETTINGS_VERSION };
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

	/**
	 * Images are served immutable, but their R2 keys are reused on every rebuild,
	 * so the URL carries the size as a version — otherwise the edge keeps handing
	 * back the previous build until the cache expires a year from now.
	 */
	function imageUrl(name: string, size: number): string {
		return `/vm/img/${name}?v=${size}`;
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
			const initramfs = kernel ? await imageInfo('initramfs') : null;
			if (settings.boot === 'kernel' && !kernel) {
				throw new Error('no purpose-built image is published on this deployment yet');
			}
			const meta = kernel ? rootfs : await imageInfo(IMAGE);
			if (!meta) throw new Error('no VM image is configured on this deployment');
			imageSize = meta.size;
			mode = kernel ? 'kernel' : 'cdrom';

			status = 'loading emulator (2 MB wasm)…';
			// xterm only comes down when the terminal display is actually chosen.
			const terminalMode = settings.display === 'terminal';
			const xterm = terminalMode
				? await Promise.all([import('@xterm/xterm'), import('@xterm/addon-fit'), import('@xterm/xterm/css/xterm.css')])
				: null;
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
				...(terminalMode
					? {
							// v86 drives the terminal directly; the VGA adapter still exists,
							// it is just not what is on screen.
							serial_console: {
								type: 'xtermjs' as const,
								xterm_lib: xterm![0].Terminal,
								container: termEl
							}
						}
					: { screen_container: screenEl }),
				bios: { url: '/vm/seabios.bin' },
				vga_bios: { url: '/vm/vgabios.bin' },
				...(mode === 'kernel'
					? {
							// Loading the kernel and initrd directly skips the bootloader
							// entirely, which is what makes the cmdline ours to set.
							bzimage: { url: imageUrl('vmlinuz', kernel?.size ?? 0) },
							initrd: { url: imageUrl('initramfs', initramfs?.size ?? 0) },
							cmdline: settings.cmdline,
							hda: { url: imageUrl('rootfs', meta.size), ...streamed }
						}
					: {
							cdrom: { url: imageUrl(IMAGE, meta.size), ...streamed },
							boot_order: 0x123 // CD, then hard disk, then floppy
						}),
				autostart: true,
				disable_speaker: true,
				...(settings.network
					? {
							net_device: {
								// virtio is the modern-Linux path and carries a larger MTU;
								// the relay is same-origin so the page never learns the
								// upstream endpoint.
								type: 'virtio' as const,
								relay_url: `${location.protocol === 'https:' ? 'wisps' : 'wisp'}://${location.host}/net/wisp`,
								// v86's WISP backend answers ARP, DHCP and ping itself and
								// resolves names over DoH. The resolver has to be same-origin:
								// the lookup is a fetch from this page, and a public resolver
								// is a cross-origin request the browser will not make — which
								// showed up as every name failing with "DNS: transient error".
								dns_method: 'doh' as const,
								doh_server: location.host
							}
						}
					: {})
			});

			emulator.add_listener('emulator-started', () => {
				phase = 'running';
				status = 'running';
				bootedAt = performance.now();
				lastSample = bootedAt;
				lastInstructions = 0;
				// The guest owns the keyboard for as long as it is running.
				suspendNavHotkeys.set(true);
				// Only the stock ISO needs its bootloader prompt driven.
				if (mode === 'cdrom') waitForBootPrompt();
			});
			emulator.add_listener('screen-set-size', (dims: [number, number, number]) => {
				graphical = dims[2] !== 0;
				// A mode change resizes the screen, so refit immediately rather than
				// leaving it wrong until the next sampling tick.
				requestAnimationFrame(fitScreen);
			});

			if (terminalMode && xterm) {
				// The addon has to attach after v86 has constructed the Terminal.
				const FitAddon = xterm[1].FitAddon;
				requestAnimationFrame(() => {
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const term = (emulator as any)?.serial_adapter?.term;
					if (!term) return;
					fitAddon = new FitAddon();
					term.loadAddon(fitAddon);
					fitAddon.fit();
				});
			}

			ticker = setInterval(() => {
				sample();
				fitScreen();
			}, 1000);
			// No physical keyboard on a touch device, and a phone IME cannot
			// usefully drive a terminal, so offer the on-screen one straight away.
			if (matchMedia('(pointer: coarse)').matches) showKeyboard = true;
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
		fitAddon = null;
		restoreFetch?.();
		restoreFetch = null;
		phase = 'idle';
		status = '';
		bootLineSent = false;
		suspendNavHotkeys.set(false);
		releaseKeyboard();
		screenScale = 1;
		uptime = 0;
		mips = null;
		graphical = false;
	}

	function stop() {
		shutdown();
		playSound('click');
	}

	/**
	 * v86 draws text mode at a fixed character size — an 80x25 console is about
	 * 730x390 px no matter how big the panel is. Scaling the whole thing to the
	 * available box keeps the emulator's own font metrics untouched while filling
	 * the space: down on a phone, and up on a desktop, where it previously sat in
	 * the top-left corner surrounded by black.
	 */
	function fitScreen() {
		fitAddon?.fit?.();
		if (settings.display === 'terminal') return;
		if (!screenEl || !screenWrap) return;
		const availableW = screenWrap.clientWidth - 8;
		const availableH = screenWrap.clientHeight - 8;
		// Measure unscaled, or the transform feeds back into its own input.
		const previous = screenEl.style.transform;
		screenEl.style.transform = 'none';
		const naturalW = screenEl.scrollWidth;
		const naturalH = screenEl.scrollHeight;
		screenEl.style.transform = previous;
		if (!availableW || !availableH || !naturalW || !naturalH) return;
		// Capped so a tiny early-boot screen does not blow up into a blurry wall.
		screenScale = Math.max(0.25, Math.min(3, availableW / naturalW, availableH / naturalH));
	}

	/**
	 * A full restart, not Ctrl+Alt+Del. The kernel and initramfs are handed to the
	 * emulator at construction rather than loaded by a bootloader, so a
	 * guest-initiated reboot leaves SeaBIOS looking for a boot sector that was
	 * never written — it hangs there. Tearing the machine down and building it
	 * again is the only reset that works with direct kernel boot.
	 */
	async function restart() {
		playSound('click');
		shutdown();
		await boot();
	}

	/**
	 * v86 listens for keys on the document, not on its container, so a keystroke
	 * reaches the guest whether or not the screen has focus — tying the site's
	 * hotkey suspension to focus meant "t" still flipped the theme mid-shell.
	 * Suspension follows the machine being powered on instead. Ctrl+0-5 ignores
	 * the flag, so there is always a way out.
	 *
	 * Focus still matters for the ring and the click-to-type hint, which is why
	 * the wrapper carries a tabindex.
	 */
	function captureKeyboard() {
		if (phase !== 'running') return;
		keyboardCaptured = true;
		screenWrap?.focus();
	}

	function releaseKeyboard() {
		keyboardCaptured = false;
	}

	function onScreenKeydown(e: KeyboardEvent) {
		// Escape is the way back out; everything else belongs to the guest.
		if (e.key === 'Escape') {
			e.preventDefault();
			screenWrap?.blur();
		}
	}

	onMount(() => {
		loadSettings();
		const onResize = () => fitScreen();
		window.addEventListener('resize', onResize);
		return () => {
			window.removeEventListener('resize', onResize);
			shutdown();
			suspendNavHotkeys.set(false);
		};
	});

	$effect(() => {
		// Touch every field so any change is persisted.
		JSON.stringify(settings);
		saveSettings();
	});

	/** m:ss past a minute, so a long session does not read as a four-digit blob. */
	function formatUptime(seconds: number): string {
		if (seconds < 60) return `${seconds.toFixed(0)}s`;
		const m = Math.floor(seconds / 60);
		return `${m}m ${String(Math.floor(seconds % 60)).padStart(2, '0')}s`;
	}

	/** The real path a guest disk read takes — every hop here exists in the repo. */
	const TOPOLOGY = `flowchart TB
    subgraph tab["Your browser tab"]
        direction LR
        G["Alpine Linux<br/>32-bit x86"] --- V["v86<br/>x86-to-wasm JIT"]
    end
    V -->|"kernel + initrd<br/>loaded whole"| W["Worker<br/>/vm/img"]
    V -->|"disk: HTTP Range<br/>1 MiB chunks"| W
    W --> C{{"Edge cache"}}
    C -->|"miss"| R[("R2<br/>vm/*")]
    B["CI<br/>build-vm-image"] -->|"apk + mke2fs -d"| R`;

	let fetchedBytes = $derived(chunksFetched * CHUNK);
	let imageMiB = $derived(imageSize === null ? null : imageSize / 1024 / 1024);

	let FACTS = $derived<{ label: string; value: string; title?: string }[]>([
		{ label: 'EMULATOR', value: 'v86 — x86-to-wasm JIT, BSD-2', title: 'copy/v86: a 32-bit x86 PC emulator that JIT-compiles guest code to WebAssembly' },
		{ label: 'GUEST', value: 'Alpine Linux 3.24.1, x86 (32-bit)', title: 'Alpine still ships 32-bit x86 as a release architecture, which is why it works here where Debian and Arch no longer would' },
		{ label: 'CPU', value: 'single core, ~Pentium 4 class, no x86-64' },
		{ label: 'RAM', value: `${settings.memoryMb} MB guest / ${settings.vgaMemoryMb} MB VGA` },
		{
			label: 'DISPLAY',
			value: settings.display === 'terminal' ? 'serial via xterm.js' : 'emulated VGA',
			title: 'The serial terminal reports the mouse and resizes with the panel; the VGA text console can do neither'
		},
		{ label: 'DISK', value: 'ext4 image, streamed in 1 MiB chunks' },
		{
			label: 'NETWORK',
			value: settings.network ? 'via the relay, allowlisted' : 'off',
			title: "v86's own gateway answers ARP, DHCP and ping and resolves names over DoH; the TCP streams it produces are translated to OmniProxy at /net/wisp, where the destination allowlist is enforced"
		},
		{ label: 'STATUS', value: 'boots to an Alpine login' }
	]);
</script>

<div class="space-y-3 flex-1 min-h-0 flex flex-col">
	<div class="flex flex-wrap items-start justify-between gap-2 border-b border-white/10 pb-2 shrink-0">
		<pre class="text-[6px] sm:text-[9px] md:text-[11px] font-black tracking-tight text-[#d19a66] leading-tight overflow-x-auto select-none">{`██╗  ██╗ █████╗  ██████╗ ███████╗██╗███╗   ███╗
╚██╗██╔╝██╔══██╗██╔════╝ ██╔════╝██║████╗ ████║
 ╚███╔╝ ╚█████╔╝███████╗ ███████╗██║██╔████╔██║
 ██╔██╗ ██╔══██╗██╔═══██╗╚════██║██║██║╚██╔╝██║
██╔╝ ██╗╚█████╔╝╚██████╔╝███████║██║██║ ╚═╝ ██║
╚═╝  ╚═╝ ╚════╝  ╚═════╝ ╚══════╝╚═╝╚═╝     ╚═╝`}</pre>

		<div class="flex flex-wrap items-center gap-2">
			{#if phase === 'running'}
				<div class="flex items-center gap-2 mr-1">
					<span class="flex items-center gap-1.5 text-xs font-mono font-bold text-[#98c379]">
						<span class="w-1.5 h-1.5 rounded-full bg-[#98c379] animate-pulse"></span>
						RUNNING
					</span>
					<span class="px-1.5 py-0.5 rounded-xs bg-black/40 text-[11px] font-mono text-white/60" title="Time since the emulator started">
						{formatUptime(uptime)}
					</span>
					{#if mips !== null}
						<span
							class="px-1.5 py-0.5 rounded-xs bg-black/40 text-[11px] font-mono text-white/60"
							title="Instructions per second of wall clock. The emulated CPU is halted while a disk chunk is in flight, so this counts network waits as if they were slow execution — during boot it says more about I/O than about the JIT."
						>
							{mips.toFixed(2)} <span class="text-white/35">MIPS</span>
						</span>
					{/if}
				</div>
				<button
					onclick={() => (showKeyboard = !showKeyboard)}
					title="On-screen keyboard — sends scancodes directly, which also avoids the layout mismatch a non-US physical keyboard hits"
					class="px-2.5 py-1 border rounded-xs text-xs font-bold cursor-pointer transition-colors {showKeyboard
						? 'border-[#56b6c2] bg-[#56b6c2]/20 text-[#56b6c2]'
						: 'border-white/25 text-white/70 hover:bg-white/10'}"
				>
					⌨ KEYS
				</button>
				<button
					onclick={restart}
					title="Rebuild the machine from scratch. Not Ctrl+Alt+Del: the kernel is handed to the emulator directly rather than loaded from the disk, so a guest reboot would leave SeaBIOS with nothing to boot."
					class="px-2.5 py-1 border border-[#e5c07b]/50 text-[#e5c07b] rounded-xs text-xs font-bold cursor-pointer hover:bg-[#e5c07b]/20"
				>
					↻ RESTART
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
						<span class="text-[10px] font-mono font-bold text-white/45 uppercase w-[92px]">DISPLAY</span>
						{#each [['terminal', 'TERMINAL'], ['screen', 'VGA SCREEN']] as const as [value, label] (value)}
							<button
								onclick={() => (settings.display = value)}
								title={value === 'terminal'
									? "xterm.js on the guest's serial port — it reports the mouse, so tmux and ncurses apps can use one, and it resizes with the panel"
									: 'The emulated VGA adapter. Shows the graphical console, but a text console cannot report the mouse.'}
								class="px-2 py-0.5 border rounded-xs text-[11px] font-mono font-bold cursor-pointer transition-colors {settings.display === value
									? 'border-[#98c379] bg-[#98c379]/20 text-[#98c379]'
									: 'border-white/20 text-white/55 hover:border-white/50'}"
							>
								{label}
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
							<input type="checkbox" bind:checked={settings.network} class="accent-[#98c379]" />
							<span title="Attach a virtio NIC pointed at the same-origin relay. Reachable destinations are limited by an allowlist enforced at the edge.">NET</span>
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

			<div class="border border-[#98c379]/40 bg-[#98c379]/5 rounded-xs p-2.5 space-y-1.5">
				<div class="text-xs font-black font-mono text-[#98c379]">IT BOOTS — LOG IN AS root, NO PASSWORD</div>
				<p class="text-[11px] text-white/65 leading-relaxed">
					SeaBIOS posts, the kernel starts, the initramfs mounts the root filesystem off the
					emulated disk, OpenRC brings the system up and you get a login prompt on
					<span class="font-mono">krsz-vm</span>. There is no password — it is a throwaway
					machine with nothing listening. <span class="font-mono">apk</span> is installed but
					has no network yet, so it can only work offline for now.
				</p>
				<p class="text-[11px] text-white/45 leading-relaxed">
					Getting here took four separate fixes worth writing down: hardware autodetection had
					to go (it triple-faults the emulator), the SCSI disk driver and its dependencies had
					to be packed as whole directories rather than globs, the module had to be spelled
					<span class="font-mono">sd_mod</span> because busybox's modprobe does not translate
					<span class="font-mono">sd-mod</span>, and the image URLs needed a version — they are
					served immutable but CI reuses the same R2 keys, so the edge was still handing back
					the previous build.
				</p>
			</div>

			<div class="border border-white/15 bg-black/25 rounded-xs p-2.5 space-y-1.5">
				<div class="flex items-baseline justify-between gap-2">
					<span class="text-xs font-black font-mono text-[#d19a66]">HOW A DISK READ TRAVELS</span>
					<span class="text-[10px] font-mono text-white/35">every hop exists in the repo</span>
				</div>
				<MermaidDiagram chart={TOPOLOGY} accent="#d19a66" />
			</div>

			<div class="border border-white/15 bg-black/25 rounded-xs p-2.5 space-y-1">
				<div class="text-xs font-black font-mono text-white/60">WHAT ALREADY WORKS</div>
				<ul class="text-[11px] text-white/55 leading-relaxed list-disc pl-4 space-y-0.5">
					<li>The ISO is never downloaded whole: v86 reads 1 MiB chunks over HTTP Range as the guest touches them, through a proxy that caches each chunk at the edge.</li>
					<li>The kernel and initramfs are built in CI and loaded directly, with no bootloader, so the command line is set by the page rather than typed into a prompt.</li>
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

	<!-- v86 wants exactly this shape: a <div> it fills in text mode and a <canvas>
	     for graphics. The wrapper is focusable so releasing the keyboard works. -->
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
	<div
		bind:this={screenWrap}
		tabindex={phase === 'running' ? 0 : -1}
		role="application"
		aria-label="Emulated PC screen"
		onfocus={captureKeyboard}
		onblur={releaseKeyboard}
		onmousedown={captureKeyboard}
		onkeydown={onScreenKeydown}
		class="relative flex-1 min-h-0 border bg-black rounded-xs overflow-hidden outline-none transition-colors {phase ===
		'idle' || phase === 'error'
			? 'hidden'
			: keyboardCaptured
				? 'border-[#98c379]'
				: themeStyles.border}"
	>
		<!-- Absolutely centred so the scale factor cannot skew the layout: a
		     transform does not change the box the parent lays out. -->
		<div
			bind:this={termEl}
			class="absolute inset-0 p-1.5 {settings.display === 'terminal' ? '' : 'hidden'}"
		></div>

		<div
			bind:this={screenEl}
			class="absolute left-1/2 top-1/2 {settings.display === 'terminal' ? 'hidden' : ''}"
			style="transform: translate(-50%, -50%) scale({screenScale}); transform-origin: center center"
		>
			<!-- Line height has to exceed the font size or descenders are clipped:
			     v86 lays each text row out in exactly this box. -->
			<div style="white-space: pre; font: 15px/18px monospace; color: #d8dee9; padding: 6px;"></div>
			<canvas style="display: none"></canvas>
		</div>

		<!-- Only the VGA screen needs a capture affordance. xterm takes focus and
		     mouse events itself, and an overlay would swallow the very clicks that
		     terminal mode exists to deliver. -->
		{#if phase === 'running' && !keyboardCaptured && settings.display === 'screen'}
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				onclick={captureKeyboard}
				class="absolute inset-0 flex items-end justify-center pb-3 bg-black/25 cursor-pointer"
			>
				<span class="px-2.5 py-1 rounded-xs bg-black/85 border border-white/25 text-[11px] font-mono text-white/75">
					click to type into the machine — Esc gives the keyboard back
				</span>
			</div>
		{/if}
	</div>

	{#if showKeyboard && phase === 'running'}
		<div class="shrink-0">
			<VirtualKeyboard send={sendScancodes} onClose={() => (showKeyboard = false)} />
		</div>
	{/if}

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
