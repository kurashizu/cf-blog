// @ts-nocheck -- vendored from v86; kept as upstream wrote it so it stays diffable.
// Adapted from v86, src/browser/wisp_network.js, at b0d8f2c.
// Copyright (c) 2012, The v86 contributors. BSD-2-Clause; see v86's LICENSE.
//
// The half that joins the vendored gateway to this page: a WebSocket speaking
// WISP to /net/wisp on one side, and QEMU's `-netdev socket` on the other.
//
// Changes from upstream:
//   - v86's bus is replaced by two plain callbacks, `send` and `on_receive`
//   - frames carry QEMU's 4-byte big-endian length prefix, added on the way out
//     and stripped on the way in, because that is what the socket netdev speaks
//   - the socket reconnects with a doubling backoff rather than a flat 10s, and
//     the reconnection is cancelled on destroy
//   - `receive` is not proxied through a bus, it calls the page's callback

import { create_eth_encoder_buf, handle_fake_networking, TCPConnection } from './fake-network.js';

/** QEMU's socket netdev framing: a 32-bit big-endian length, then the frame. */
const LEN = 4;

/**
 * @param {string} wisp_url
 * @param {{ send: (bytes: Uint8Array) => void, mtu?: number, doh_server?: string,
 *           router_mac?: string, router_ip?: string, vm_ip?: string,
 *           onStatus?: (text: string) => void }} config
 */
export function WispAdapter(wisp_url, config) {
	this.wisp_url = wisp_url;
	this.last_stream = 1;
	this.connections = { 0: { congestion: 0 } };
	this.congested_buffer = [];
	this.closed = false;
	this.retry = 0;
	this.reconnect_timer = null;
	/** Bytes of a length-prefixed frame that has not all arrived yet. */
	this.inbox = new Uint8Array(0);

	this.out = config.send;
	this.on_status = config.onStatus;
	this.router_mac = new Uint8Array(
		(config.router_mac || '52:54:0:1:2:3').split(':').map((x) => parseInt(x, 16))
	);
	this.router_ip = new Uint8Array(
		(config.router_ip || '192.168.86.1').split('.').map((x) => parseInt(x, 10))
	);
	this.vm_ip = new Uint8Array(
		(config.vm_ip || '192.168.86.100').split('.').map((x) => parseInt(x, 10))
	);
	this.masquerade = true;
	this.vm_mac = new Uint8Array(6);
	this.dns_method = 'doh';
	this.doh_server = config.doh_server;
	this.tcp_conn = {};
	this.mtu = config.mtu;
	this.eth_encoder_buf = create_eth_encoder_buf(this.mtu);

	// Counters for ?debug: which direction, if either, is moving.
	this.stats = { framesIn: 0, framesOut: 0, tcpConnections: 0 };

	this.register_ws();
}

WispAdapter.prototype.register_ws = function () {
	if (this.closed) return;
	const ws = new WebSocket(this.wisp_url.replace('wisp://', 'ws://').replace('wisps://', 'wss://'));
	ws.binaryType = 'arraybuffer';
	this.wispws = ws;
	ws.onopen = () => {
		this.retry = 0;
		this.on_status && this.on_status('relay connected');
	};
	ws.onmessage = (event) => {
		this.process_incoming_wisp_frame(new Uint8Array(event.data));
	};
	ws.onclose = () => {
		if (this.closed) return;
		// Every stream on it is gone. The relay is rate limited and does not stay
		// up for the life of a machine, so this is the normal case rather than an
		// error, and the guest's connections have to be told.
		for (const id of Object.keys(this.connections)) {
			if (id === '0') continue;
			const conn = this.connections[id];
			conn.close_callback && conn.close_callback(0x02);
			delete this.connections[id];
		}
		this.congested_buffer.length = 0;
		this.on_status && this.on_status('relay disconnected, reconnecting');
		this.retry = Math.min(this.retry ? this.retry * 2 : 500, 8000);
		this.reconnect_timer = setTimeout(() => this.register_ws(), this.retry);
	};
};

WispAdapter.prototype.send_packet = function (data, type, stream_id) {
	if (this.connections[stream_id]) {
		if (this.connections[stream_id].congestion > 0) {
			if (type === 'DATA') {
				this.connections[stream_id].congestion--;
			}
			if (this.wispws && this.wispws.readyState === 1) this.wispws.send(data);
		} else {
			this.connections[stream_id].congested = true;
			this.congested_buffer.push({ data: data, type: type });
		}
	}
};

WispAdapter.prototype.process_incoming_wisp_frame = function (frame) {
	const view = new DataView(frame.buffer);
	const stream_id = view.getUint32(1, true);
	switch (frame[0]) {
		case 1: // CONNECT -- the server should never send this
			break;
		case 2: // DATA
			if (this.connections[stream_id]) this.connections[stream_id].data_callback(frame.slice(5));
			break;
		case 3: // CONTINUE
			if (this.connections[stream_id]) {
				this.connections[stream_id].congestion = view.getUint32(5, true);

				if (this.connections[stream_id].congested) {
					const buffer = this.congested_buffer.slice(0);
					this.congested_buffer.length = 0;
					this.connections[stream_id].congested = false;
					for (const packet of buffer) {
						this.send_packet(packet.data, packet.type, stream_id);
					}
				}
			}
			break;
		case 4: // CLOSE
			if (this.connections[stream_id])
				this.connections[stream_id].close_callback(view.getUint8(5));
			delete this.connections[stream_id];
			break;
		case 5: // PROTOEXT -- a wisp v2 upgrade request; this is a v1 client
			break;
	}
};

WispAdapter.prototype.send_wisp_frame = function (frame_obj) {
	let full_packet;
	let view;
	switch (frame_obj.type) {
		case 'CONNECT': {
			const hostname_buffer = new TextEncoder().encode(frame_obj.hostname);
			full_packet = new Uint8Array(5 + 1 + 2 + hostname_buffer.length);
			view = new DataView(full_packet.buffer);
			view.setUint8(0, 0x01);
			view.setUint32(1, frame_obj.stream_id, true);
			view.setUint8(5, 0x01); // TCP
			view.setUint16(6, frame_obj.port, true);
			full_packet.set(hostname_buffer, 8);

			this.connections[frame_obj.stream_id] = {
				data_callback: frame_obj.data_callback,
				close_callback: frame_obj.close_callback,
				congestion: this.connections[0].congestion
			};
			break;
		}
		case 'DATA':
			full_packet = new Uint8Array(5 + frame_obj.data.length);
			view = new DataView(full_packet.buffer);
			view.setUint8(0, 0x02);
			view.setUint32(1, frame_obj.stream_id, true);
			full_packet.set(frame_obj.data, 5);
			break;
		case 'CLOSE':
			full_packet = new Uint8Array(5 + 1);
			view = new DataView(full_packet.buffer);
			view.setUint8(0, 0x04);
			view.setUint32(1, frame_obj.stream_id, true);
			view.setUint8(5, frame_obj.reason);
			break;
		default:
			return;
	}
	this.send_packet(full_packet, frame_obj.type, frame_obj.stream_id);
};

WispAdapter.prototype.destroy = function () {
	this.closed = true;
	if (this.reconnect_timer) clearTimeout(this.reconnect_timer);
	this.reconnect_timer = null;
	if (this.wispws) {
		this.wispws.onmessage = null;
		this.wispws.onclose = null;
		try {
			this.wispws.close();
		} catch {
			/* already gone */
		}
		this.wispws = null;
	}
};

/** Called by the gateway when the guest opens a connection. */
WispAdapter.prototype.on_tcp_connection = function (conn, packet) {
	conn.stream_id = this.last_stream++;
	this.stats.tcpConnections++;

	conn.on('data', (data) => {
		if (data.length !== 0) {
			this.send_wisp_frame({ type: 'DATA', stream_id: conn.stream_id, data: data });
		}
	});

	conn.on_close = () => {
		this.send_wisp_frame({ type: 'CLOSE', stream_id: conn.stream_id, reason: 0x02 });
	};

	// WISP has no shutdown, so close stands in for it.
	conn.on_shutdown = conn.on_close;

	this.send_wisp_frame({
		type: 'CONNECT',
		stream_id: conn.stream_id,
		hostname: packet.ipv4.dest.join('.'),
		port: conn.sport,
		data_callback: (data) => conn.write(data),
		close_callback: () => conn.close()
	});

	conn.accept();
	return true;
};

/**
 * Bytes as they arrive from QEMU's socket netdev: a 32-bit big-endian length
 * then that many bytes of Ethernet, repeated. Nothing guarantees a message
 * holds exactly one frame -- it can carry several, or stop in the middle of one
 * -- so they are reassembled here rather than assumed.
 */
WispAdapter.prototype.receive_from_guest = function (chunk) {
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
		const len = new DataView(this.inbox.buffer, this.inbox.byteOffset + at, LEN).getUint32(0, false);
		// A length this large means the stream is out of step, and carrying on
		// would buffer forever against a frame that is never going to arrive.
		if (len > 65535) {
			this.inbox = new Uint8Array(0);
			return;
		}
		if (this.inbox.length - at - LEN < len) break;
		this.stats.framesIn++;
		handle_fake_networking(this.inbox.subarray(at + LEN, at + LEN + len), this);
		at += LEN + len;
	}
	this.inbox = at ? this.inbox.slice(at) : this.inbox;
};

/** The gateway handing a finished frame back to the guest. */
WispAdapter.prototype.receive = function (data) {
	this.stats.framesOut++;
	const out = new Uint8Array(LEN + data.length);
	new DataView(out.buffer).setUint32(0, data.length, false);
	out.set(data, LEN);
	this.out(out);
};
