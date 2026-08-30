/**
 * The QEMU machines: upstream QEMU compiled to WebAssembly, wired to a terminal.
 *
 * v86 is IA-32 and TinyEMU is rv64, each with its own emulator and its own way
 * of being talked to. QEMU replaces both with one codebase that speaks x86-64,
 * arm64 and riscv64, and brings QEMU's device models with it. What it asks for
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

/** Where the built binaries are served from — see routes/vm/qemu. */
const BINARY_BASE = '/vm/qemu';

export type QemuArch = 'aarch64' | 'riscv64' | 'x86_64';

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
	_exit?: (code: number) => void;
}

export interface QemuOptions {
	arch: QemuArch;
	/** The view's xterm instance; the pty's master attaches to it. */
	term: Terminal;
	memoryMb: number;
	/** Cores. QEMU's multi-threaded TCG needs `thread=multi` to use them. */
	smp: number;
	/** The kernel image, as a URL this page can range-request. */
	kernelUrl: string;
	/**
	 * The initramfs. Not optional on arm64: Alpine's linux-virt builds the
	 * virtio PCI transport in but leaves virtio-blk and ext4 as modules, so
	 * without this the kernel finds the disk's PCI device and then waits forever
	 * for a /dev/vda nothing creates.
	 */
	initrdUrl: string;
	/** The root filesystem image, likewise. */
	rootfsUrl: string;
	kernelSize: number;
	rootfsSize: number;
	cmdline: string;
	onStatus?: (text: string) => void;
}

/**
 * The machine QEMU should build, per architecture.
 *
 * `virt` on arm64 and riscv64 is the paravirtual board: no firmware to supply,
 * a virtio console, and a device tree QEMU generates. x86-64 needs its BIOS
 * blobs, which are not in this build, so it boots the kernel directly too.
 */
function machineArgs(arch: QemuArch): string[] {
	switch (arch) {
		case 'aarch64':
			// cortex-a72 is the newest core this build models completely; `virt`
			// defaults to cortex-a15, which is 32-bit and refuses an arm64 kernel.
			return ['-machine', 'virt', '-cpu', 'cortex-a72'];
		case 'riscv64':
			return ['-machine', 'virt'];
		case 'x86_64':
			return ['-machine', 'q35'];
	}
}

/**
 * The console device, which differs by board: arm64 and riscv64 `virt` put a
 * PL011/16550 at a fixed address that the kernel finds through the device tree,
 * and both call it ttyAMA0 or ttyS0 accordingly. `-nographic` points QEMU's own
 * stdio at it, which is what reaches the terminal.
 */
function consoleName(arch: QemuArch): string {
	return arch === 'aarch64' ? 'ttyAMA0' : 'ttyS0';
}

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
		...(options.smp > 1 ? ['-smp', `${options.smp}`] : []),
		...machineArgs(options.arch),
		// No network yet: QEMU's user-mode stack needs a host socket API that the
		// browser does not have, and the relay this site runs carries streams
		// rather than frames.
		'-nic', 'none',
		// Spelled out as a drive plus a device rather than the `if=virtio`
		// shorthand, which is what upstream's own Alpine example does. The
		// shorthand asks QEMU to pick the transport, and on this board it picks
		// one the guest then waits on forever.
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
			`console=${consoleName(options.arch)} root=/dev/vda rw rootwait modules=virtio_blk,ext4`
	];

	// Reads are served from the network as QEMU asks for them; writes stay here.
	const overlay: OverlayBlocks = new Map();

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
		print: (line: string) => console.log(`[qemu/${options.arch}]`, line),
		printErr: (line: string) => console.warn(`[qemu/${options.arch}]`, line)
	});

	// By the time this resolves QEMU is already running: the glue called main
	// itself, with the arguments above, once preRun had put the disk in place.
	options.onStatus?.('booting');

	return {
		sendText(text: string) {
			slave.write(text);
		},
		destroy() {
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
