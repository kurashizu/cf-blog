# cf-landing

Minimal apex-domain portal (e.g. `krsz.in` and `www.krsz.in`), rendered as a "technical schematic" of 4 destinations. Pure prerendered SvelteKit, served from Cloudflare Workers' assets binding.

## Stack

- SvelteKit 2 with Svelte 5
- `@sveltejs/adapter-cloudflare` (full Workers, not Pages)
- TypeScript
- Vite 5
- Wrangler 3

## Page composition

- `src/routes/+layout.ts` — `prerender = true`, so the entire site is static HTML + a tiny hydration chunk
- `src/routes/+page.svelte` — assembles all chrome (crosshairs, edge ticks, header, title block, bottom-left meta, axis labels, cursor dot, and the 2×2 portal grid)
- `src/lib/portals.ts` — portal config, URLs imported from `$shared/site-config` (so changing `APEX_DOMAIN` there cascades)
- `src/lib/time.ts` — browser-derived timezone + UTC offset + current year
- `src/lib/components/` — one Svelte component per UI element

## Local Development

```bash
cd landing-worker
npm ci
npm run dev               # http://localhost:5173
```

## Build for Cloudflare

```bash
cd landing-worker
npm run build:cf          # produces .svelte-kit/cloudflare/
```

## Deploy

```bash
cd landing-worker
npx wrangler deploy
```

Or push to `main` — the `deploy-landing` GitHub Actions job handles it automatically.

## Custom Domains

Configured in the Cloudflare Dashboard (Workers → cf-landing → Settings → Triggers → Custom Domains). The apex domain is centralized in `shared/site-config.ts` (`APEX_DOMAIN`, `LANDING_URL`, `LANDING_WWW_URL`) — bind the apex and `www.apex` for whatever `APEX_DOMAIN` resolves to.

The `wrangler.toml` does **not** declare routes on purpose — domain routing is dashboard-managed.

## File Map

```
landing-worker/
├── src/
│   ├── app.html                       # Root HTML (Google Fonts preconnect)
│   ├── app.d.ts                       # SvelteKit type defs
│   ├── lib/
│   │   ├── styles/global.css          # Tokens, body, blueprint grid background
│   │   ├── portals.ts                 # 4 portal config (URLs from $shared)
│   │   ├── time.ts                    # Browser TZ + year helpers
│   │   └── components/
│   │       ├── CornerCrosshair.svelte # Registration marks
│   │       ├── EdgeTicks.svelte       # Ruler ticks
│   │       ├── Header.svelte          # Top header (project / rev)
│   │       ├── TitleBlock.svelte      # Bottom-right metadata box
│   │       ├── MetaBL.svelte          # Bottom-left (EST. + timezone)
│   │       ├── AxisLabel.svelte       # Vertical edge labels
│   │       ├── CursorDot.svelte       # Orange cursor follower
│   │       ├── PortalIcon.svelte      # Inline SVG icons
│   │       ├── Module.svelte          # Single portal module
│   │       └── Grid.svelte            # 2x2 grid of modules + center cross
│   └── routes/
│       ├── +layout.svelte             # Global styles import
│       ├── +layout.ts                 # prerender = true
│       ├── +page.svelte               # Main portal schematic
│       └── +error.svelte              # 404
├── static/
│   └── favicon.svg
├── svelte.config.js
├── vite.config.ts
├── tsconfig.json
├── wrangler.toml
└── package.json
```
