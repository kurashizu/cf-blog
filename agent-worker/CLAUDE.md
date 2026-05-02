# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working in `agent-worker/`.

## Build & Deploy

```bash
cd agent-worker
npm ci --legacy-peer-deps        # Install dependencies (package-lock.json required)
npm run dev                      # Local development
npm run build:cf                 # Build for Cloudflare Workers
npm run build                    # Standard Next.js build

git push origin main             # Triggers CI — both cf-blog AND cf-agent deploy
```

## Architecture

Separate Next.js Cloudflare Worker (`cf-agent`) — identical `@opennextjs/cloudflare` build system as `cf-blog`.

### Deployment
- Worker name: `cf-agent`
- URL: `https://cf-agent.kurashizu.workers.dev`
- CI deploys both `cf-blog` and `cf-agent` in parallel via parent repo's GitHub Actions

### Comparison with cf-blog

| | cf-blog | cf-agent |
|---|---|---|
| Worker name | `cf-blog` | `cf-agent` |
| Purpose | Main blog | Agent features |
| R2 bucket | Yes | No (yet) |
| Gemini API | Yes | No |

## Key Files

```
agent-worker/
  wrangler.toml        # Worker config
  next.config.js       # Next.js config (standalone output)
  package.json         # Dependencies + scripts
  tsconfig.json        # TypeScript config
  app/
    api/route.ts      # API endpoint (returns stub JSON)
    page.tsx          # Stub homepage
    layout.tsx        # Root layout
```

## CI/CD

Both workers built and deployed in parallel via `.github/workflows/deploy.yml` in parent repo (`cf-blog`):
1. Build cf-blog
2. Build cf-agent (`cd agent-worker && npm ci && npm run build:cf`)
3. Deploy cf-blog
4. Deploy cf-agent
