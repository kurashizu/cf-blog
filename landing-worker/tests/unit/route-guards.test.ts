import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The filename guards on the public asset routes.
 *
 * Each of these routes turns a URL segment into an R2 key, so the guard is the
 * only thing between a caller and a composed key. The patterns are duplicated
 * here rather than imported: they are three lines inside route handlers that
 * also need `platform`, `error()` and a live bucket, none of which a unit test
 * can supply. Copying them buys a test that fails loudly if the originals are
 * ever loosened — if you change a route, change the twin here in the same
 * commit and the shared cases below will tell you whether it still holds.
 *
 * Sources:
 *   src/routes/model/[file]/+server.ts
 *   src/routes/vm/qemu/[file]/+server.ts
 */

/** src/routes/model/[file]/+server.ts */
function modelGuard(file: string): 'model' | 'runtime' | null {
	const isModel = /^[A-Za-z0-9._-]+\.gguf$/.test(file) && !file.includes('..');
	const isRuntime = /^wllama\.wasm$/.test(file);
	if (isModel) return 'model';
	if (isRuntime) return 'runtime';
	return null;
}

/** src/routes/vm/qemu/[file]/+server.ts */
function qemuGuard(file: string): 'binary' | 'rom' | null {
	const isBinary = /^qemu-system-x86_64(\.wasm|\.worker\.js|\.js)$/.test(file);
	const isRom = /^pc-bios-[A-Za-z0-9_.-]+$/.test(file) && !file.includes('..');
	if (isBinary) return 'binary';
	if (isRom) return 'rom';
	return null;
}

/** Inputs no asset route may ever accept, whatever else it allows. */
const HOSTILE = [
	['parent traversal', '../secret'],
	['nested traversal', '../../etc/passwd'],
	['traversal mid-name', 'a/../../b'],
	['absolute path', '/etc/passwd'],
	['backslash path', '..\\windows\\system32'],
	['bare dot-dot', '..'],
	['empty', ''],
	['url-encoded traversal', '%2e%2e%2fsecret'],
	['null byte', 'model.gguf\u0000.txt'],
	['tab', 'model.gguf\tkey'],
	['newline', 'model.gguf\nkey'],
	['leading slash', '/model.gguf'],
	['nested slash', 'gguf/model.gguf'],
	['space', 'model .gguf']
] as const;

describe('model route guard', () => {
	it('accepts a plain weights filename', () => {
		expect(modelGuard('qwen2.5-0.5b-instruct-q4_k_m.gguf')).toBe('model');
		expect(modelGuard('model.gguf')).toBe('model');
		expect(modelGuard('a-b_c.1.gguf')).toBe('model');
	});

	it('accepts the runtime wasm by exact name', () => {
		expect(modelGuard('wllama.wasm')).toBe('runtime');
	});

	it.each(HOSTILE)('rejects %s', (_label, file) => {
		expect(modelGuard(file)).toBeNull();
	});

	it('rejects a traversal that also ends in .gguf', () => {
		// the extension is not enough on its own -- this is what the explicit
		// `..` check is for, since a dot is otherwise a legal name character
		expect(modelGuard('..%2f..%2fsecret.gguf')).toBeNull();
		expect(modelGuard('../evil.gguf')).toBeNull();
		expect(modelGuard('..evil.gguf')).toBeNull();
	});

	it('rejects any other extension', () => {
		expect(modelGuard('model.bin')).toBeNull();
		expect(modelGuard('model.gguf.txt')).toBeNull();
		expect(modelGuard('other.wasm')).toBeNull();
	});

	it('reads a .gguf name as weights even when it resembles the runtime', () => {
		// harmless: it is still a bare name, so the key stays under gguf/
		expect(modelGuard('wllama.wasm.gguf')).toBe('model');
	});

	it('rejects a name that is only the extension', () => {
		expect(modelGuard('.gguf')).toBeNull();
	});
});

describe('qemu route guard', () => {
	it('accepts the three built binaries by exact name', () => {
		expect(qemuGuard('qemu-system-x86_64.wasm')).toBe('binary');
		expect(qemuGuard('qemu-system-x86_64.js')).toBe('binary');
		expect(qemuGuard('qemu-system-x86_64.worker.js')).toBe('binary');
	});

	it('accepts a prefixed ROM name', () => {
		expect(qemuGuard('pc-bios-bios-256k.bin')).toBe('rom');
		expect(qemuGuard('pc-bios-vgabios.bin')).toBe('rom');
	});

	it.each(HOSTILE)('rejects %s', (_label, file) => {
		expect(qemuGuard(file)).toBeNull();
	});

	it('rejects a ROM name that tries to climb out', () => {
		// the prefix is stripped to build the key, so a traversal after it would
		// otherwise escape qemu/pc-bios/
		expect(qemuGuard('pc-bios-../../secret')).toBeNull();
		expect(qemuGuard('pc-bios-..')).toBeNull();
	});

	it('rejects a binary name that only starts right', () => {
		expect(qemuGuard('qemu-system-x86_64.wasm.evil')).toBeNull();
		expect(qemuGuard('qemu-system-x86_64')).toBeNull();
		expect(qemuGuard('xqemu-system-x86_64.wasm')).toBeNull();
	});

	it('rejects the ROM prefix with nothing after it', () => {
		expect(qemuGuard('pc-bios-')).toBeNull();
	});

	it('rejects a slash inside a ROM name', () => {
		expect(qemuGuard('pc-bios-sub/dir.bin')).toBeNull();
	});
});

describe('the copies still match the routes', () => {
	/* The guards above are duplicated from the route handlers, which cannot be
	   imported here. That is only safe if the duplicates are the same text, so
	   read the routes and check. A rename or a rewrite fails this rather than
	   silently leaving the tests guarding a pattern nobody runs. */
	const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

	it('model route still uses the pattern this file tests', () => {
		const src = read('src/routes/model/[file]/+server.ts');
		expect(src).toContain('/^[A-Za-z0-9._-]+\\.gguf$/');
		expect(src).toContain("!file.includes('..')");
		expect(src).toContain('/^wllama\\.wasm$/');
	});

	it('qemu route still uses the pattern this file tests', () => {
		const src = read('src/routes/vm/qemu/[file]/+server.ts');
		expect(src).toContain('/^qemu-system-x86_64(\\.wasm|\\.worker\\.js|\\.js)$/');
		expect(src).toContain('/^pc-bios-[A-Za-z0-9_.-]+$/');
		expect(src).toContain("!file.includes('..')");
	});

	it('both routes still reject before touching the bucket', () => {
		for (const p of ['src/routes/model/[file]/+server.ts', 'src/routes/vm/qemu/[file]/+server.ts']) {
			const src = read(p);
			// the 404 has to come before the bucket is read, or a composed key
			// reaches R2 whatever the guard decided
			expect(src.indexOf("error(404")).toBeLessThan(src.indexOf('bucket.get'));
		}
	});
});
