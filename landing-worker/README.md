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
- `/synth` — an 8-track WebAudio modular synthesizer workstation (sequencer, piano roll, MIDI input, FX/EQ, oscilloscope/FFT/loudness visualizers, patch save/load). Imports `.mid` files (`src/lib/midi-file.ts`, drag one anywhere onto the page) and bounces the pattern to WAV through an `OfflineAudioContext`. The audio engine (`src/lib/synth.ts`, `src/lib/sound.ts`) is framework-agnostic; everything else is Svelte stores wrapping it.
- `/utils` — twelve browser-side hardware testers: keyboard, mouse, touch/pen, typing, gamepad, reaction, screen, audio out, mic in, camera, net/power, display/system. Audio out and mic in both pick their device (`AudioContext.setSinkId` / a `deviceId` constraint), and mic in records a take, draws it and plays it back. Every value is probed live; anything the browser withholds prints `n/a` rather than a number.
- `/leaderboard` — the Artificial Analysis language-model table, cached by `cache-worker` into D1 and read from `blog.krsz.in/api/llm-leaderboard`. Sortable by intelligence, coding, agentic, blended price, output speed, TTFT or release date.

Shared chrome (tab bar, sidebar, command console, telemetry footer, theme) lives in `src/routes/+layout.svelte` and `src/lib/components/chrome/`.

Hotkeys: `Ctrl+0`-`Ctrl+4` switch view (always, even inside the key-capturing testers), `T` cycles theme, `` ` `` drops the console down over any tab, `?` or `F1` opens the full keymap.

First-time visitors get a six-step guided tour (`Onboarding.svelte`): a spotlight ring around a real element with a bubble anchored beside it, walking through the tabs, the workbench panel, the console button, the sidebar launchpad and the footer's edge readout. Anchors are `data-tour` attributes on the chrome; a step whose anchor is missing at that viewport falls back to a centred bubble. It is offered once per browser, then only via the `[?] GUIDE` button, the `guide` console command, or `keys` for the keymap.

Every page load starts with a short POST screen of real capability probes (GPU renderer string, storage quota, service-worker state, edge PoP) — any key skips it, and it never runs under `prefers-reduced-motion`. Tab switches are client-side navigation, so it does not reappear between views.

The footer reads `/cdn-cgi/trace` and shows the real serving Cloudflare PoP, negotiated protocol and TLS version; `trace` in the console prints the whole record with a browser-measured round trip.

The console is a small shell, reached only as a drop-down (`` ` `` or the `~` button in the tab bar) so no view carries an autofocused input: a read-only virtual filesystem projected from `MODULES` and the live stores (`cd`, `ls`, `cat`, `tree`), pipes into `grep`/`head`/`tail`/`sort`/`uniq`/`wc`, persistent history, `alias`, and `man <cmd>`.

## x86 emulator (`/x86sim`, work in progress)

`5:x86sim` runs [v86](https://github.com/copy/v86) (BSD-2), a 32-bit x86 emulator
that JIT-compiles guest code to WebAssembly, and boots an Alpine x86 ISO on it.
Alpine is the guest because it still ships 32-bit x86 as a release architecture,
which Debian and Arch no longer do.

`src/routes/vm/img/[name]/+server.ts` serves the ISO: upstream sends no CORS
headers, and the proxy also puts the bytes behind Cloudflare's cache. v86 rounds
its Range reads out to `fixed_chunk_size`, so the client and the route agree on
1 MiB chunks and every read lands squarely on one cache entry. Images are
configured as `name|url|size` triples in `VM_IMAGES`, so they can be repointed at
R2 without touching code. `?info` returns metadata; the bare URL requires a Range.

It boots to an Alpine login (`root`, no password). Getting there took four
fixes worth recording: hardware autodetection has to be left out of every
runlevel because it triple-faults the emulator; the SCSI disk driver and its
dependencies must be packed as whole module directories rather than `.ko*`
globs, which land somewhere modprobe does not search; the module has to be
spelled `sd_mod`, since the initramfs's busybox modprobe does not translate
`sd-mod` the way kmod's does; and image URLs carry their size as a version,
because they are served immutable while CI reuses the same R2 keys — without it
the edge keeps serving the previous build and every other fix looks like it
failed.

The BIOS blobs in `static/vm/` come from the v86 repository; SeaBIOS is LGPLv3.

`/utilities` and `/linux` still resolve, as prerendered 308s to the new paths.

## Network relay (`/net`)

`src/routes/net/+server.ts` is the one non-prerendered route: a same-origin
WebSocket front door for an [OmniProxy](https://github.com/kurashizu/OmniProxy)
relay, for the Linux VM view. The browser cannot set `x-proxy-token` on a
WebSocket and a token in the page bundle would be readable by anyone, so the
upstream endpoint and its token live only as Worker secrets and never reach the
client — the page just opens `wss://<origin>/net`.

Because the wire format is `[u32 stream_id][u8 type][payload]`, the relay reads
the CONNECT target straight out of each frame and enforces a destination
allowlist at the edge, without the upstream server knowing about it. A blocked
target is answered with a `TCP_CONNECTED` frame carrying an error string, which
is how the upstream itself reports a failed connect, so the guest sees a clean
refusal rather than a hang.

```bash
npx wrangler secret put OMNIPROXY_URL     # https://host.example/
npx wrangler secret put OMNIPROXY_TOKEN   # sent upstream as x-proxy-token
```

`OMNIPROXY_ALLOW` is not sensitive, so it lives in `wrangler.toml` under
`[vars]` instead — what the relay may reach stays reviewable in git rather than
write-only. Entries are `host` or `host:port`, comma separated; matching is
suffix-at-label-boundary, so `alpinelinux.org` covers `dl-cdn.alpinelinux.org`
but not `evil-alpinelinux.org`. A port-pinned entry matches only that port, and
a frame carrying no port at all (ICMP) matches only entries that pin no port,
so allowing `example.org:443` never silently grants ping.

Unset `OMNIPROXY_URL` makes the route answer 503 and changes nothing else; an
empty allowlist blocks every destination and `"*"` disables the check. Upgrades
without a same-origin `Origin` header are rejected, and `NET_RATE_LIMIT` caps
relay connections per client IP.

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
│   │   ├── midi-file.ts                # Standard MIDI File reader (import)
│   │   ├── wav.ts                      # 16-bit PCM WAV encoder (offline render)
│   │   ├── vfs.ts                      # Console virtual filesystem, projected from MODULES
│   │   ├── links.ts                    # Every open/ping destination
│   │   ├── evaluator.ts                # Sandboxed math expression evaluator (console `eval`)
│   │   ├── songs/                      # Built-in sequencer patterns (data only)
│   │   ├── data/modules.ts             # Project portal content (real facts + Mermaid diagrams)
│   │   ├── routes-map.ts               # Tab index <-> path mapping
│   │   ├── stores/                     # Svelte stores wrapping the synth/sound singletons
│   │   └── components/
│   │       ├── chrome/                 # TabBar, Sidebar, CommandConsole, TelemetryFooter,
│   │       │                           # HotkeyOverlay, BootSequence, Onboarding
│   │       ├── projects/               # ProjectsView + MermaidDiagram
│   │       ├── leaderboard/            # LeaderboardView
│   │       ├── utilities/              # The twelve hardware testers
│   │       ├── x86sim/                 # v86 emulator view
│   │       ├── guestbook/
│   │       ├── hardware/               # RotaryKnob/HardwareFader + shared drag action
│   │       ├── pixel/                  # Inline pixel-art icon set
│   │       └── synth/                  # Transport, track chips, patch manager,
│   │                                   # Modules 1-7, piano roll, keyboard, settings modal
│   └── routes/
│       ├── +layout.svelte              # Shared chrome, theme, hotkeys, global styles import
│       ├── +layout.ts                  # prerender = true
│       ├── +page.svelte, modules/      # Project portal (same content, two paths)
│       ├── utils/, leaderboard/, x86sim/, net/, vm/
│       ├── guestbook/
│       └── synth/
├── static/favicon.svg
├── svelte.config.js                    # adapter-cloudflare, $shared alias
├── vite.config.ts
├── tailwind.config.js
├── wrangler.toml
└── package.json
```
