<script lang="ts">
	import { onMount } from 'svelte';
	import { playSound } from '../../sound';
	import { theme, THEME_STYLES } from '../../stores/theme';
	import {
		clearOverlay,
		findDiskBuffer,
		loadOverlay,
		overlayStats,
		saveOverlay,
		storedOverlaySize,
		type DiskBuffer,
		type OverlayStats
	} from './disk-overlay';
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
		 * Keep the guest's writes in the browser's origin-private filesystem, so a
		 * machine picks up where it was left rather than starting from the image
		 * every time. See disk-overlay.ts for what is and is not stored.
		 */
		persistDisk: boolean;
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

	const SETTINGS_VERSION = 7;

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
		persistDisk: true
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
	let diskBuffer: DiskBuffer | null = null;
	let overlay = $state<OverlayStats>({ blocks: 0, bytes: 0 });
	let overlayStored = $state(0);
	let overlayNote = $state('');
	let overlaySaver: ReturnType<typeof setInterval> | null = null;
	/** Which image the overlay in memory belongs to, for saving and for wiping. */
	let overlayKey: { name: string; version: string } | null = null;
	/**
	 * Whether the click-to-type hint has served its purpose. It used to follow
	 * focus, which meant it came back every time the screen lost it — including
	 * to the emulator's own pointer lock — and then sat over the machine
	 * swallowing the clicks it was asking for.
	 */
	let screenHinted = $state(false);
	/**
	 * Which adapter is on screen. The guest drives this: v86 reports a graphical
	 * mode the moment X takes the display, and a text mode when it hands it back,
	 * so a shell is watched through the serial terminal — which resizes with the
	 * panel and reports the mouse — and X through the VGA screen. The override is
	 * there because a guest that fails to bring X up would otherwise leave the
	 * viewer looking at a blank screen with no way back to the console.
	 */
	let viewMode = $state<'auto' | 'terminal' | 'screen'>('auto');
	let view = $derived<'terminal' | 'screen'>(
		viewMode === 'auto' ? (graphical ? 'screen' : 'terminal') : viewMode
	);
	const VIEW_LABEL = { auto: 'VIEW AUTO', terminal: 'VIEW TERM', screen: 'VIEW VGA' } as const;
	function cycleView() {
		viewMode = viewMode === 'auto' ? 'terminal' : viewMode === 'terminal' ? 'screen' : 'auto';
		playSound('click');
		requestAnimationFrame(fitScreen);
	}

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
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let term: any = null;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let FitAddonCtor: any = null;

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
	 * so the URL carries a version — otherwise the edge keeps handing back the
	 * previous build until the cache expires a year from now. The version comes
	 * from the server rather than the size, because a rebuilt image is usually
	 * exactly the same size as the one it replaces.
	 */
	function imageUrl(name: string, version: string | number): string {
		return `/vm/img/${name}?v=${version}`;
	}

	async function imageInfo(name: string): Promise<{ size: number; version?: string } | null> {
		try {
			const res = await fetch(`/vm/img/${name}?info`);
			return res.ok ? ((await res.json()) as { size: number; version?: string }) : null;
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
		screenHinted = false;
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
			const xterm = await Promise.all([
				import('@xterm/xterm'),
				import('@xterm/addon-fit'),
				import('@xterm/xterm/css/xterm.css')
			]);
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
				// Both, always. The guest talks to a serial line and to a VGA adapter at
				// the same time, and which of the two is worth looking at is a property
				// of what the guest is doing, not a setting: a shell belongs in the
				// terminal, and X has nowhere to draw but the screen.
				serial_console: {
					type: 'xtermjs' as const,
					xterm_lib: xterm[0].Terminal,
					container: termEl
				},
				screen_container: screenEl,
				bios: { url: '/vm/seabios.bin' },
				vga_bios: { url: '/vm/vgabios.bin' },
				...(mode === 'kernel'
					? {
							// Loading the kernel and initrd directly skips the bootloader
							// entirely, which is what makes the cmdline ours to set.
							bzimage: { url: imageUrl('vmlinuz', kernel?.version ?? kernel?.size ?? 0) },
							initrd: { url: imageUrl('initramfs', initramfs?.version ?? initramfs?.size ?? 0) },
							cmdline: settings.cmdline,
							hda: { url: imageUrl('rootfs', meta.version ?? meta.size), ...streamed }
						}
					: {
							cdrom: { url: imageUrl(IMAGE, meta.version ?? meta.size), ...streamed },
							boot_order: 0x123 // CD, then hard disk, then floppy
						}),
				// Held back so a saved overlay can be replayed into the disk before the
				// guest reads a single block of it; run() below starts the machine.
				autostart: false,
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

			emulator.add_listener('emulator-loaded', () => {
				void startMachine(mode === 'kernel' ? 'rootfs' : IMAGE, String(meta.version ?? meta.size));
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

			{
				// The addon can only attach once v86 has constructed the Terminal, and
				// when that happens is not ours to know — fitTerminal attaches it on
				// whichever call first finds one, and the sampling tick keeps calling.
				// Hanging it off a single animation frame meant a lost race left the
				// terminal at its default 80x24 for the rest of the session.
				FitAddonCtor = xterm[1].FitAddon;
				requestAnimationFrame(fitTerminal);
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

	/**
	 * Replays the saved overlay, then starts the machine. Both halves are here
	 * rather than in boot() because the disk buffer only exists once v86 has
	 * finished loading, and the guest must not execute before the replay: a block
	 * read early would be the image's version of a filesystem the rest of the
	 * overlay assumes has already moved on.
	 */
	async function startMachine(name: string, version: string) {
		diskBuffer = findDiskBuffer(emulator);
		overlayKey = { name, version };
		overlayNote = '';
		if (diskBuffer && settings.persistDisk) {
			status = 'restoring saved disk…';
			try {
				const restored = await loadOverlay(name, version, diskBuffer);
				if (restored) {
					overlay = restored;
					overlayNote = `restored ${formatBytes(restored.bytes)}`;
				} else {
					// Either nothing was saved, or what was saved belongs to a different
					// build of the image and replaying it would corrupt this one.
					await clearOverlay(name);
				}
			} catch {
				overlayNote = 'saved disk could not be read';
			}
			overlaySaver = setInterval(() => void persistOverlay(), 20000);
		} else if (!diskBuffer) {
			// Worth saying out loud rather than silently not persisting: it means
			// this build of v86 keeps its disk somewhere the search did not reach.
			overlayNote = 'no writable disk found — changes stay in memory';
		}
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(emulator as any)?.run?.();
	}

	async function persistOverlay() {
		if (!diskBuffer || !overlayKey || !settings.persistDisk) return;
		const { name, version } = overlayKey;
		const pending = overlayStats(diskBuffer);
		if (pending.blocks === 0) return;
		const written = await saveOverlay(name, version, diskBuffer);
		if (written) {
			overlay = written;
			overlayStored = written.bytes;
			overlayNote = '';
		} else {
			overlayNote = 'too large to save — wipe it or turn persistence off';
		}
	}

	async function wipeOverlay() {
		playSound('click');
		await clearOverlay(overlayKey?.name ?? 'rootfs');
		overlayStored = 0;
		overlayNote = phase === 'running' ? 'wiped — this session is still running on its changes' : 'wiped';
	}

	function formatBytes(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
		return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
	}

	function shutdown() {
		if (ticker) clearInterval(ticker);
		ticker = null;
		if (overlaySaver) clearInterval(overlaySaver);
		overlaySaver = null;
		diskBuffer = null;
		try {
			emulator?.destroy?.();
		} catch {
			/* already torn down */
		}
		emulator = null;
		fitAddon = null;
		term = null;
		FitAddonCtor = null;
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

	async function stop() {
		playSound('click');
		status = 'saving disk…';
		await persistOverlay();
		shutdown();
	}

	/**
	 * v86 draws text mode at a fixed character size — an 80x25 console is about
	 * 730x390 px no matter how big the panel is. Scaling the whole thing to the
	 * available box keeps the emulator's own font metrics untouched while filling
	 * the space: down on a phone, and up on a desktop, where it previously sat in
	 * the top-left corner surrounded by black.
	 */
	/**
	 * Columns are free — the panel is 1300 px wide on a desktop — but a shell only
	 * writes 70-odd characters, so leaving the font at its default fills a third
	 * of the box with tiny text and two thirds with nothing. The size is chosen to
	 * land near TARGET_COLS instead, which is wide enough for tmux and vim and
	 * large enough to read. The guest picks the new width up from `resize`.
	 */
	const TARGET_COLS = 100;
	/** Past this the console reads as a slide, not a terminal. */
	const MAX_FONT_PX = 17;

	function fitTerminal() {
		if (!termEl || !FitAddonCtor) return;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		term ??= (emulator as any)?.serial_adapter?.term ?? null;
		if (!term) return;
		if (!fitAddon) {
			fitAddon = new FitAddonCtor();
			term.loadAddon(fitAddon);
		}

		fitAddon.fit();
		// Derive the next size from the columns this one produced instead of
		// guessing the font's advance — whichever monospace the browser picks,
		// two passes land on the target.
		const cols = term.cols ?? 0;
		const current = term.options.fontSize ?? 15;
		if (!cols || Math.abs(cols - TARGET_COLS) <= 4) return;
		const next = Math.max(12, Math.min(MAX_FONT_PX, Math.round((current * cols) / TARGET_COLS)));
		if (next === current) return;
		term.options.fontSize = next;
		// xterm measures its cell after the font has landed, so fitting in this
		// frame sizes the grid to the old metrics — one row too many, the last of
		// them cut off by the bottom edge.
		requestAnimationFrame(() => fitAddon?.fit?.());
	}

	function fitScreen() {
		fitTerminal();
		if (view === 'terminal') return;
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
		await persistOverlay();
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
		// xterm reads from a hidden textarea it focuses on mousedown. Pulling focus
		// up to the wrapper here left that textarea blurred, so the terminal took
		// no typing at all — the VGA screen is the only mode that wants the focus.
		if (view === 'terminal') return;
		screenHinted = true;
		screenWrap?.focus();
		lockPointer();
	}

	function releaseKeyboard() {
		keyboardCaptured = false;
	}

	/**
	 * The emulated PS/2 mouse reports movement, not position, so it can only
	 * follow a pointer the page has locked — without a lock X sees the buttons and
	 * no motion at all. `unadjustedMovement` asks for the raw deltas: the system's
	 * pointer acceleration is meant for a cursor the guest cannot see, and applied
	 * to a drag it reads as the pointer suddenly bolting.
	 */
	function lockPointer() {
		const target = screenEl as (HTMLElement & { requestPointerLock?: (o?: object) => unknown }) | null;
		try {
			const pending = target?.requestPointerLock?.({ unadjustedMovement: true });
			// Chrome rejects the promise when it cannot honour the option; every
			// other engine returns undefined and has already locked.
			(pending as Promise<void> | undefined)?.catch?.(() => target?.requestPointerLock?.());
		} catch {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			(emulator as any)?.lock_mouse?.();
		}
	}

	/**
	 * Right-click belongs to the machine while it is running: tmux, ncurses menus
	 * and anything under openbox all use it, and the browser's own menu would take
	 * it first. Only while running, so the panel behaves normally when idle.
	 */
	function onScreenContextMenu(e: MouseEvent) {
		if (phase === 'running') e.preventDefault();
	}

	/** Escapes closer together than this are a deliberate "let me out". */
	const DOUBLE_ESC_MS = 700;
	let lastEscape = 0;

	function onScreenKeydown(e: KeyboardEvent) {
		// Only the VGA screen holds the keyboard hostage, so only it needs a way
		// out. In terminal mode Escape is the guest's — vim and tmux need it.
		if (view === 'terminal') return;
		if (e.key !== 'Escape') return;
		// So does the guest on this side, though: a single Escape belongs to
		// whatever is running under X. Two in quick succession mean the viewer,
		// not the guest, and that is what hands the keyboard back.
		const now = e.timeStamp;
		if (now - lastEscape < DOUBLE_ESC_MS) {
			lastEscape = 0;
			e.preventDefault();
			document.exitPointerLock?.();
			screenWrap?.blur();
			return;
		}
		lastEscape = now;
	}

	onMount(() => {
		loadSettings();
		void storedOverlaySize('rootfs').then((size) => (overlayStored = size));
		const onResize = () => fitScreen();
		window.addEventListener('resize', onResize);
		// A closed tab gives no chance to save afterwards, and this is the last
		// event that reliably fires on mobile.
		const onHide = () => void persistOverlay();
		window.addEventListener('pagehide', onHide);
		return () => {
			window.removeEventListener('resize', onResize);
			window.removeEventListener('pagehide', onHide);
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
			value: view === 'terminal' ? 'serial console, via xterm.js' : 'emulated VGA, graphical',
			title: 'Both run at once and the view follows the guest: the serial terminal while it is a shell, because that one resizes with the panel and reports the mouse, and the VGA screen as soon as something takes the display graphically'
		},
		{
			label: 'DISK',
			value: settings.persistDisk
				? `ext4, streamed in 1 MiB chunks · ${overlay.blocks ? formatBytes(overlay.bytes) + ' changed' : 'unchanged'}`
				: 'ext4 image, streamed in 1 MiB chunks',
			title: settings.persistDisk
				? "The image is read-only and shared; everything the guest writes is kept separately, in this browser's origin-private filesystem, and replayed over the image on the next boot"
				: 'The image is read-only and shared, and the guest\'s writes live in memory until the tab closes'
		},
		{
			label: 'NETWORK',
			value: settings.network ? 'via the relay, any host' : 'off',
			title: "v86's own gateway answers ARP, DHCP and ping and resolves names over DoH; the TCP streams it produces are translated to OmniProxy at /net/wisp. Names are policed at the resolver and ports at the socket, because the guest resolves for itself and connects to an address"
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
					onclick={cycleView}
					title="Which of the machine's two outputs is shown. On AUTO it follows the guest: the serial terminal while it is a shell, the VGA screen once something takes the display graphically."
					class="px-2.5 py-1 border rounded-xs text-xs font-bold cursor-pointer transition-colors {viewMode ===
					'auto'
						? 'border-white/25 text-white/70 hover:bg-white/10'
						: 'border-[#c678dd] bg-[#c678dd]/20 text-[#c678dd]'}"
				>
					{VIEW_LABEL[viewMode]}
				</button>
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
						<span class="text-[10px] font-mono font-bold text-white/45 uppercase w-[92px]">DISK</span>
						<button
							onclick={() => (settings.persistDisk = !settings.persistDisk)}
							title="Keep what the guest writes in this browser's origin-private filesystem and replay it on the next boot. The image itself stays read-only and shared; only the difference is stored, and only in this browser."
							class="px-2 py-0.5 border rounded-xs text-[11px] font-mono font-bold cursor-pointer transition-colors {settings.persistDisk
								? 'border-[#98c379] bg-[#98c379]/20 text-[#98c379]'
								: 'border-white/20 text-white/55 hover:border-white/50'}"
						>
							PERSIST: {settings.persistDisk ? 'ON' : 'OFF'}
						</button>
						<button
							onclick={wipeOverlay}
							title="Delete the saved changes. The next boot starts from the image exactly as built."
							class="px-2 py-0.5 border border-[#e06c75]/50 text-[#e06c75] rounded-xs text-[11px] font-mono font-bold cursor-pointer hover:bg-[#e06c75]/20"
						>
							WIPE
						</button>
						<span class="text-[10px] font-mono text-white/40">
							{overlayStored ? `${formatBytes(overlayStored)} saved` : 'nothing saved'}{overlayNote
								? ` · ${overlayNote}`
								: ''}
						</span>
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
	<!-- max-lg:min-h is for phones: there this panel is a scrolling column with no
	     height of its own, so flex-1 resolved to the content's height, and the
	     content is an absolutely positioned terminal — two pixels of machine. On a
	     desktop the row still shrinks freely. -->
	<div
		bind:this={screenWrap}
		tabindex={phase === 'running' && view !== 'terminal' ? 0 : -1}
		role="application"
		aria-label="Emulated PC screen"
		onfocus={captureKeyboard}
		onblur={releaseKeyboard}
		onmousedown={captureKeyboard}
		onkeydown={onScreenKeydown}
		oncontextmenu={onScreenContextMenu}
		class="relative flex-1 min-h-0 max-lg:min-h-[60vh] border bg-black rounded-xs overflow-hidden outline-none transition-colors {phase ===
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
			class="absolute inset-0 p-3 {view === 'terminal' ? '' : 'hidden'}"
		></div>

		<div
			bind:this={screenEl}
			class="absolute left-1/2 top-1/2 {view === 'terminal' ? 'hidden' : ''}"
			style="width: max-content; transform: translate(-50%, -50%) scale({screenScale}); transform-origin: center center"
		>
			<!-- Line height has to exceed the font size or descenders are clipped:
			     v86 lays each text row out in exactly this box. -->
			<div style="white-space: pre; font: 15px/18px monospace; color: #d8dee9; padding: 6px;"></div>
			<!-- The canvas holds exactly as many pixels as the guest is drawing, and
			     the panel is bigger than that, so something has to invent the rest.
			     Nearest-neighbour keeps a pixel a pixel instead of smearing it. -->
			<canvas style="display: none; image-rendering: pixelated"></canvas>
		</div>

		<!-- Only the VGA screen needs a capture affordance. xterm takes focus and
		     mouse events itself, and an overlay would swallow the very clicks that
		     terminal mode exists to deliver. -->
		{#if phase === 'running' && !screenHinted && view === 'screen'}
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				onclick={captureKeyboard}
				class="absolute inset-0 flex items-end justify-center pb-3 bg-black/25 cursor-pointer"
			>
				<span class="px-2.5 py-1 rounded-xs bg-black/85 border border-white/25 text-[11px] font-mono text-white/75">
					click to type into the machine — Esc twice gives the keyboard back
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
