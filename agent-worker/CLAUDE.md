# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working in `agent-worker/`.

## Build & Deploy

```bash
cd agent-worker
npm ci --legacy-peer-deps
npm run dev          # Local development
npm run build:cf     # Build for Cloudflare Workers (NEVER use this directly)

git push origin main # Push to GitHub to trigger Cloudflare deployment via GitHub Actions
```

## Architecture

This is a separate Next.js Cloudflare Worker (`cf-agent`) alongside `cf-blog`. It uses identical `@opennextjs/cloudflare` build system.

Currently a stub worker — future agent features will be implemented here.

## Key Files

- `agent-worker/wrangler.toml` — Worker config, name: `cf-agent`
- `agent-worker/app/api/route.ts` — Stub API endpoint

## Difference from cf-blog

| | cf-blog | cf-agent |
|---|---|---|
| Worker name | `cf-blog` | `cf-agent` |
| Purpose | Main blog | Agent features |
| R2 bucket | Yes | No (yet) |

## CI/CD

Both workers are built and deployed in parallel via `.github/workflows/deploy.yml` in the **main repo** (`cf-blog`).
