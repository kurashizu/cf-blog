import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * The audio tests, kept apart from the unit suite on purpose.
 *
 * They need a dev server and a real Chrome, because what they assert is what a
 * patch *sounds* like -- rendered through an OfflineAudioContext in the browser
 * and measured as an amplitude envelope. The unit suite has neither and must
 * stay fast enough to run on every save, so `npm test` does not pull these in.
 *
 * Run with `npm run test:audio` against a dev server on 5182, or point
 * AUDIT_URL somewhere else.
 *
 * They exist because the unit suite structurally cannot see a whole class of
 * bug: it builds patches against a fake context that produces no samples, so
 * "the knob reads zero" is assertable and "the sound stops" is not. A patch
 * whose MAP silently dropped its input passed every unit test at every stage,
 * because MAP still responded to all of its own settings -- only the sound
 * disagreed.
 */
export default defineConfig({
	resolve: {
		alias: {
			/* SvelteKit's own aliases, which its Vite plugin would normally supply
			   and which these tests run without.

			   The audio tests drive the engine through a browser, so for most of
			   this directory nothing on the node side imports from `src/` at all.
			   The preset tests are the exception: they read `SOUND_PRESETS` and
			   `HELD_BACK` directly, because a dynamic `import()` inside
			   `page.evaluate` returns a *different* module instance from the page's
			   own and hands back an empty catalogue with no error. Importing on
			   this side and passing the timbre in as an argument is the only way to
			   drive a test off the same list the app ships. */
			$lib: fileURLToPath(new URL('./src/lib', import.meta.url)),
			'$app/environment': fileURLToPath(
				new URL('./tests/unit/stubs/app-environment.ts', import.meta.url)
			)
		}
	},
	test: {
		include: ['tests/audio/**/*.test.ts'],
		/* A render plus a browser launch; the default 5s is nowhere near enough.
		
		   The per-test default is generous because the truth-table tests are
		   loops: LOGIC's is twenty renders (four operand rows by five ops) and
		   CMP's is twelve, each a real offline render of a held note. Individual
		   tests raise it further where they need to.
		
		   `hookTimeout` covers `beforeAll`, which launches Chrome and waits for
		   the bench to come up -- on a cold start that is seconds, not
		   milliseconds, and a machine under load from three test files at once
		   made a 60s ceiling close enough to matter. One file alone measures
		   108s of test time; when all three run the whole suite is minutes, and a
		   hook that times out fails the *file* rather than any assertion in it,
		   which is how this showed up: a FAIL with no test named. */
		testTimeout: 45000,
		hookTimeout: 120000,
		// One browser, one page, shared: launching Chrome per file costs more
		// than every render in the file put together.
		fileParallelism: false
	}
});
