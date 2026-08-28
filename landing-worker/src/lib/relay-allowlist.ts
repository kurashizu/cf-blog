/**
 * The destination allowlist shared by the three relay endpoints.
 *
 * `OMNIPROXY_ALLOW` is a comma-separated list of `host` or `host:port` entries.
 * A bare "*" disables the check; unset blocks everything, so a deployment that
 * forgets to configure it fails closed. "*:443" is the useful middle ground --
 * any destination, but only on the ports a browser-shaped machine has business
 * reaching, which keeps the relay from becoming a general-purpose one.
 *
 * Where the check lands differs by caller, because who resolves the name does:
 *
 *   /net       the page names its destination, so the name is checked directly.
 *   /dns-query the emulator resolves for the guest, so this is the only place a
 *              name is still visible — and therefore where names are policed.
 *   /net/wisp  by the time the guest connects it has an address, not a name, so
 *              a literal IP can only be matched on its port. That is not a hole
 *              a name check would have closed: an address the guest could only
 *              have learnt from a lookup this list already approved.
 */
import { splitHostPort } from './omniproxy-protocol';

export interface AllowEntry {
	host: string;
	port: number | null;
}

export function parseAllowlist(raw: string | undefined): AllowEntry[] | null {
	if (!raw) return [];
	const parts = raw
		.split(',')
		.map((s) => s.trim().toLowerCase())
		.filter(Boolean);
	if (parts.includes('*')) return null;
	return parts.map((part) => {
		const { host, port } = splitHostPort(part);
		return { host: host.replace(/\.$/, ''), port };
	});
}

/** Matches an entry's host: "*" for any, otherwise exactly or as a parent domain. */
function hostMatches(host: string, entry: AllowEntry): boolean {
	if (entry.host === '*') return true;
	const h = host.toLowerCase().replace(/\.$/, '');
	return h === entry.host || h.endsWith(`.${entry.host}`);
}

/** A bare address, with no name left to check. */
export function isIpLiteral(host: string): boolean {
	if (host.includes(':')) return true; // IPv6, in any of its forms
	return /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}

export function isAllowed(host: string, port: number | null, allow: AllowEntry[] | null): boolean {
	if (allow === null) return true;
	const literal = isIpLiteral(host);
	return allow.some((entry) => {
		if (!literal && !hostMatches(host, entry)) return false;
		return entry.port === null || port === null || port === entry.port;
	});
}

/** Name-only check, for the resolver: a lookup carries no port to match on. */
export function isNameAllowed(name: string, allow: AllowEntry[] | null): boolean {
	if (allow === null) return true;
	return allow.some((entry) => hostMatches(name, entry));
}
