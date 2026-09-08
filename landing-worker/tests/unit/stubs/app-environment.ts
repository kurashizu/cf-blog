/**
 * Stand-in for `$app/environment` — SvelteKit's Vite plugin supplies the real
 * one, and unit tests run without that plugin.
 *
 * `browser` is false: these tests exercise pure logic, and the modules under
 * test use the flag to guard localStorage and other browser-only work, which
 * should stay skipped here.
 */
export const browser = false;
export const dev = false;
export const building = false;
export const version = 'test';
