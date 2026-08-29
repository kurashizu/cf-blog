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

import { CHUNK, type OverlayBlocks } from './qemu-disk';
import { createLazyImage } from './qemu-disk';

/** Where the built binaries are served from — see routes/vm/qemu. */
const BINARY_BASE = '/vm/qemu';

export type QemuArch = 'aarch64' | 'riscv64' | 'x86_64';

export interface QemuTerminal {
	write(text: string): void;
	getSize(): [number, number];
	/** Called with each byte the guest should receive; the view owns input. */
	onInput(handler: (data: string) => void): void;
}

export interface QemuMachine {
	sendText(text: string): void;
	destroy(): void;
}

/**
 * Emscripten's module object. QEMU's glue reads `arguments` before main, and
 * exposes FS and TTY because the build asks for them in EXPORTED_RUNTIME_METHODS.
 */
interface EmscriptenModule {
	arguments?: string[];
	print?: (line: string) => void;
	printErr?: (line: string) => void;
	locateFile?: (path: string) => string;
	mainScriptUrlOrBlob?: string;
	FS: {
		mkdir(path: string): void;
		writeFile(path: string, data: Uint8Array): void;
	};
	TTY: unknown;
	pty?: unknown;
	callMain?: (args: string[]) => void;
	_exit?: (code: number) => void;
}

export interface QemuOptions {
	arch: QemuArch;
	term: QemuTerminal;
	memoryMb: number;
	/** Cores. QEMU's multi-threaded TCG needs `thread=multi` to use them. */
	smp: number;
	/** The kernel image, as a URL this page can range-request. */
	kernelUrl: string;
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

	const glueUrl = `${BINARY_BASE}/qemu-system-${options.arch}.js`;
	const factory = (await import(/* @vite-ignore */ glueUrl)) as {
		default: (module: Partial<EmscriptenModule>) => Promise<EmscriptenModule>;
	};

	const args = [
		'-nographic',
		'-m', `${options.memoryMb}M`,
		// tb-size is the translation cache in MB. The default is small enough that
		// a booting kernel evicts its own hot code; 500 is what upstream's own
		// examples use.
		'-accel', options.smp > 1 ? 'tcg,tb-size=500,thread=multi' : 'tcg,tb-size=500',
		...(options.smp > 1 ? ['-smp', `${options.smp}`] : []),
		...machineArgs(options.arch),
		// No network yet: QEMU's user-mode stack needs a host socket API that the
		// browser does not have, and the relay this site runs carries streams
		// rather than frames.
		'-nic', 'none',
		'-drive', 'if=virtio,format=raw,file=/krsz/rootfs.img',
		'-kernel', '/krsz/kernel',
		'-append', options.cmdline || `console=${consoleName(options.arch)} root=/dev/vda rw rootwait`
	];

	// Reads are served from the network as QEMU asks for them; writes stay here.
	const overlay: OverlayBlocks = new Map();

	const module = await factory.default({
		arguments: args,
		// The glue resolves its wasm and worker against its own location, which is
		// this route — but only if it is told where that is.
		locateFile: (path: string) => `${BINARY_BASE}/${path}`,
		mainScriptUrlOrBlob: new URL(glueUrl, location.href).href,
		print: (line: string) => options.term.write(line + '\r\n'),
		printErr: (line: string) => console.warn(`[qemu/${options.arch}]`, line)
	});

	options.onStatus?.('preparing the disk');

	// QEMU opens both of these as plain files. The kernel is small enough to
	// fetch whole; the root filesystem is not, so it is registered as a node
	// whose reads are fetched a chunk at a time and whose writes stay in memory.
	module.FS.mkdir('/krsz');
	const kernel = await fetch(options.kernelUrl);
	if (!kernel.ok) throw new Error(`The kernel could not be fetched (${kernel.status}).`);
	module.FS.writeFile('/krsz/kernel', new Uint8Array(await kernel.arrayBuffer()));

	createLazyImage(module as unknown as Parameters<typeof createLazyImage>[0], {
		path: '/krsz/rootfs.img',
		url: options.rootfsUrl,
		size: options.rootfsSize,
		overlay
	});

	options.onStatus?.('booting');

	// Everything the machine says arrives through print/printErr above; what the
	// user types goes back through QEMU's stdin.
	options.term.onInput((data) => {
		for (const byte of new TextEncoder().encode(data)) queueInput(module, byte);
	});

	// callMain is what actually starts QEMU. The glue would have run it itself,
	// but only after the filesystem was set up — which is what we just did.
	module.callMain?.(args);

	return {
		sendText(text: string) {
			for (const byte of new TextEncoder().encode(text)) queueInput(module, byte);
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

/** Emscripten's TTY takes input through the device's own queue. */
function queueInput(module: EmscriptenModule, byte: number) {
	const tty = module.TTY as { stream_ops?: unknown; ttys?: { input: number[] }[] } | undefined;
	tty?.ttys?.[0]?.input.push(byte);
}

export { CHUNK };
