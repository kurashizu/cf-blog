# cf-landing

Apex-domain portal (`krsz.in` / `www.krsz.in`), styled as a fake `tmux` terminal workstation. Fully prerendered SvelteKit, served as static assets from a Cloudflare Worker.

## Stack

- SvelteKit 2 with Svelte 5 (runes mode)
- `@sveltejs/adapter-cloudflare`, fully prerendered (`export const prerender = true`) — every route ships as static HTML, the Worker only exists as a fallback for unmatched paths
- TypeScript
- Vite
- Tailwind CSS 3
- [Mermaid](https://mermaid.js.org) for the per-project architecture diagrams on `/modules`, loaded client-side only

## Pages

- `/` and `/modules` — project portal: a card grid of the real subdomains (`blog`, `agent`, `share`, `sharetube`, `mail`, `skill`), each with verified real facts and a Mermaid flowchart/sequence diagram of how it actually works. No fabricated metrics.
- `/guestbook` — posts to `blog.krsz.in`'s guestbook API.
- `/synth` — an 8-track WebAudio modular synthesizer workstation (sequencer, piano roll, MIDI input, FX/EQ, oscilloscope/FFT/loudness visualizers, patch save/load). The audio engine (`src/lib/synth.ts`, `src/lib/sound.ts`) is framework-agnostic; everything else is Svelte stores wrapping it.

Shared chrome (tab bar, sidebar, command console, telemetry footer, theme, hotkeys `0`-`2` + `T`) lives in `src/routes/+layout.svelte` and `src/lib/components/chrome/`.

## Local Development

```bash
cd landing-worker
npm ci
npm run dev               # http://localhost:3456
```

## Build & Type-check

```bash
npm run build:cf          # svelte-check + vite build -> .svelte-kit/cloudflare/
```

## Deploy

```bash
npx wrangler deploy
```

Or push to `main` — the `deploy-landing` GitHub Actions job (`npm ci --legacy-peer-deps` → `npm run build:cf` → `wrangler deploy`) handles it automatically.

## Custom Domains

Configured in the Cloudflare Dashboard (Workers → cf-landing → Settings → Triggers → Custom Domains) — bind the apex and `www.apex`. The apex domain is centralized in `../shared/site-config.ts` (`APEX_DOMAIN`), imported here via the `$shared` alias (see `svelte.config.js`) for the subdomain links that exist there (`blog`, `agent`, `share`, `mail`). `sharetube`/`rules`/`gh`/`hf`/`oshwhub` links are hardcoded since they're not part of that shared config.

`wrangler.toml` points `main` at the adapter's built worker (`.svelte-kit/cloudflare/_worker.js`) and `[assets]` at its static output — since every route is prerendered, real traffic is served directly from the assets binding and essentially never invokes the worker script.

## File Map

```
landing-worker/
├── src/
│   ├── app.html                        # Root shell (fonts, meta)
│   ├── app.css                         # Tailwind entry + design tokens
│   ├── lib/
│   │   ├── synth.ts, sound.ts          # Framework-agnostic WebAudio engines (singletons)
│   │   ├── evaluator.ts                # Sandboxed math expression evaluator (console `eval`)
│   │   ├── songs/                      # Built-in sequencer patterns (data only)
│   │   ├── data/modules.ts             # Project portal content (real facts + Mermaid diagrams)
│   │   ├── routes-map.ts               # Tab index <-> path mapping
│   │   ├── stores/                     # Svelte stores wrapping the synth/sound singletons
│   │   └── components/
│   │       ├── chrome/                 # TabBar, Sidebar, CommandConsole, TelemetryFooter
│   │       ├── projects/               # ProjectsView + MermaidDiagram
│   │       ├── guestbook/
│   │       ├── hardware/               # RotaryKnob/HardwareFader + shared drag action
│   │       ├── pixel/                  # Inline pixel-art icon set
│   │       └── synth/                  # Transport, track chips, patch manager,
│   │                                   # Modules 1-7, piano roll, keyboard, settings modal
│   └── routes/
│       ├── +layout.svelte              # Shared chrome, theme, hotkeys, global styles import
│       ├── +layout.ts                  # prerender = true
│       ├── +page.svelte, modules/      # Project portal (same content, two paths)
│       ├── guestbook/
│       └── synth/
├── static/favicon.svg
├── svelte.config.js                    # adapter-cloudflare, $shared alias
├── vite.config.ts
├── tailwind.config.js
├── wrangler.toml
└── package.json
```
