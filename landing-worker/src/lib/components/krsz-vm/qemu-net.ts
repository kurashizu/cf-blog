/**
 * The x86-64 machine's network: a TCP/IP gateway that runs in the page.
 *
 * v86 carries one of these inside it — ARP, DHCP, ping, a DNS resolver and a
 * TCP peer that terminates the guest's connections and hands out byte streams.
 * QEMU does not. Its user-mode stack is libslirp, which this build does not
 * link (checked: no slirp symbols, and `user` is absent from the backend table),
 * and every other backend it does have wants a host socket API that a browser
 * tab has no version of.
 *
 * What it does have is `-netdev socket`, which speaks raw Ethernet frames over
 * an ordinary TCP connection -- and under Emscripten a TCP connection *is* a
 * WebSocket, because SOCKFS tunnels one over the other. Point `Module.websocket`
 * at this page's own endpoint and QEMU's socket netdev arrives here as frames,
 * with no change to QEMU at all.
 *
 * So this file is the missing half: the gateway the guest thinks it is talking
 * to. It answers ARP for its own address, hands out a lease over DHCP, replies
 * to pings, resolves names through the same-origin DoH endpoint, and turns the
 * guest's TCP connections into WISP streams on /net/wisp -- the relay v86
 * already uses, which stays the single place destinations are policed.
 *
 * What it is not: a general TCP stack. The guest is one machine talking to
 * ordinary servers, so this implements the parts that path uses -- the three-way
 * handshake, in-order data with cumulative acks, a receive window big enough not
 * to matter, and both directions of close. It does not do out-of-order
 * reassembly, selective acks, timestamps, or congestion control beyond
 * retransmitting on a timer. The far end is a relay on the same origin over a
 * reliable WebSocket, so the loss those features exist for does not happen here;
 * what does happen is the guest retransmitting, and that is handled.
 */

/** QEMU's socket netdev framing: a 32-bit big-endian length, then the frame. */
const LEN = 4;

/** Ethernet */
const ETH_HDR = 14;
const ETH_ARP = 0x0806;
const ETH_IP = 0x0800;

/** IP protocols */
const IP_ICMP = 1;
const IP_TCP = 6;
const IP_UDP = 17;

/** TCP flags */
const FIN = 0x01;
const SYN = 0x02;
const RST = 0x04;
const PSH = 0x08;
const ACK = 0x10;

/**
 * The gateway's own numbers. A private /24 the guest is alone on: it gets .15,
 * the gateway is .2, and both are invented here rather than learnt, because
 * there is no real network underneath to learn them from.
 */
const NET = [10, 0, 2, 0];
const GATEWAY_IP = [10, 0, 2, 2];
const GUEST_IP = [10, 0, 2, 15];
const NETMASK = [255, 255, 255, 0];
/** Locally administered, so it cannot collide with a real card. */
const GATEWAY_MAC = [0x52, 0x55, 0x0a, 0x00, 0x02, 0x02];

const BROADCAST_MAC = [0xff, 0xff, 0xff, 0xff, 0xff, 0xff];

/** WISP packet types, matching routes/net/wisp. */
const W_CONNECT = 0x01;
const W_DATA = 0x02;
const W_CONTINUE = 0x03;
const W_CLOSE = 0x04;

const ip4 = (a: number[]) => a.join('.');

function checksum(data: Uint8Array, start = 0, end = data.length, seed = 0): number {
	let sum = seed;
	let i = start;
	// Folded as it goes rather than once at the end. A full-size segment is some
	// 700 words, and left to accumulate the running total passes 2^31 -- where
	// JavaScript's bitwise operators, which are signed 32-bit, turn it negative
	// and the checksum comes out wrong. Wrong for large segments only, which is
	// why small things worked and TLS did not: the guest's stack dropped the
	// record and OpenSSL reported a record-layer failure.
	for (; i + 1 < end; i += 2) {
		sum += (data[i] << 8) | data[i + 1];
		if (sum > 0xffff) sum = (sum & 0xffff) + (sum >>> 16);
	}
	if ((end - start) % 2) sum += data[end - 1] << 8;
	while (sum >>> 16) sum = (sum & 0xffff) + (sum >>> 16);
	return ~sum & 0xffff;
}

/** The pseudo-header sum TCP and UDP checksums are seeded with. */
function pseudoSum(src: number[], dst: number[], proto: number, length: number): number {
	let sum = 0;
	for (let i = 0; i < 4; i += 2) sum += (src[i] << 8) | src[i + 1];
	for (let i = 0; i < 4; i += 2) sum += (dst[i] << 8) | dst[i + 1];
	sum += proto;
	sum += length;
	return sum;
}

interface Connection {
	/** The WISP stream this connection's bytes travel on. */
	streamId: number;
	guestPort: number;
	host: string;
	port: number;
	/** Our sequence numbers: what we have sent and what has been acked. */
	sndNext: number;
	sndUnacked: number;
	/** Theirs: the next byte we expect. */
	rcvNext: number;
	state: 'syn' | 'open' | 'guestClosed' | 'peerClosed' | 'dead';
	/** Sent but unacknowledged, kept for retransmission. */
	pending: { seq: number; data: Uint8Array; sentAt: number }[];
	/** Upstream bytes not yet handed to the guest. */
	outbox: Uint8Array[];
	/** The peer closed, but there were still queued bytes to deliver first. */
	finAfterOutbox: boolean;
	/** The guest's address, and the one it thinks it is talking to. */
	src: number[];
	dst: number[];
}

export interface QemuNetOptions {
	/** Called with each frame to hand the guest, already length-prefixed. */
	send(bytes: Uint8Array): void;
	/** Somewhere for the panel to show what the network is doing. */
	onStatus?(status: string): void;
}

export class QemuNet {
	private guestMac = [0x52, 0x54, 0x00, 0x12, 0x34, 0x56];
	private conns = new Map<string, Connection>();
	private byStream = new Map<number, Connection>();
	private nextStream = 1;
	private wisp: WebSocket | null = null;
	private wispReady = false;
	private wispQueue: Uint8Array[] = [];
	private timer: ReturnType<typeof setInterval> | null = null;
	private closed = false;
	/** Bytes of a frame that has not all arrived yet. */
	private inbox = new Uint8Array(0);
	/** How long to wait before the next reconnection, doubling to a ceiling. */
	private retry = 0;
	/** Counters, for ?debug: which direction, if either, is actually moving. */
	stats = { framesIn: 0, framesOut: 0, arp: 0, dhcp: 0, dns: 0, icmp: 0, tcp: 0 };

	private opts: QemuNetOptions;

	constructor(opts: QemuNetOptions) {
		this.opts = opts;
		this.openWisp();
		// Retransmission, and nothing finer: the only loss here is the guest
		// missing a segment while it was busy, which a second copy fixes.
		this.timer = setInterval(() => this.retransmit(), 250);
	}

	destroy() {
		this.closed = true;
		if (this.timer) clearInterval(this.timer);
		this.timer = null;
		try {
			this.wisp?.close();
		} catch {
			/* already gone */
		}
		this.conns.clear();
		this.byStream.clear();
	}

	// ── the relay ────────────────────────────────────────────────────────────

	private openWisp() {
		const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
		const ws = new WebSocket(`${scheme}://${location.host}/net/wisp`);
		ws.binaryType = 'arraybuffer';
		this.wisp = ws;
		ws.onopen = () => {
			this.wispReady = true;
			this.retry = 0;
			for (const q of this.wispQueue) ws.send(q);
			this.wispQueue = [];
			this.opts.onStatus?.('relay connected');
		};
		ws.onmessage = (ev) => this.onWisp(new Uint8Array(ev.data as ArrayBuffer));
		ws.onclose = () => {
			this.wispReady = false;
			// Every stream on it is gone; tell the guest rather than let it hang.
			for (const conn of this.conns.values()) {
				if (conn.state !== 'dead') this.sendTcp(conn, RST, new Uint8Array(0));
				conn.state = 'dead';
			}
			this.conns.clear();
			this.byStream.clear();
			// Anything queued belonged to a stream that no longer exists.
			this.wispQueue = [];
			if (this.closed) return;
			// And open a new one. The relay is a WebSocket to the edge and it does
			// not stay up for the life of a machine: it is rate limited per client,
			// closed when idle, and subject to every ordinary reason a connection
			// ends. Without this the first close was permanent -- the guest kept a
			// connection the gateway could no longer carry, and a fetch that had
			// worked a minute earlier timed out with nothing in the log to say why.
			this.opts.onStatus?.('relay disconnected, reconnecting');
			this.retry = Math.min(this.retry ? this.retry * 2 : 500, 8000);
			setTimeout(() => {
				if (!this.closed) this.openWisp();
			}, this.retry);
		};
		ws.onerror = () => this.opts.onStatus?.('relay error');
	}

	private wispSend(bytes: Uint8Array) {
		if (this.wispReady && this.wisp) this.wisp.send(bytes);
		else this.wispQueue.push(bytes);
	}

	private wispFrame(type: number, streamId: number, body: Uint8Array): Uint8Array {
		const out = new Uint8Array(5 + body.length);
		const v = new DataView(out.buffer);
		v.setUint8(0, type);
		v.setUint32(1, streamId, true);
		out.set(body, 5);
		return out;
	}

	private onWisp(data: Uint8Array) {
		if (data.length < 5) return;
		const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
		const type = v.getUint8(0);
		const streamId = v.getUint32(1, true);
		if (type === W_DATA) {
			const conn = this.byStream.get(streamId);
			if (!conn || conn.state === 'dead') return;
			this.deliver(conn, data.subarray(5));
		} else if (type === W_CLOSE) {
			const conn = this.byStream.get(streamId);
			if (!conn || conn.state === 'dead') return;
			// The far end is finished. The FIN goes out behind whatever is still
			// queued, not in front of it -- sent now it would claim a sequence
			// number the undelivered bytes are going to need.
			conn.state = conn.state === 'guestClosed' ? 'dead' : 'peerClosed';
			if (conn.outbox.length || conn.pending.length) {
				conn.finAfterOutbox = true;
			} else {
				this.sendTcp(conn, FIN | ACK, new Uint8Array(0));
				conn.sndNext = (conn.sndNext + 1) >>> 0;
			}
		} else if (type === W_CONTINUE) {
			// Flow control we do not need to track: the relay grants a window per
			// stream and we never have enough in flight to exhaust it.
		}
	}

	// ── frames from the guest ────────────────────────────────────────────────

	/**
	 * Bytes as they arrive from QEMU's socket netdev: a 32-bit big-endian length
	 * then that many bytes of Ethernet, repeated. Nothing guarantees a message
	 * holds exactly one frame -- it can carry several, or stop in the middle of
	 * one -- so they are reassembled here rather than assumed.
	 */
	receive(chunk: Uint8Array) {
		if (this.inbox.length) {
			const joined = new Uint8Array(this.inbox.length + chunk.length);
			joined.set(this.inbox, 0);
			joined.set(chunk, this.inbox.length);
			this.inbox = joined;
		} else {
			this.inbox = new Uint8Array(chunk);
		}
		let at = 0;
		for (;;) {
			if (this.inbox.length - at < LEN) break;
			const len = new DataView(
				this.inbox.buffer,
				this.inbox.byteOffset + at,
				LEN
			).getUint32(0, false);
			// A length this large is a desynchronised stream, and carrying on would
			// mean buffering forever on a frame that is never going to arrive.
			if (len > 65535) {
				this.inbox = new Uint8Array(0);
				return;
			}
			if (this.inbox.length - at - LEN < len) break;
			this.onFrame(this.inbox.subarray(at + LEN, at + LEN + len));
			at += LEN + len;
		}
		this.inbox = at ? this.inbox.subarray(at) : this.inbox;
	}

	/** One complete Ethernet frame. */
	private onFrame(frame: Uint8Array) {
		this.stats.framesIn++;
		if (frame.length < ETH_HDR) return;
		// Remember who is asking, so replies go back to the right card.
		this.guestMac = Array.from(frame.subarray(6, 12));
		const type = (frame[12] << 8) | frame[13];
		if (type === ETH_ARP) {
			this.stats.arp++;
			this.onArp(frame);
		} else if (type === ETH_IP) {
			this.onIp(frame);
		}
	}

	private ethernet(dstMac: number[], type: number, payload: Uint8Array): void {
		const frame = new Uint8Array(ETH_HDR + payload.length);
		frame.set(dstMac, 0);
		frame.set(GATEWAY_MAC, 6);
		frame[12] = type >> 8;
		frame[13] = type & 0xff;
		frame.set(payload, ETH_HDR);
		this.stats.framesOut++;
		// QEMU's socket netdev reads a length first, then that many bytes.
		const out = new Uint8Array(LEN + frame.length);
		new DataView(out.buffer).setUint32(0, frame.length, false);
		out.set(frame, LEN);
		this.opts.send(out);
	}

	// ── ARP ──────────────────────────────────────────────────────────────────

	private onArp(frame: Uint8Array) {
		const p = frame.subarray(ETH_HDR);
		if (p.length < 28) return;
		const op = (p[6] << 8) | p[7];
		if (op !== 1) return; // requests only
		const target = Array.from(p.subarray(24, 28));
		// Anything on this subnet answers as the gateway: the guest only ever
		// needs to reach one machine, and that machine is us.
		if (target[0] !== NET[0] || target[1] !== NET[1] || target[2] !== NET[2]) return;

		const reply = new Uint8Array(28);
		reply.set([0, 1, 0x08, 0x00, 6, 4, 0, 2], 0);
		reply.set(GATEWAY_MAC, 8);
		reply.set(target, 14);
		reply.set(p.subarray(8, 14), 18); // their MAC
		reply.set(p.subarray(14, 18), 24); // their IP
		this.ethernet(Array.from(p.subarray(8, 14)), ETH_ARP, reply);
	}

	// ── IP ───────────────────────────────────────────────────────────────────

	private onIp(frame: Uint8Array) {
		const ip = frame.subarray(ETH_HDR);
		if (ip.length < 20) return;
		const ihl = (ip[0] & 0x0f) * 4;
		const proto = ip[9];
		const src = Array.from(ip.subarray(12, 16));
		const dst = Array.from(ip.subarray(16, 20));
		const total = (ip[2] << 8) | ip[3];
		const body = ip.subarray(ihl, Math.min(total, ip.length));

		if (proto === IP_ICMP) {
			this.stats.icmp++;
			this.onIcmp(src, dst, body);
		}
		else if (proto === IP_UDP) this.onUdp(src, dst, body);
		else if (proto === IP_TCP) {
			this.stats.tcp++;
			this.onTcp(src, dst, body);
		}
	}

	private sendIp(dst: number[], proto: number, payload: Uint8Array, src = GATEWAY_IP, mac = this.guestMac) {
		const ip = new Uint8Array(20 + payload.length);
		ip[0] = 0x45;
		const total = ip.length;
		ip[2] = total >> 8;
		ip[3] = total & 0xff;
		ip[6] = 0x40; // don't fragment
		ip[8] = 64; // ttl
		ip[9] = proto;
		ip.set(src, 12);
		ip.set(dst, 16);
		const sum = checksum(ip, 0, 20);
		ip[10] = sum >> 8;
		ip[11] = sum & 0xff;
		ip.set(payload, 20);
		this.ethernet(mac, ETH_IP, ip);
	}

	// ── ICMP ─────────────────────────────────────────────────────────────────

	private onIcmp(src: number[], dst: number[], body: Uint8Array) {
		if (body.length < 8 || body[0] !== 8) return; // echo request only
		// Answered here rather than forwarded: the relay carries streams, and
		// there is no way to send a real ping through it. A reply from the
		// gateway is honest about what it is -- the guest's own stack is what is
		// being exercised -- and `ping` working at all is worth more than it
		// timing out on every host.
		const reply = new Uint8Array(body.length);
		reply.set(body);
		reply[0] = 0; // echo reply
		reply[2] = 0;
		reply[3] = 0;
		const sum = checksum(reply);
		reply[2] = sum >> 8;
		reply[3] = sum & 0xff;
		this.sendIp(src, IP_ICMP, reply, dst);
	}

	// ── UDP, which here means DHCP and DNS ───────────────────────────────────

	private onUdp(src: number[], dst: number[], body: Uint8Array) {
		if (body.length < 8) return;
		const sport = (body[0] << 8) | body[1];
		const dport = (body[2] << 8) | body[3];
		const payload = body.subarray(8);
		if (dport === 67) {
			this.stats.dhcp++;
			this.onDhcp(payload);
		} else if (dport === 53) {
			this.stats.dns++;
			void this.onDns(src, sport, payload);
		}
	}

	private sendUdp(dst: number[], sport: number, dport: number, payload: Uint8Array, src = GATEWAY_IP, mac = this.guestMac) {
		const udp = new Uint8Array(8 + payload.length);
		udp[0] = sport >> 8;
		udp[1] = sport & 0xff;
		udp[2] = dport >> 8;
		udp[3] = dport & 0xff;
		udp[4] = udp.length >> 8;
		udp[5] = udp.length & 0xff;
		udp.set(payload, 8);
		const sum = checksum(udp, 0, udp.length, pseudoSum(src, dst, IP_UDP, udp.length));
		// 0 means "not computed", so the one's-complement -0 is sent instead.
		udp[6] = (sum || 0xffff) >> 8;
		udp[7] = (sum || 0xffff) & 0xff;
		this.sendIp(dst, IP_UDP, udp, src, mac);
	}

	// ── DHCP ─────────────────────────────────────────────────────────────────

	private onDhcp(p: Uint8Array) {
		if (p.length < 240) return;
		// The message type is option 53; walk the options for it.
		let kind = 0;
		for (let i = 240; i < p.length && p[i] !== 0xff; ) {
			if (p[i] === 0) {
				i++;
				continue;
			}
			const len = p[i + 1];
			if (p[i] === 53) kind = p[i + 2];
			i += 2 + len;
		}
		if (kind !== 1 && kind !== 3) return; // DISCOVER or REQUEST

		const out = new Uint8Array(300);
		out[0] = 2; // BOOTREPLY
		out[1] = 1;
		out[2] = 6;
		out.set(p.subarray(4, 8), 4); // xid
		out.set(GUEST_IP, 16); // yiaddr
		out.set(GATEWAY_IP, 20); // siaddr
		out.set(p.subarray(28, 34), 28); // chaddr
		out.set([0x63, 0x82, 0x53, 0x63], 236); // magic cookie

		let o = 240;
		const opt = (code: number, ...vals: number[]) => {
			out[o++] = code;
			out[o++] = vals.length;
			for (const v of vals) out[o++] = v;
		};
		opt(53, kind === 1 ? 2 : 5); // OFFER or ACK
		opt(54, ...GATEWAY_IP); // server id
		opt(51, 0, 0x0d, 0x2f, 0x00); // lease, ~24h
		opt(1, ...NETMASK);
		opt(3, ...GATEWAY_IP); // router
		// The gateway is also the resolver: its DNS is answered here, over DoH.
		opt(6, ...GATEWAY_IP);
		opt(28, NET[0], NET[1], NET[2], 255); // broadcast
		// An MTU the relay will not have to fragment, and that leaves room for
		// the WebSocket framing every one of these frames is wrapped in.
		opt(26, 0x05, 0x78); // 1400
		out[o++] = 0xff;

		// Broadcast, because the guest has no address yet to be reached at.
		this.sendUdp([255, 255, 255, 255], 67, 68, out.subarray(0, o), GATEWAY_IP, BROADCAST_MAC);
	}

	// ── DNS ──────────────────────────────────────────────────────────────────

	private async onDns(src: number[], sport: number, query: Uint8Array) {
		// Forwarded to the same-origin DoH endpoint, which is where names are
		// policed -- by the time a connection reaches the relay it has an address
		// and there is no name left to check.
		try {
			const res = await fetch('/dns-query', {
				method: 'POST',
				headers: { 'content-type': 'application/dns-message' },
				body: query as BufferSource
			});
			if (!res.ok) throw new Error(String(res.status));
			const answer = new Uint8Array(await res.arrayBuffer());
			if (this.closed) return;
			this.sendUdp(src, 53, sport, answer);
		} catch {
			// A SERVFAIL, so the guest's resolver fails now rather than at a timeout.
			if (this.closed || query.length < 12) return;
			const fail = new Uint8Array(query.length);
			fail.set(query);
			fail[2] = 0x81;
			fail[3] = 0x82;
			this.sendUdp(src, 53, sport, fail);
		}
	}

	// ── TCP ──────────────────────────────────────────────────────────────────

	private key(port: number, dst: number[], dport: number) {
		return `${port}:${ip4(dst)}:${dport}`;
	}

	private onTcp(src: number[], dst: number[], seg: Uint8Array) {
		if (seg.length < 20) return;
		const sport = (seg[0] << 8) | seg[1];
		const dport = (seg[2] << 8) | seg[3];
		const v = new DataView(seg.buffer, seg.byteOffset, seg.byteLength);
		const seq = v.getUint32(4, false);
		const ack = v.getUint32(8, false);
		const off = (seg[12] >> 4) * 4;
		const flags = seg[13];
		const data = seg.subarray(off);
		const k = this.key(sport, dst, dport);
		let conn = this.conns.get(k);

		if (flags & SYN && !(flags & ACK)) {
			// A fresh connection. The stream is opened upstream now and the guest's
			// SYN is answered immediately: waiting for the relay would stall every
			// connection by a round trip, and a refusal arrives as a reset.
			if (conn) this.teardown(conn);
			const streamId = this.nextStream++;
			conn = {
				streamId,
				guestPort: sport,
				host: ip4(dst),
				port: dport,
				sndNext: 1,
				sndUnacked: 1,
				rcvNext: (seq + 1) >>> 0,
				state: 'syn',
				pending: [],
				outbox: [],
				finAfterOutbox: false,
				src,
				dst
			};
			this.conns.set(k, conn);
			this.byStream.set(streamId, conn);

			const host = new TextEncoder().encode(conn.host);
			const body = new Uint8Array(3 + host.length);
			body[0] = 0x01; // TCP
			body[1] = dport & 0xff;
			body[2] = dport >> 8;
			body.set(host, 3);
			this.wispSend(this.wispFrame(W_CONNECT, streamId, body));

			this.sendTcp(conn, SYN | ACK, new Uint8Array(0));
			conn.sndNext = 1;
			conn.state = 'open';
			return;
		}

		if (!conn) {
			// Nothing here by that name, so say so rather than stay silent: a reset
			// ends the guest's connection now instead of leaving it to time out.
			// v86's gateway does the same. Never in reply to a reset, which would
			// bounce forever.
			if (!(flags & RST)) {
				const ackn = (ack + (flags & (SYN | FIN) ? 1 : 0)) >>> 0;
				this.reset(src, dst, sport, dport, ackn, (seq + (flags & (SYN | FIN) ? 1 : 0)) >>> 0);
			}
			return;
		}

		if (flags & RST) {
			this.teardown(conn);
			return;
		}

		if (flags & ACK) {
			conn.sndUnacked = ack;
			// Kept if its last byte is still unacknowledged. Both ends of the
			// comparison have to be reduced mod 2^32 before the subtraction:
			// seq + length is an ordinary sum that runs past 2^32 without
			// wrapping, and once it does the sign test says the wrong thing and
			// acknowledged data is retransmitted into the middle of a live
			// stream. Small transfers never got far enough to see it; a TLS
			// handshake did, and OpenSSL reported a record-layer failure.
			conn.pending = conn.pending.filter(
				(p) => (((ack - ((p.seq + p.data.length) >>> 0)) | 0) < 0)
			);
			// What the acknowledgement releases: the next queued segment.
			this.pump(conn);
		}

		if (data.length) {
			// In order only. A gap means a segment is still in flight; the ack we
			// send names what we still want, and the guest sends it again.
			if (seq === conn.rcvNext) {
				conn.rcvNext = (conn.rcvNext + data.length) >>> 0;
				this.wispSend(this.wispFrame(W_DATA, conn.streamId, new Uint8Array(data)));
			}
			this.sendTcp(conn, ACK, new Uint8Array(0));
		}

		if (flags & FIN) {
			conn.rcvNext = (conn.rcvNext + 1) >>> 0;
			this.sendTcp(conn, ACK, new Uint8Array(0));
			this.wispSend(this.wispFrame(W_CLOSE, conn.streamId, new Uint8Array([0x02])));
			if (conn.state === 'peerClosed') this.teardown(conn);
			else conn.state = 'guestClosed';
		}
	}

	/** A bare RST, for a segment naming a connection this gateway does not have. */
	private reset(
		src: number[],
		dst: number[],
		sport: number,
		dport: number,
		seq: number,
		ackn: number
	) {
		const seg = new Uint8Array(20);
		const v = new DataView(seg.buffer);
		v.setUint16(0, dport, false);
		v.setUint16(2, sport, false);
		v.setUint32(4, seq, false);
		v.setUint32(8, ackn, false);
		seg[12] = 5 << 4;
		seg[13] = RST | ACK;
		const sum = checksum(seg, 0, seg.length, pseudoSum(dst, src, IP_TCP, seg.length));
		v.setUint16(16, sum || 0xffff, false);
		this.sendIp(src, IP_TCP, seg, dst);
	}

	/**
	 * Bytes from upstream. Queued, then handed to the guest a segment at a time.
	 *
	 * One segment in flight and no more, which is what v86's own gateway does
	 * (src/browser/fake_network.js, BSD-2-Clause): its pump() sends a single
	 * chunk, sets `pending`, and waits for the acknowledgement before sending
	 * the next. The first version of this sent the whole reply as a burst of
	 * back-to-back segments, which is where a TLS handshake -- 3889 bytes, three
	 * segments -- fell over while a 559-byte HTTP reply that fitted in one
	 * segment did not.
	 */
	private deliver(conn: Connection, data: Uint8Array) {
		if (data.length) conn.outbox.push(new Uint8Array(data));
		this.pump(conn);
	}

	/** Sends the next queued segment, if nothing of ours is unacknowledged. */
	private pump(conn: Connection) {
		if (conn.pending.length || conn.state === 'dead') return;
		if (!conn.outbox.length) {
			// The far end finished while we still had bytes to hand over; the FIN
			// waited for them, and this is where it goes out.
			if (conn.finAfterOutbox) {
				conn.finAfterOutbox = false;
				this.sendTcp(conn, FIN | ACK, new Uint8Array(0));
				conn.sndNext = (conn.sndNext + 1) >>> 0;
			}
			return;
		}
		// 1400 of MTU less 40 of headers, so nothing this sends is fragmented.
		const MSS = 1360;
		const head = conn.outbox[0];
		if (head.length <= MSS) {
			conn.outbox.shift();
			this.sendTcp(conn, ACK | PSH, head);
		} else {
			conn.outbox[0] = head.subarray(MSS);
			this.sendTcp(conn, ACK | PSH, head.subarray(0, MSS));
		}
	}

	/**
	 * Sends one segment. `seq` names it: left out, this is new data and goes on
	 * the unacknowledged list; given, it is a retransmission of something already
	 * there and the list is left alone.
	 */
	private emit(conn: Connection, flags: number, data: Uint8Array, seq?: number) {
		const retransmit = seq !== undefined;
		const sequence = seq ?? conn.sndNext;
		const dst = conn.src;
		const src = conn.dst;
		const withMss = (flags & SYN) !== 0;
		const optLen = withMss ? 4 : 0;
		const seg = new Uint8Array(20 + optLen + data.length);
		const v = new DataView(seg.buffer);
		v.setUint16(0, conn.port, false);
		v.setUint16(2, conn.guestPort, false);
		v.setUint32(4, sequence, false);
		v.setUint32(8, conn.rcvNext, false);
		seg[12] = ((20 + optLen) / 4) << 4;
		seg[13] = flags;
		// A window we never shrink: everything the guest sends is handed straight
		// to a WebSocket, so there is no queue here to run out of.
		v.setUint16(14, 64240, false);
		if (withMss) {
			seg[20] = 2;
			seg[21] = 4;
			seg[22] = 1360 >> 8;
			seg[23] = 1360 & 0xff;
		}
		seg.set(data, 20 + optLen);
		const sum = checksum(seg, 0, seg.length, pseudoSum(src, dst, IP_TCP, seg.length));
		v.setUint16(16, sum || 0xffff, false);
		this.sendIp(dst, IP_TCP, seg, src);

		if (data.length && !retransmit) {
			conn.pending.push({ seq: sequence, data: new Uint8Array(data), sentAt: Date.now() });
			conn.sndNext = (conn.sndNext + data.length) >>> 0;
		}
	}

	/** New data or a bare flag segment, at the current sequence number. */
	private sendTcp(conn: Connection, flags: number, data: Uint8Array) {
		this.emit(conn, flags, data);
	}

	private retransmit() {
		const now = Date.now();
		for (const conn of this.conns.values()) {
			if (conn.state === 'dead') continue;
			// Only the oldest, and only once its timer is up. Resending the whole
			// window on every tick is how a slow ack turns into a burst of
			// duplicates, and the guest reassembles those into a stream that no
			// longer says what the server sent.
			const oldest = conn.pending[0];
			if (!oldest || now - oldest.sentAt < 1000) continue;
			oldest.sentAt = now;
			this.emit(conn, ACK | PSH, oldest.data, oldest.seq);
		}
	}

	private teardown(conn: Connection) {
		conn.state = 'dead';
		this.byStream.delete(conn.streamId);
		for (const [k, c] of this.conns) if (c === conn) this.conns.delete(k);
		this.wispSend(this.wispFrame(W_CLOSE, conn.streamId, new Uint8Array([0x02])));
	}
}
