import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { execSync } from 'node:child_process';

/**
 * Build stamp shown bottom-right of every page (TelemetryFooter), so the
 * live site says which commit it is. Read from git at build time; CI's
 * shallow checkout still has HEAD. GITHUB_SHA is the fallback in case git
 * itself is unavailable, "unknown" if neither is. A local build with
 * uncommitted changes gets "-dirty" so it can't be mistaken for the commit.
 */
function git(cmd: string): string | undefined {
  try {
    return execSync(`git ${cmd}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return undefined;
  }
}
const fullSha = git('rev-parse HEAD') ?? process.env.GITHUB_SHA ?? '';
const dirty = git('status --porcelain') ? '-dirty' : '';
const shortSha = fullSha ? fullSha.slice(0, 7) + dirty : 'unknown';
const builtAt = new Date();
const builtAtSydney = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Australia/Sydney',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false
})
  .format(builtAt)
  .replace(',', '');

/**
 * The QEMU machine needs SharedArrayBuffer, which a browser hands out only to a
 * cross-origin isolated page. In production `_headers` grants that to /krsz-vm;
 * the dev server has no such file, so without this the machine fails locally
 * with the one error it cannot recover from and the page looks broken only here.
 */
const isolation = {
  name: 'krsz-cross-origin-isolation',
  configureServer(server: { middlewares: { use: (fn: unknown) => void } }) {
    server.middlewares.use(
      (
        req: { url?: string },
        res: { setHeader(name: string, value: string): void },
        next: () => void
      ) => {
        if (req.url?.startsWith('/krsz-vm')) {
          res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
          res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
        }
        next();
      }
    );
  }
};

export default defineConfig({
  plugins: [sveltekit(), isolation],
  define: {
    __BUILD_COMMIT__: JSON.stringify(shortSha),
    __BUILD_COMMIT_FULL__: JSON.stringify(fullSha),
    __BUILD_TIME__: JSON.stringify(builtAt.toISOString()),
    __BUILD_TIME_SYDNEY__: JSON.stringify(builtAtSydney)
  },
  server: {
    port: 3456,
    host: true,
    fs: {
      allow: ['..']
    }
  }
});
