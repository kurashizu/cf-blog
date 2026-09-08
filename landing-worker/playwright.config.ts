import { defineConfig, devices } from '@playwright/test';

/**
 * Accessibility gate: axe-core over every view at three widths, plus a few
 * keyboard journeys (skip link, dialogs, menus, sliders). Runs against the
 * Vite dev server -- adapter-cloudflare has no `vite preview`, and what axe
 * inspects is the rendered DOM, which is the same either way.
 *
 *   npx playwright test            # all
 *   npx playwright test --ui       # pick and watch
 */
export default defineConfig({
	testDir: 'tests/a11y',
	// Per-run output dir so parallel audits (one per area) do not wipe each other:
	//   PW_OUT=test-results-synth npx playwright test --grep /synth
	outputDir: process.env.PW_OUT ?? 'test-results',
	timeout: 90_000,
	fullyParallel: false,
	workers: 1,
	retries: 0,
	reporter: [['list']],
	use: {
		baseURL: 'http://localhost:4180',
		...devices['Desktop Chrome'],
		// The Chrome already on the machine, never a downloaded Chromium:
		// PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD is set in .npmrc so an install
		// cannot pull one in either.
		channel: 'chrome',
		// No boot screen, no transitions: the tests look at the settled page.
		reducedMotion: 'reduce'
	},
	webServer: {
		command: 'npm run dev -- --port 4180 --strictPort',
		url: 'http://localhost:4180/modules',
		reuseExistingServer: true,
		timeout: 120_000
	}
});
