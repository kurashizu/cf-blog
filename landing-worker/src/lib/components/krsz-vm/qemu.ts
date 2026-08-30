/**
 * The QEMU machines: upstream QEMU compiled to WebAssembly, wired to a terminal.
 *
 * v86 is IA-32 and cannot be anything else. QEMU is the real emulator, brought
 * to the browser whole: the same x86-64 machine you would run on a desktop,
 * with QEMU's own device models behind it. What it asks for
 * in return is threads — the CPU runs on a worker sharing memory with the page,
 * which the browser allows only when the document is cross-origin isolated.
 *
 * The interesting part is the disk. QEMU opens its image as an ordinary file in
 * Emscripten's filesystem, and the upstream demos put it there with
 * file_packager: the whole image downloaded before the machine starts. That is
 * a gigabyte here, for a boot that reads perhaps sixty megabytes of it. So the
 * image is registered as a lazy file instead — a node whose reads are served,
 * a chunk at a time, by the same ranged route the other two machines stream
 * from, and whose writes are kept in memory rather than sent anywhere.
 */

import { openpty } from 'xterm-pty';
import type { Terminal } from '@xterm/xterm';
import { CHUNK, type OverlayBlocks } from './qemu-disk';
import { createLazyImage } from './qemu-disk';
import { QemuNet } from './qemu-net';
import { NET_HOST, installNetShim, sendToGuest } from './qemu-net-shim';

/** Where the built binaries are served from — see routes/vm/qemu. */
const BINARY_BASE = '/vm/qemu';

export type QemuArch = 'x86_64';

/**
 * QEMU does not speak to a terminal the way the other two machines do.
 *
 * v86 and TinyEMU hand the page bytes and take bytes back, so a write and an
 * onData were enough. QEMU was built against xterm-pty, which puts a real line
 * discipline between the two: it is what answers the guest's TCGETS, reports a
 * window size to TIOCGWINSZ, turns a typed ^C into SIGINT rather than a byte,
 * and echoes in canonical mode. So the view gives us its Terminal and the pty's
 * master half attaches to it as an addon.
 */

export interface QemuMachine {
	sendText(text: string): void;
	destroy(): void;
	/** The network gateway, when one is attached. Exposed for ?debug. */
	net?: unknown;
}

/**
 * Emscripten's module object. QEMU's glue reads `arguments` before main, takes
 * the pty's slave half from `pty`, and exposes FS because the build asks for it
 * in EXPORTED_RUNTIME_METHODS.
 */
interface EmscriptenModule {
	arguments?: string[];
	preRun?: ((built: EmscriptenModule) => void)[];
	print?: (line: string) => void;
	printErr?: (line: string) => void;
	locateFile?: (path: string) => string;
	mainScriptUrlOrBlob?: string;
	FS: {
		mkdir(path: string): void;
		writeFile(path: string, data: Uint8Array): void;
	};
	/** The pty's slave half. The glue reads this as `Module["pty"]`. */
	pty?: unknown;
	/** Emscripten's TTY, exported by the build so its poll can be replaced. */
	TTY?: {
		stream_ops: {
			poll: (stream: unknown, timeout: number) => number;
		};
	};
	_exit?: (code: number) => void;
}

export interface QemuOptions {
	arch: QemuArch;
	/** The view's xterm instance; the pty's master attaches to it. */
	term: Terminal;
	memoryMb: number;
	/** The kernel image, as a URL this page can range-request. */
	kernelUrl: string;
	/**
	 * The initramfs, which is not optional: Alpine's linux-virt builds the virtio
	 * PCI transport in but leaves virtio-blk and ext4 as modules, so without this
	 * the kernel finds the disk's PCI device and then waits forever for a
	 * /dev/vda nothing creates.
	 */
	initrdUrl: string;
	/** The root filesystem image, likewise. */
	rootfsUrl: string;
	kernelSize: number;
	rootfsSize: number;
	cmdline: string;
	/** Attach a NIC and the page-side gateway behind it. */
	network: boolean;
	onStatus?: (text: string) => void;
}

/**
 * The machine QEMU should build.
 *
 * `pc` rather than q35: it is the board upstream's own x86 examples use and the
 * one its BIOS blob is built for.
 */
function machineArgs(): string[] {
	return ['-machine', 'pc'];
}


/**
 * The console device: the 16550 every PC has, which `-nographic` points QEMU's
 * own stdio at, and which is what reaches the terminal.
 */
function consoleName(): string {
	return 'ttyS0';
}

/**
 * What it took to make these boot, so the next machine costs less.
 *
 * The terminal's poll was the expensive one. Emscripten's TTY poll blocks when
 * the terminal has nothing to say, with Atomics.wait, on whichever thread asked
 * -- and on the page's main thread that is a deadlock, because the notify it
 * waits for can only come from the timers of the thread it has just stopped.
 * From outside it looked like a machine frozen with the main thread pinned at
 * 98% in repeating one-second slices, from the moment the BIOS started and with
 * no disk attached at all. Upstream replaces that poll after init; so do we.
 *
 * x86 then needed three more things, none of them guessable: SeaBIOS wants
 * every ROM it opens present in the filesystem, not just the BIOS itself; no
 * -smp, because with it the board skips SeaBIOS and panics in setup_IO_APIC;
 * and noapic, because that IO-APIC cannot route the timer while the legacy PIC
 * can. acpi=off looks like the fix for the same panic and is not: it clears the
 * panic and takes SeaBIOS's HPET with it, and then the clock stops advancing.
 */
export async function startQemu(options: QemuOptions): Promise<QemuMachine> {
	if (!crossOriginIsolated) {
		throw new Error(
			'This page is not cross-origin isolated, so QEMU cannot start its CPU thread.'
		);
	}

	options.onStatus?.('loading QEMU');

	// The line discipline QEMU was built to talk to. The master half is an xterm
	// addon, the slave half is what the glue picks up as Module["pty"].
	const { master, slave } = openpty();
	options.term.loadAddon(master);

	const glueUrl = `${BINARY_BASE}/qemu-system-${options.arch}.js`;

	// The socket is intercepted here, on the page's own thread, and not in a
	// pthread as the first attempt assumed. __syscall_connect proxies to the
	// main thread -- so however QEMU's main is scheduled, the WebSocket for
	// `-netdev socket` is constructed in this scope, where the gateway already
	// is. Nothing has to be smuggled into a worker.
	const releaseShim = options.network ? installNetShim(globalThis, () => net) : null;

	const factory = (await import(/* @vite-ignore */ glueUrl)) as {
		default: (module: Partial<EmscriptenModule>) => Promise<EmscriptenModule>;
	};

	// Fetched before the module is built, because preRun runs synchronously and
	// the kernel has to be a file by the time QEMU looks for one.
	options.onStatus?.('fetching the kernel');
	const kernelResponse = await fetch(options.kernelUrl);
	if (!kernelResponse.ok) {
		throw new Error(`The kernel could not be fetched (${kernelResponse.status}).`);
	}
	const kernelBytes = new Uint8Array(await kernelResponse.arrayBuffer());

	const initrdResponse = await fetch(options.initrdUrl);
	if (!initrdResponse.ok) {
		throw new Error(`The initramfs could not be fetched (${initrdResponse.status}).`);
	}
	const initrdBytes = new Uint8Array(await initrdResponse.arrayBuffer());

	// x86 opens these by name once it is running, so they have to be in the
	// filesystem before main -- same reason as the kernel. The other boards read
	// none of them and pay nothing for this.
	const roms: [string, Uint8Array][] = [];
	{
		// Everything SeaBIOS may open, not just the BIOS itself: it initialises the
		// display next and looks for a VGA BIOS by more than one name, and the
		// option ROMs are what let it boot from a virtio disk.
		const wanted = [
			'bios-256k.bin',
			'vgabios.bin',
			'vgabios-stdvga.bin',
			'kvmvapic.bin',
			'linuxboot_dma.bin',
			'efi-virtio.rom'
		];
		await Promise.all(
			wanted.map(async (name) => {
				const response = await fetch(`${BINARY_BASE}/pc-bios-${name}`);
				if (!response.ok) throw new Error(`The ROM ${name} is missing (${response.status}).`);
				roms.push([name, new Uint8Array(await response.arrayBuffer())]);
			})
		);
	}

	const args = [
		'-nographic',
		'-m', `${options.memoryMb}M`,
		// tb-size is the translation cache in MB. The default is small enough that
		// a booting kernel evicts its own hot code; 500 is what upstream's own
		// examples use.
		// Single-threaded TCG even with several vCPUs, which is what upstream's own
		// examples do -- they carry the MTTCG line commented out. The vCPUs still
		// matter: with one, QEMU's CPU loop and the block layer's completions have
		// nowhere to run but each other's way.
		'-accel', 'tcg,tb-size=500',
		// No -smp: with it the machine skips SeaBIOS entirely and the kernel
		// panics in setup_IO_APIC, where one processor boots through the BIOS and
		// comes up. Upstream's x86 examples pass none either.

		...machineArgs(),
		// Where QEMU looks for the ROMs it opens at runtime: it cannot start
		// without its BIOS, and the display adapter runs a VGA BIOS of its own.
		'-L', '/krsz/pc-bios/',
		// The network, when it is on. `socket` is the only backend this build has
		// that can work here: libslirp is not compiled in, and every other one
		// wants a host API a tab does not have. What makes it usable is that
		// under Emscripten a TCP connection is a WebSocket -- so QEMU connects,
		// the shim intercepts, and the frames arrive in the page where the
		// gateway in qemu-net answers them. The host below is never resolved.
		...(options.network
			? [
					'-netdev', `socket,id=vmnic,connect=${NET_HOST}:443`,
					'-device', 'virtio-net-pci,netdev=vmnic'
				]
			: ['-nic', 'none']),
		// Spelled out as a drive plus a device rather than the `if=virtio`
		// shorthand, which is what upstream's own Alpine example does. The
		// shorthand asks QEMU to pick the transport, and on this board it picks
		// one the guest then waits on forever.
		// A drive plus a device, the way upstream's own Alpine example writes it.
		'-drive', 'id=rootfs,file=/krsz/rootfs.img,format=raw,if=none',
		'-device', 'virtio-blk-pci,drive=rootfs',
		'-kernel', '/krsz/kernel',
		'-initrd', '/krsz/initramfs',
		// `modules=` is not optional with Alpine's initramfs. Its init modprobes
		// exactly what this names (plus loop and squashfs) and nothing else, then
		// hands the root to nlplug-findfs -- which cannot identify a filesystem
		// whose driver was never loaded, and waits for a device that by then
		// already exists. Without it the boot stops on "Mounting root" having read
		// one sector, with the disk sitting right there in the kernel log.
		'-append',
		options.cmdline ||
			[
				`console=${consoleName()}`,
				'root=/dev/vda rw rootwait',
				'modules=virtio_blk,ext4',
				// noapic is what makes this board boot. Its IO-APIC cannot route the
				// timer -- left to try it, the kernel panics in setup_IO_APIC with
				// "IO-APIC + timer doesn't work" -- while the legacy PIC it falls
				// back to works, and SeaBIOS's ACPI tables hand it an HPET to keep
				// time with. acpi=off is the tempting fix and the wrong one: it
				// clears the panic and takes the HPET away with it, and the clock
				// stops advancing instead.
				'noapic'
			].join(' ')
	];

	// Reads are served from the network as QEMU asks for them; writes stay here.
	const overlay: OverlayBlocks = new Map();

	// The gateway the guest thinks it is talking to. It is built before the
	// module because printErr, which is how frames arrive, closes over it.
	const net = options.network
		? new QemuNet({
				send: sendToGuest,
				onStatus: (text) => options.onStatus?.(`network: ${text}`)
			})
		: null;


	const module = await factory.default({
		arguments: args,
		// The filesystem is built in preRun rather than after this promise
		// resolves, and that ordering is not a preference. QEMU's main is proxied
		// to a pthread and the glue starts it as soon as the runtime is up --
		// before the promise resolves -- so a disk set up out here would not exist
		// yet when QEMU opened its drive. preRun runs inside that initialisation,
		// ahead of main, which is where these belong.
		//
		// Holding main back with noInitialRun and starting it by hand is not an
		// option: this build does not export callMain, so calling it is a silent
		// no-op and the machine simply never runs.
		//
		// Emscripten hands each of these the module it is still building, which is
		// the only way to reach FS this early -- the promise that would return it
		// has not resolved yet.
		preRun: [
			(built: EmscriptenModule) => {
				built.FS.mkdir('/krsz');
				built.FS.writeFile('/krsz/kernel', kernelBytes);
				built.FS.writeFile('/krsz/initramfs', initrdBytes);
				if (roms.length) {
					built.FS.mkdir('/krsz/pc-bios');
					for (const [name, bytes] of roms) built.FS.writeFile(`/krsz/pc-bios/${name}`, bytes);
				}
				createLazyImage(built as unknown as Parameters<typeof createLazyImage>[0], {
					path: '/krsz/rootfs.img',
					url: options.rootfsUrl,
					size: options.rootfsSize,
					overlay
				});
			}
		],
		// The glue resolves its wasm and worker against its own location, which is
		// this route — but only if it is told where that is.
		locateFile: (path: string) => `${BINARY_BASE}/${path}`,
		mainScriptUrlOrBlob: new URL(glueUrl, location.href).href,
		// Everything the guest prints goes through the pty, not through here:
		// these two are QEMU's own diagnostics, which belong in the console.
		pty: slave,
		print: (line: string) => console.log('[qemu]', line),
		printErr: (line: string) => console.warn('[qemu]', line)
	});

	// Emscripten's own poll blocks when the terminal has nothing to say, and it
	// blocks with Atomics.wait -- on whichever thread asked. Run on the page's
	// main thread that is a deadlock: the notify it is waiting for can only be
	// delivered by the timers and event handlers of the very thread it has
	// stopped. What it looked like from outside was a machine frozen with the
	// main thread pinned at 98%, in repeating one-second slices.
	//
	// Answering "not readable" without waiting is what upstream's own examples
	// do, and it is the difference between a QEMU that boots and one that does
	// not.
	const tty = module.TTY;
	if (tty) {
		const oldPoll = tty.stream_ops.poll;
		tty.stream_ops.poll = function (this: unknown, stream: unknown, timeout: number) {
			if (!slave.readable) {
				return (slave.readable ? 1 : 0) | (slave.writable ? 4 : 0);
			}
			return oldPoll.call(this, stream, timeout);
		};
	}

	// By the time this resolves QEMU is already running: the glue called main
	// itself, with the arguments above, once preRun had put the disk in place.
	options.onStatus?.('booting');

	return {
		// The gateway, for ?debug: whether a frame ever reached the page, and what
		// the guest's connections are doing, is not visible from anywhere else.
		net,
		sendText(text: string) {
			slave.write(text);
		},
		destroy() {
			net?.destroy();
			releaseShim?.();
			// QEMU has no way back out of main under Asyncify, so the machine ends
			// with the page. The caller reloads.
			try {
				module._exit?.(0);
			} catch {
				/* exiting is how it reports having exited */
			}
		}
	};
}


export { CHUNK };
