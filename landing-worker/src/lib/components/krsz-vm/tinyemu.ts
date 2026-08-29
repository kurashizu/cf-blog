/**
 * The riscv64 machine: TinyEMU compiled to WebAssembly, wired to a terminal.
 *
 * v86 is an IA-32 emulator and cannot be anything else, so a second
 * architecture means a second emulator with its own way of being talked to.
 * TinyEMU's is unusual: its JS half reaches for globals — `term`, and a few
 * hooks — at the moment it needs them, rather than taking them as arguments.
 * That contract is what this module owns, so nothing outside it has to know.
 *
 * What it does not have is a network. TinyEMU's ethernet is raw frames, and the
 * relay this site runs carries streams; bridging the two needs a TCP/IP stack
 * in the page, which v86 brings with it and this one has nowhere to borrow.
 */

/** Where the emulator and its machine description are served from. */
const EMULATOR_URL = '/vm/riscvemu64-wasm.js';
/**
 * The same emulator with TinyEMU's own diagnostics compiled in — exceptions,
 * MMU faults, invalid accesses. Loaded only with ?debug, because a machine that
 * runs while printing nothing cannot be diagnosed from outside.
 */
const DEBUG_EMULATOR_URL = '/vm/riscvemu64-debug.js';
/**
 * Absolute on purpose. TinyEMU decides between fetching and opening a local
 * file by whether the name looks like a URL, and a path does not: it took
 * "/vm/rv/krsz-rv.cfg" for a filename, tried to open it in a build that has no
 * filesystem, and aborted without a word. Everything the config names is
 * resolved against this, so they all become absolute with it.
 */
const CONFIG_PATH = '/vm/rv/krsz-rv.cfg';
/** ?probe boots the console test instead of the machine — see the rv route. */
const PROBE_CONFIG_PATH = '/vm/rv/probe.cfg';

/** Matches RV_MEMORY_MB in wrangler.toml; TinyEMU wants it in megabytes. */
const DEFAULT_MEMORY_MB = 256;

export interface RvTerminal {
	write(text: string): void;
	/** Columns and rows, in that order — TinyEMU asks as a pair. */
	getSize(): [number, number];
}

export interface RvMachine {
	/** Prints the CPU's program counter and privilege level to the console. */
	dumpState(): void;
	/** Send one byte of input to the guest's console. */
	sendChar(code: number): void;
	sendText(text: string): void;
	/** Tear the machine down. TinyEMU has no stop, so this drops it and reloads. */
	destroy(): void;
}

interface TinyEmuModule {
	ccall(
		name: string,
		returnType: string | null,
		argTypes: string[],
		args: (string | number | null)[]
	): unknown;
}

/**
 * TinyEMU's JS library calls `term.write` and `term.getSize` on the global
 * object, and its downloads report progress through `update_downloading`.
 * Setting them here keeps the contract in one place, and clearing them on
 * teardown means a stopped machine cannot write into a live terminal.
 */
function installGlobals(term: RvTerminal, onDownloading?: (active: boolean) => void) {
	const scope = window as unknown as Record<string, unknown>;
	scope.term = term;
	scope.update_downloading = (active: boolean) => onDownloading?.(active);
}

function clearGlobals() {
	const scope = window as unknown as Record<string, unknown>;
	delete scope.term;
	delete scope.update_downloading;
}

/**
 * The page's own query is passed through to the config, which is how a
 * diagnostic switch reaches a machine whose only other input is a console.
 */
function machineConfigUrl(): string {
	const params = new URLSearchParams(location.search);
	if (params.has('probe')) return new URL(PROBE_CONFIG_PATH, location.href).href;
	const query = params.has('shell') ? '?shell=1' : '';
	return new URL(CONFIG_PATH + query, location.href).href;
}

export async function startRiscv(options: {
	term: RvTerminal;
	memoryMb?: number;
	onDownloading?: (active: boolean) => void;
}): Promise<RvMachine> {
	installGlobals(options.term, options.onDownloading);

	// The emulator is a static asset rather than a bundled dependency: it is
	// built by CI from Bellard's source, not published anywhere to install from.
	const wanted = new URLSearchParams(location.search).has('debug')
		? DEBUG_EMULATOR_URL
		: EMULATOR_URL;
	const factory = (await import(/* @vite-ignore */ wanted)) as {
		default: (config?: Record<string, unknown>) => Promise<TinyEmuModule>;
	};

	// TinyEMU reports every failure through stdio and then exits, which without
	// somewhere to print lands in the page as a bare "Aborted()". These hand its
	// own words back.
	const module = await factory.default({
		print: (line: string) => console.log('[riscv64]', line),
		printErr: (line: string) => console.warn('[riscv64]', line)
	});

	// vm_start(config_url, ram_size_mb, cmdline, pwd, width, height, has_network).
	//
	// The size is in megabytes and it overrides the config rather than defaulting
	// to it — passing zero asserts inside the memory map.
	//
	// Width and height are zero on purpose, and this is the one argument worth
	// dwelling on: they describe a *graphical* framebuffer, and any non-zero pair
	// makes TinyEMU build a display instead of a console. Passing the terminal's
	// own size — the obvious thing to do — is why this machine printed nothing at
	// all, whichever firmware it booted: there was no console device for it to
	// print on, and the first character written to HTIF dereferenced it. The
	// terminal's size reaches the guest through console_get_size instead.
	//
	// A null cmdline leaves the config's alone, and there is no network.
	module.ccall(
		'vm_start',
		null,
		['string', 'number', 'string', 'string', 'number', 'number', 'number'],
		[machineConfigUrl(), options.memoryMb ?? DEFAULT_MEMORY_MB, null, null, 0, 0, 0]
	);

	const queue = (code: number) => module.ccall('console_queue_char', null, ['number'], [code]);

	return {
		dumpState() {
			for (const fn of ['vm_dump_state', 'vm_dump_loop']) {
				try {
					module.ccall(fn, null, [], []);
				} catch {
					/* a build without it */
				}
			}
		},
		sendChar: queue,
		sendText(text: string) {
			// One byte at a time, as bytes: the console is a byte stream and the
			// guest's terminal is what decides how to read them.
			for (const byte of new TextEncoder().encode(text)) queue(byte);
		},
		destroy() {
			// The run loop reschedules itself from inside the module, so a machine
			// that is merely dropped keeps running unseen. vm_stop is a flag this
			// build adds for exactly this — see scripts/build-tinyemu.sh.
			try {
				module.ccall('vm_stop', null, [], []);
			} catch {
				/* an older build without it — the globals still go */
			}
			clearGlobals();
		}
	};
}
