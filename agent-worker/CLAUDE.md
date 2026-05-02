# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working in `agent-worker/`.

## Build & Deploy

```bash
cd agent-worker
npm ci --legacy-peer-deps        # Install dependencies (package-lock.json required)
npm run dev                      # Local development
npm run build:cf                 # Build for Cloudflare Workers
npm run build                    # Standard Next.js build

npx wrangler deploy              # Direct deploy (faster than CI)
git push origin main            # Triggers CI — both cf-blog AND cf-agent deploy
```

## Architecture

Separate Next.js Cloudflare Worker (`cf-agent`) — identical `@opennextjs/cloudflare` build system as `cf-blog`.

### Deployment
- Worker name: `cf-agent`
- URL: `https://agent.022025.xyz`
- CI deploys both `cf-blog` and `cf-agent` in parallel via parent repo's GitHub Actions

### Comparison with cf-blog

| | cf-blog | cf-agent |
|---|---|---|
| Worker name | `cf-blog` | `cf-agent` |
| Purpose | Main blog | Agent with tool calling |
| R2 bucket | Yes | No |
| Gemini API | Yes (llm proxy) | Yes (for chat) |

## Tool System

All tools live under `lib/tools/` and are manually imported (fs.readdirSync does NOT work in Cloudflare Workers).

### Adding a New Tool

1. Create `lib/tools/<tool-name>.ts` following the Tool interface
2. Import and add to `lib/tools/index.ts` TOOL_LIST array
3. No other changes needed — `/api/tool` and `/api/chat` auto-discover via the registry

### Tool Interface

```typescript
interface Tool {
  name: string;           // "eval_expression"
  description: string;    // Human-readable description for Gemini
  example: string;        // Example usage JSON
  parameters: object;     // JSON Schema for Gemini functionDeclaration
  execute(args: Record<string, unknown>): Promise<unknown>;
}
```

### Available Tools

| Tool | Description | Parameters |
|---|---|---|
| `eval_expression` | Safe JS expression evaluator | `{ code: string }` |
| `fetch_webpage` | Fetch URL, convert HTML→Markdown | `{ url: string }` |
| `get_time` | Get current time in timezone | `{ timezone?: string }` |

## API Endpoints

### GET /api/tool
Returns all tools with names, descriptions, examples, and Gemini `functionDeclarations`.

### POST /api/tool
Execute a tool directly: `{ "name": "eval_expression", "args": { "code": "1+2" } }`
Returns `{ "success": true, "result": "3", "tool": "eval_expression" }`

### POST /api/chat
Gemini tool-calling loop:
1. Send message with `tools: { functionDeclarations }`
2. Model may respond with `functionCall` parts
3. Execute via `executeTool(name, args)`, return `functionResponse`
4. Max 5 iterations to prevent infinite loops
5. Default model: `gemma-4-31b-it`

## Key Files

```
agent-worker/
  lib/
    tools/
      index.ts           # exports TOOLS, FUNCTION_DECLARATIONS, executeTool()
      eval-expression.ts # JS eval tool (safe recursive-descent parser, no eval/Function)
      fetch-webpage.ts   # HTTP fetch + HTML→Markdown (500KB max, 10s timeout)
      get-time.ts        # Timezone time (UTC fallback)
    evaluator.ts         # Safe expression parser
    html-to-md.ts        # Regex-based HTML→Markdown converter
  app/
    api/
      tool/route.ts      # GET list tools, POST execute tool
      chat/route.ts     # Gemini tool-calling loop
  wrangler.toml          # GEMINI_API_KEY secret binding
```

## CI/CD

Both workers built and deployed in parallel via `.github/workflows/deploy.yml` in parent repo (`cf-blog`):
1. Build cf-blog
2. Build cf-agent (`cd agent-worker && npm ci && npm run build:cf`)
3. Deploy cf-blog
4. Deploy cf-agent

Direct deploy bypasses CI: `cd agent-worker && npm run build:cf && npx wrangler deploy`
