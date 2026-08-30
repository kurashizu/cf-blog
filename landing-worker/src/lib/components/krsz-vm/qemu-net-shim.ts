/**
 * The half of the network that has to run inside QEMU's own thread.
 *
 * QEMU's main is proxied to a pthread, and Emscripten's socket layer lives
 * wherever the socket is opened -- so the WebSocket that `-netdev socket`
 * produces is constructed in that worker, against that worker's globals. The
 * page cannot reach in and replace it after the fact.
 *
 * What the page does control is `mainScriptUrlOrBlob`: the pthread bootstrap
 * imports exactly that and calls its default export with the module it is
 * building. So the page hands it a small module that runs this first and then
 * re-exports the real glue untouched.
 *
 * Once installed, the socket is not a socket. Frames go to the page and come
 * back from it, because the gateway that answers them -- ARP, DHCP, DNS, TCP --
 * wants `fetch` against this origin and one place to keep connection state, and
 * a pthread that QEMU may stop is not that place.
 *
 * The channel is `Module.printErr`. It looks like an odd choice and it is the
 * only supported one: the pthread bootstrap forwards a fixed list of four
 * handlers to the page -- onExit, onAbort, print, printErr -- and nothing else
 * crosses without patching Emscripten's own dispatch. Frames are small, and
 * base64 is cheap next to the emulation they are feeding.
 */

/** Prefixes a printErr line that is a network frame rather than a diagnostic. */
export const NET_PREFIX = ' krsz-net ';

/** The host QEMU is told to connect to; only this one is intercepted. */
export const NET_HOST = 'krsz-net.invalid';

export function toBase64(bytes: Uint8Array): string {
	let s = '';
	for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
	return btoa(s);
}

export function fromBase64(text: string): Uint8Array {
	const s = atob(text);
	const out = new Uint8Array(s.length);
	for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
	return out;
}


/**
 * The shim itself, as source text for the blob module the pthread imports.
 *
 * Text rather than an imported module because neither way of asking Vite for a
 * URL works: `?url` copies the .ts byte for byte and the browser will not run
 * TypeScript, and `?worker&url` compiles it as a worker entry, which for a
 * module of pure function exports tree-shakes to an empty file. The constants
 * are interpolated from the ones above, so they still have one definition.
 *
 * What it does: replaces WebSocket for the one host QEMU's netdev is pointed
 * at, writes the guest's frames out through printErr -- the only handler the
 * pthread bootstrap forwards to the page that can carry bytes -- and takes
 * frames back on a message listener. Emscripten's own worker handler ignores a
 * message with no `cmd` field, so listening alongside it is safe.
 */
export const NET_SHIM_SOURCE = `
const NET_PREFIX = ${JSON.stringify(NET_PREFIX)};
const NET_HOST = ${JSON.stringify(NET_HOST)};

function toBase64(bytes) {
	let s = '';
	for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
	return btoa(s);
}

function fromBase64(text) {
	const s = atob(text);
	const out = new Uint8Array(s.length);
	for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
	return out;
}

function installNetShim(scope, module) {
	const Real = scope.WebSocket;
	if (!Real) return;
	let live = null;

	class BridgedSocket {
		constructor(url) {
			this.url = url;
			this.binaryType = 'arraybuffer';
			this.readyState = 0;
			this.onopen = null;
			this.onmessage = null;
			this.onclose = null;
			this.onerror = null;
			live = this;
			// Opened on the next turn: the caller is still inside \`new\`, and
			// Emscripten stores the socket only once the constructor returns.
			setTimeout(() => {
				this.readyState = 1;
				if (this.onopen) this.onopen({});
			}, 0);
		}

		send(data) {
			if (typeof data === 'string') return;
			const bytes =
				data instanceof ArrayBuffer
					? new Uint8Array(data)
					: new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
			if (module.printErr) module.printErr(NET_PREFIX + toBase64(bytes));
		}

		close() {
			this.readyState = 3;
			if (live === this) live = null;
			if (this.onclose) this.onclose({});
		}

		addEventListener(type, fn) {
			if (type === 'open') this.onopen = fn;
			else if (type === 'message') this.onmessage = fn;
			else if (type === 'close') this.onclose = fn;
			else if (type === 'error') this.onerror = fn;
		}
		removeEventListener() {}
	}

	// The way back in. Emscripten's own worker handler ignores a message with no
	// \`cmd\` field outright -- it only complains about commands it does not know --
	// so a listener of ours alongside it is safe, and the page can post to every
	// running worker and let the one holding the socket answer.
	scope.addEventListener('message', (ev) => {
		const msg = ev.data;
		if (!msg || typeof msg.krszNet !== 'string' || !live) return;
		const bytes = fromBase64(msg.krszNet);
		if (live.onmessage) live.onmessage({ data: bytes.buffer });
	});

	scope.WebSocket = new Proxy(Real, {
		construct(target, argv) {
			// Only the netdev's own socket. Anything else the runtime opens is left
			// alone, so this cannot break an unrelated connection.
			if (String(argv[0] || '').includes(NET_HOST)) return new BridgedSocket(String(argv[0]));
			return Reflect.construct(target, argv);
		}
	});
}
`;
