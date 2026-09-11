import { defineConfig } from 'vitest/config';

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
	test: {
		include: ['tests/audio/**/*.test.ts'],
		// A render plus a browser launch; the default 5s is not enough.
		testTimeout: 45000,
		hookTimeout: 60000,
		// One browser, one page, shared: launching Chrome per file costs more
		// than every render in the file put together.
		fileParallelism: false
	}
});
