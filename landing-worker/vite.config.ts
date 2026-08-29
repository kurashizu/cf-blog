import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

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
  server: {
    port: 3456,
    host: true,
    fs: {
      allow: ['..']
    }
  }
});
