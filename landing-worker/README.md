# cf-landing

Minimal portal page deployed to `022025.xyz` and `www.022025.xyz`. Single full-screen view with an animated aurora background and one CTA button.

## Stack

- Next.js 15.3.3
- `@opennextjs/cloudflare` 1.19
- Tailwind CSS 3.4

## Local Development

```bash
cd landing-worker
npm ci --legacy-peer-deps
npm run dev               # http://localhost:3000
```

## Build for Cloudflare

```bash
cd landing-worker
npm run build:cf
```

## Deploy

```bash
cd landing-worker
npx wrangler deploy
```

Or push to `main` — the `deploy-landing` GitHub Actions job handles it automatically.

## Custom Domains

Configure in the Cloudflare Dashboard (Workers → cf-landing → Settings → Triggers → Custom Domains):

- `022025.xyz`
- `www.022025.xyz`

The `wrangler.toml` does **not** declare routes on purpose — domain routing is dashboard-managed.

## File Map

```
landing-worker/
├── app/
│   ├── layout.tsx        # Inter font + globals.css
│   ├── page.tsx          # Single-screen hero: title + subtitle + button
│   ├── globals.css       # Aurora background, hero title, button styles
│   ├── not-found.tsx     # 404 with back-to-blog CTA
│   └── icon.tsx          # Generated favicon
└── wrangler.toml         # No routes, no bindings
```