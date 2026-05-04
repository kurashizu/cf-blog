# cf-blog

A personal blog powered by Cloudflare Workers, featuring an AI agent with tool-calling capabilities.

## Features

- **Blog** - Markdown articles stored in Cloudflare R2
- **KurAgent** - AI assistant with tool calling (web search, code execution, timezone queries)
- **Dark Theme** - Claude-style aesthetic with particle background
- **Multi-language** - English and Japanese support

## Tech Stack

- Next.js (App Router) deployed to Cloudflare Workers via `@opennextjs/cloudflare`
- Cloudflare R2 for article storage
- Cloudflare KV for session management and rate limiting
- MiniMax-M2.7 (OpenAI API) as primary model, Gemini for fallback

## Projects

| Worker | URL | Purpose |
|--------|-----|---------|
| cf-blog | https://blog.022025.xyz | Main blog |
| cf-agent | https://agent.022025.xyz | AI agent |

## Development

```bash
npm run dev          # Local development
npm run build        # Production build
npm run build:cf     # Cloudflare Workers build
```

## AI Agent (cf-agent)

KurAgent supports:
- `@web_search <query>` - Search the web
- `@get_time <timezone>` - Get current time
- `@eval_expression <code>` - Execute JavaScript code

## Deploy

Push to `main` to trigger CI deployment via GitHub Actions.