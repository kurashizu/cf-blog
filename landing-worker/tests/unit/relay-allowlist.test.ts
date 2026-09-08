import { describe, it, expect } from 'vitest';
import {
	parseAllowlist,
	isAllowed,
	isNameAllowed,
	isIpLiteral
} from '../../src/lib/relay-allowlist';

/* This list decides what the relay endpoints will connect to on a caller's
   behalf, so the fail-closed cases below matter more than the happy path. */

describe('parseAllowlist', () => {
	it('returns an empty list when unset, which blocks everything', () => {
		// fail closed: a deployment that forgets to configure this relays nothing
		expect(parseAllowlist(undefined)).toEqual([]);
		expect(parseAllowlist('')).toEqual([]);
		expect(isAllowed('example.com', 443, parseAllowlist(undefined))).toBe(false);
		expect(isNameAllowed('example.com', parseAllowlist(undefined))).toBe(false);
	});

	it('returns null for a bare star, which disables the check', () => {
		expect(parseAllowlist('*')).toBeNull();
		expect(isAllowed('anything.example', 12345, null)).toBe(true);
		expect(isNameAllowed('anything.example', null)).toBe(true);
	});

	it('reads a host with no port', () => {
		expect(parseAllowlist('example.com')).toEqual([{ host: 'example.com', port: null }]);
	});

	it('reads a host:port pair', () => {
		expect(parseAllowlist('example.com:443')).toEqual([{ host: 'example.com', port: 443 }]);
	});

	it('reads several entries and trims whitespace', () => {
		expect(parseAllowlist(' a.com:443 , b.com ')).toEqual([
			{ host: 'a.com', port: 443 },
			{ host: 'b.com', port: null }
		]);
	});

	it('lower-cases hosts', () => {
		expect(parseAllowlist('EXAMPLE.COM:443')).toEqual([{ host: 'example.com', port: 443 }]);
	});

	it('strips a trailing dot from a fully qualified name', () => {
		expect(parseAllowlist('example.com.')).toEqual([{ host: 'example.com', port: null }]);
	});

	it('drops empty entries between commas', () => {
		expect(parseAllowlist('a.com,,b.com')).toEqual([
			{ host: 'a.com', port: null },
			{ host: 'b.com', port: null }
		]);
	});

	it('takes a star anywhere in the list as disabling the check', () => {
		expect(parseAllowlist('a.com,*')).toBeNull();
	});

	it('reads a bracketed IPv6 entry with no port as any port', () => {
		// splitHostPort used to return port 0 here, because Number('') is 0 --
		// which turned "this host, any port" into "this host, port 0", an entry
		// that silently matched nothing
		const allow = parseAllowlist('[2001:db8::1]');
		expect(allow).toEqual([{ host: '2001:db8::1', port: null }]);
		expect(isAllowed('2001:db8::1', 443, allow)).toBe(true);
		expect(isAllowed('2001:db8::1', 80, allow)).toBe(true);
	});

	it('reads a bracketed IPv6 entry with a port', () => {
		const allow = parseAllowlist('[2001:db8::1]:443');
		expect(allow).toEqual([{ host: '2001:db8::1', port: 443 }]);
		expect(isAllowed('2001:db8::1', 443, allow)).toBe(true);
		expect(isAllowed('2001:db8::1', 80, allow)).toBe(false);
	});

	it('treats a trailing colon as no port rather than port 0', () => {
		expect(parseAllowlist('example.com:')).toEqual([{ host: 'example.com', port: null }]);
		expect(isAllowed('example.com', 443, parseAllowlist('example.com:'))).toBe(true);
	});

	it('keeps a port-only star as an entry, not a bypass', () => {
		// "*:443" means any host but only that port -- it must not become null
		const allow = parseAllowlist('*:443');
		expect(allow).toEqual([{ host: '*', port: 443 }]);
		expect(isAllowed('anything.example', 443, allow)).toBe(true);
		expect(isAllowed('anything.example', 22, allow)).toBe(false);
	});
});

describe('isAllowed', () => {
	const allow = parseAllowlist('example.com:443,plain.org');

	it('accepts an exact host on the listed port', () => {
		expect(isAllowed('example.com', 443, allow)).toBe(true);
	});

	it('rejects an exact host on another port', () => {
		expect(isAllowed('example.com', 22, allow)).toBe(false);
	});

	it('accepts a subdomain of a listed host', () => {
		expect(isAllowed('api.example.com', 443, allow)).toBe(true);
		expect(isAllowed('deep.api.example.com', 443, allow)).toBe(true);
	});

	it('rejects a host that merely ends with the listed string', () => {
		// notexample.com must not match example.com
		expect(isAllowed('notexample.com', 443, allow)).toBe(false);
		expect(isAllowed('evil-example.com', 443, allow)).toBe(false);
	});

	it('rejects a host that only starts with the listed one', () => {
		expect(isAllowed('example.com.evil.net', 443, allow)).toBe(false);
	});

	it('accepts any port for an entry with none', () => {
		expect(isAllowed('plain.org', 443, allow)).toBe(true);
		expect(isAllowed('plain.org', 9999, allow)).toBe(true);
	});

	it('ignores case and a trailing dot in the queried host', () => {
		expect(isAllowed('EXAMPLE.COM', 443, allow)).toBe(true);
		expect(isAllowed('example.com.', 443, allow)).toBe(true);
	});

	it('rejects an unlisted host outright', () => {
		expect(isAllowed('elsewhere.net', 443, allow)).toBe(false);
	});

	it('blocks everything when the list is empty', () => {
		expect(isAllowed('example.com', 443, [])).toBe(false);
	});

	it('allows everything when the list is null', () => {
		expect(isAllowed('example.com', 443, null)).toBe(true);
	});

	it('matches an IP literal on its port alone', () => {
		// by the time the guest connects it has an address, not a name, so a
		// literal can only be policed on the port
		const portOnly = parseAllowlist('example.com:443');
		expect(isAllowed('1.2.3.4', 443, portOnly)).toBe(true);
		expect(isAllowed('1.2.3.4', 22, portOnly)).toBe(false);
	});
});

describe('isNameAllowed', () => {
	const allow = parseAllowlist('example.com:443');

	it('checks the name and ignores the port', () => {
		// a lookup carries no port, so a port-qualified entry still matches
		expect(isNameAllowed('example.com', allow)).toBe(true);
		expect(isNameAllowed('api.example.com', allow)).toBe(true);
	});

	it('rejects a name outside the list', () => {
		expect(isNameAllowed('elsewhere.net', allow)).toBe(false);
		expect(isNameAllowed('notexample.com', allow)).toBe(false);
	});

	it('blocks everything when the list is empty', () => {
		expect(isNameAllowed('example.com', [])).toBe(false);
	});

	it('allows everything when the list is null', () => {
		expect(isNameAllowed('example.com', null)).toBe(true);
	});
});

describe('isIpLiteral', () => {
	it('recognises IPv4', () => {
		expect(isIpLiteral('1.2.3.4')).toBe(true);
		expect(isIpLiteral('255.255.255.255')).toBe(true);
	});

	it('recognises IPv6 by its colons', () => {
		expect(isIpLiteral('::1')).toBe(true);
		expect(isIpLiteral('2001:db8::1')).toBe(true);
		expect(isIpLiteral('fe80::1%eth0')).toBe(true);
	});

	it('does not treat a name as a literal', () => {
		expect(isIpLiteral('example.com')).toBe(false);
		expect(isIpLiteral('1.2.3.4.example.com')).toBe(false);
		expect(isIpLiteral('localhost')).toBe(false);
	});

	it('does not treat a partial address as a literal', () => {
		expect(isIpLiteral('1.2.3')).toBe(false);
		expect(isIpLiteral('1.2.3.4.5')).toBe(false);
	});
});
