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
 * Absolute on purpose. TinyEMU decides between fetching and opening a local
 * file by whether the name looks like a URL, and a path does not: it took
 * "/vm/rv/krsz-rv.cfg" for a filename, tried to open it in a build that has no
 * filesystem, and aborted without a word. Everything the config names is
 * resolved against this, so they all become absolute with it.
 */
const CONFIG_PATH = '/vm/rv/krsz-rv.cfg';

export interface RvTerminal {
	write(text: string): void;
	/** Columns and rows, in that order — TinyEMU asks as a pair. */
	getSize(): [number, number];
}

export interface RvMachine {
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

export async function startRiscv(options: {
	term: RvTerminal;
	memoryMb?: number;
	onDownloading?: (active: boolean) => void;
}): Promise<RvMachine> {
	installGlobals(options.term, options.onDownloading);

	// The emulator is a static asset rather than a bundled dependency: it is
	// built by CI from Bellard's source, not published anywhere to install from.
	const factory = (await import(/* @vite-ignore */ EMULATOR_URL)) as {
		default: (config?: Record<string, unknown>) => Promise<TinyEmuModule>;
	};

	// TinyEMU reports every failure through stdio and then exits, which without
	// somewhere to print lands in the page as a bare "Aborted()". These hand its
	// own words back.
	const module = await factory.default({
		print: (line: string) => console.log('[riscv64]', line),
		printErr: (line: string) => console.warn('[riscv64]', line)
	});

	const [cols, rows] = options.term.getSize();
	// vm_start(config_url, ram_size, cmdline, pwd, width, height, has_network).
	// A null cmdline leaves the one in the config alone, and the machine has no
	// network to be told about.
	module.ccall(
		'vm_start',
		null,
		['string', 'number', 'string', 'string', 'number', 'number', 'number'],
		[new URL(CONFIG_PATH, location.href).href, options.memoryMb ?? 0, null, null, cols, rows, 0]
	);

	const queue = (code: number) => module.ccall('console_queue_char', null, ['number'], [code]);

	return {
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
