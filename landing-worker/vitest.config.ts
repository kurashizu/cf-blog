import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Unit tests for the pure-logic modules, and the coverage numbers the CRAP
 * metric reads (see docs/crap.md).
 *
 * Vitest is pinned to 4.x in package.json on purpose: with Vitest 5,
 * @stryker-mutator/vitest-runner@10 completes its dry run but then runs zero
 * tests per mutant, reporting a 0% mutation score for a suite that is green.
 * Re-check that combination before lifting the pin.
 *
 * `include` is deliberately a hand-written list rather than a glob over src/:
 * CRAP is complexity weighted by *coverage*, so pulling untestable files into
 * the denominator would move every score without saying anything about risk.
 * The list holds the modules that are genuinely unit-testable — no SvelteKit
 * runtime ($app/*), no browser globals, no Web Audio. Add a file here in the
 * same commit that adds its tests, never before.
 */
export default defineConfig({
	resolve: {
		alias: {
			// SvelteKit's own aliases, which its Vite plugin would normally
			// supply. Tests run without that plugin, so declare the two the
			// modules under test actually import.
			$lib: fileURLToPath(new URL('./src/lib', import.meta.url)),
			'$app/environment': fileURLToPath(new URL('./tests/unit/stubs/app-environment.ts', import.meta.url))
		}
	},
	test: {
		include: ['tests/unit/**/*.test.ts'],
		coverage: {
			provider: 'v8',
			reporter: ['text', 'json-summary', 'json'],
			reportsDirectory: 'coverage',
			include: [
				'src/lib/evaluator.ts',
				'src/lib/routes-map.ts',
				'src/lib/vm-storage.ts',
				'src/lib/relay-allowlist.ts',
				'src/lib/dns-message.ts',
				'src/lib/omniproxy-protocol.ts',
				'src/lib/stores/text-scale.ts',
				'src/lib/components/krsz-vm/disk-overlay.ts',
				'src/lib/midi-file.ts',
				'src/lib/components/chatbot/markdown.ts',
				'src/lib/components/lifelab/engine.js',
				'src/lib/components/lifelab/patterns.js'
			],
			// Report every listed file, including any with no test yet, so a
			// zero row is visible rather than silently absent.
			all: true
		}
	}
});
