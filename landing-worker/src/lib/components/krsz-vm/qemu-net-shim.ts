/**
 * The socket QEMU's netdev thinks it has.
 *
 * `-netdev socket` speaks raw Ethernet over an ordinary TCP connection, and
 * under Emscripten a TCP connection is a WebSocket: SOCKFS tunnels one over the
 * other. So QEMU connects, this stands in for the connection, and the frames go
 * to the gateway in qemu-net rather than to a server.
 *
 * Where this runs matters, and the first attempt got it wrong. QEMU's main is
 * proxied to a pthread, so the socket looked like it would be built there --
 * but `__syscall_connect` opens with `if (ENVIRONMENT_IS_PTHREAD) return
 * proxyToMainThread(...)`, and every other socket call does the same. The
 * socket is built on the page's thread whatever thread asked for it, which is
 * also where the gateway wants to be: it needs `fetch` against this origin and
 * one place to keep connection state. So this is an ordinary module in the
 * page, and the elaborate machinery for reaching into a worker was answering a
 * question that was never asked.
 *
 * QEMU is given a hostname it can never resolve, and that is deliberate: the
 * name is how the replacement recognises its own socket, and nothing else the
 * runtime opens is touched. Before this was in place the real WebSocket tried
 * to dial it and QEMU refused to start -- "can't connect socket: Host is
 * unreachable".
 */

import type { QemuNet } from './qemu-net';

/**
 * The host QEMU is told to connect to. Never resolved and never reached: it is
 * a label, and `.invalid` is reserved by RFC 2606 precisely so that a name
 * meant never to resolve cannot collide with one that does.
 */
export const NET_HOST = 'krsz-net.invalid';

/** Emscripten's poll reads these off the socket instance, not off the class. */
const CONNECTING = 0;
const OPEN = 1;
const CLOSED = 3;

/**
 * Replaces WebSocket for this one host, for as long as the machine runs.
 *
 * `getNet` rather than the gateway itself because the two are circular: the
 * gateway sends through the socket, the socket delivers to the gateway, and one
 * of them has to be built first.
 */
export function installNetShim(
	scope: typeof globalThis,
	getNet: () => QemuNet | null
): () => void {
	const Real = scope.WebSocket;
	if (!Real) return () => {};

	class BridgedSocket {
		binaryType: 'blob' | 'arraybuffer' = 'arraybuffer';
		readyState: number = CONNECTING;
		onopen: ((ev: unknown) => void) | null = null;
		onmessage: ((ev: { data: unknown }) => void) | null = null;
		onclose: ((ev: unknown) => void) | null = null;
		onerror: ((ev: unknown) => void) | null = null;

		// Emscripten's poll compares `dest.socket.readyState` against
		// `dest.socket.OPEN` -- properties of the instance. Without them every
		// comparison is against undefined, the socket never reports writable, and
		// the poll blocks in Atomics.wait on the page's main thread: the machine
		// wedges mid-boot with the tab pinned.
		readonly CONNECTING = CONNECTING;
		readonly OPEN = OPEN;
		readonly CLOSING = 2;
		readonly CLOSED = CLOSED;

		constructor(readonly url: string) {
			live = this;
			// Open on the next turn, not now: the caller is still inside `new` and
			// Emscripten stores the socket only once the constructor returns.
			setTimeout(() => {
				if (this.readyState !== CONNECTING) return;
				this.readyState = OPEN;
				this.onopen?.({});
			}, 0);
		}

		/** QEMU writing a frame. Straight to the gateway. */
		send(data: ArrayBuffer | ArrayBufferView | string) {
			if (typeof data === 'string') return;
			const bytes =
				data instanceof ArrayBuffer
					? new Uint8Array(data)
					: new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
			getNet()?.receive(bytes);
		}

		/** The gateway handing a frame back. */
		deliver(bytes: Uint8Array) {
			// A copy: Emscripten keeps what it is given on its receive queue, and
			// the gateway reuses its buffers.
			this.onmessage?.({ data: bytes.slice().buffer });
		}

		close() {
			this.readyState = CLOSED;
			if (live === this) live = null;
			this.onclose?.({});
		}

		addEventListener(type: string, fn: (ev: never) => void) {
			if (type === 'open') this.onopen = fn as (ev: unknown) => void;
			else if (type === 'message') this.onmessage = fn as (ev: { data: unknown }) => void;
			else if (type === 'close') this.onclose = fn as (ev: unknown) => void;
			else if (type === 'error') this.onerror = fn as (ev: unknown) => void;
		}
		removeEventListener() {}
	}

	let live: BridgedSocket | null = null;

	scope.WebSocket = new Proxy(Real, {
		construct(target, argv: unknown[]) {
			if (String(argv[0] ?? '').includes(NET_HOST)) {
				return new BridgedSocket(String(argv[0])) as unknown as WebSocket;
			}
			return Reflect.construct(target, argv as never[]);
		}
	}) as typeof WebSocket;

	// How the gateway reaches the guest. Read through a function so it always
	// finds the socket QEMU is currently holding.
	deliverTo = (bytes: Uint8Array) => live?.deliver(bytes);

	return () => {
		scope.WebSocket = Real;
		deliverTo = null;
		live = null;
	};
}

/** Set while a shim is installed; the gateway's way back to the guest. */
let deliverTo: ((bytes: Uint8Array) => void) | null = null;

/** Hands one Ethernet frame, length-prefixed, to whatever QEMU is listening. */
export function sendToGuest(bytes: Uint8Array): void {
	deliverTo?.(bytes);
}
