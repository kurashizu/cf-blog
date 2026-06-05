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
| `eval_expression` | Safe JS expression evaluator (recursive-descent, no eval/Function) | `{ code: string }` |
| `web_search` | Brave Search API for web queries | `{ q: string }` |
| `get_time` | Get current time in timezone | `{ timezone?: string }` |

## API Endpoints

### GET /api/tool
Returns all tools with names, descriptions, examples, and Gemini `functionDeclarations`.

### POST /api/tool
Execute a tool directly: `{ "name": "eval_expression", "args": { "code": "1+2" } }`
Returns `{ "success": true, "result": "3", "tool": "eval_expression" }`

### POST /api/chat
Gemini tool-calling loop with streaming SSE. Default model: `gemma-4-31b-it`.

SSE events: `start_process` → optional tool calls (`tool_start`/`tool_result`/`end_tool`) → `start_text`/`text`/`end_text` → `end_process`

Max 5 tool call iterations to prevent infinite loops.

## Key Files

```
agent-worker/
  lib/
    tools/
      index.ts           # exports TOOLS, FUNCTION_DECLARATIONS, executeTool()
      eval-expression.ts # JS eval (recursive-descent parser, no eval/Function)
      web-search.ts      # Brave Search API
      get-time.ts        # Timezone time
    evaluator.ts         # Safe expression parser
    model-pool.ts        # Gemini model pool with TPD/RPM fallback
  app/api/
    tool/route.ts        # GET list tools, POST execute tool
    chat/route.ts        # Streaming chat with tool-calling loop, filters <think>...</think>
  wrangler.toml          # GEMINI_MODELS env var, KV/rate limit bindings
```

## CI/CD

GitHub Actions builds cf-blog then cf-agent sequentially. Deploys in parallel:
1. Build cf-blog
2. Build cf-agent (`cd agent-worker && npm ci && npm run build:cf`)
3. Deploy cf-blog + cf-agent in parallel
