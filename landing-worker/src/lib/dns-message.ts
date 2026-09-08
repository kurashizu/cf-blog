/**
 * The parsing half of the DNS-over-HTTPS endpoint.
 *
 * Both functions read bytes a caller chose, so they live here rather than
 * inside the route: the route needs a live `platform` and `error()` to run at
 * all, and these do not, which is what makes them testable. See
 * `src/routes/dns-query/+server.ts` for how they are used.
 */

export interface Question {
	name: string;
	/** Byte after the question's QTYPE/QCLASS — where a truncated reply ends. */
	end: number;
}

/**
 * The first question of a wire-format query, or null if the message is not one
 * this endpoint is willing to interpret. An unparseable query is not refused
 * here; it is passed upstream, which rejects it in its own protocol's terms.
 */
export function parseQuestion(msg: Uint8Array): Question | null {
	if (msg.length < 17) return null;
	const qdcount = (msg[4] << 8) | msg[5];
	if (qdcount < 1) return null;
	const labels: string[] = [];
	let off = 12;
	while (off < msg.length) {
		const len = msg[off];
		// Compression pointers cannot appear in the first question — nothing has
		// been written yet for one to point back at.
		if (len & 0xc0) return null;
		if (len === 0) {
			const end = off + 5;
			return end <= msg.length && labels.length ? { name: labels.join('.'), end } : null;
		}
		off += 1;
		if (off + len > msg.length || labels.length > 63) return null;
		labels.push(new TextDecoder().decode(msg.subarray(off, off + len)));
		off += len;
	}
	return null;
}

/** Decodes base64url, or null if the text is not valid base64. */
export function fromBase64Url(text: string): Uint8Array | null {
	const padded = text.replace(/-/g, '+').replace(/_/g, '/');
	try {
		const raw = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
		const out = new Uint8Array(raw.length);
		for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
		return out;
	} catch {
		return null;
	}
}
