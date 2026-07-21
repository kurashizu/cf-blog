"use client";

import { useEffect, useState } from "react";

interface ToolSummary {
  name: string;
  description: string;
  example: string;
  parameters?: object;
}

interface ToolListResponse {
  tools?: ToolSummary[];
  functionDeclarations?: {
    name: string;
    description: string;
    parameters?: object;
  }[];
}

const ENDPOINTS = [
  {
    method: "POST" as const,
    path: "/api/chat",
    summary: "Streamed chat with tool-calling loop",
    rateLimit: "2 / 10s burst · 100 / day per IP",
    request: `{
  "session_id": "user-abc-123",
  "message": "What time is it in Tokyo?",
  "options": {
    "temperature": 0.9,
    "maxTokens": 8192
  }
}`,
    response: `Content-Type: text/event-stream

data: {"type":"start_process","content":""}
data: {"type":"start_think","content":"User wants Tokyo time."}
data: {"type":"think","content":"Calling get_time tool."}
data: {"type":"end_think","content":""}
data: {"type":"tool_start","tool":"get_time","args":{"timezone":"Asia/Tokyo"},"iteration":1}
data: {"type":"tool_result","tool":"get_time","result":{"time":"2026-07-21 22:14 JST"},"success":true}
data: {"type":"end_tool","content":"tool executed successfully"}
data: {"type":"start_text","content":"It's "}
data: {"type":"text","content":"22:14 JST in Tokyo."}
data: {"type":"end_text","content":""}
data: {"type":"end_process","content":"done, hitIterationLimit: false, toolCalls: 1"}`,
  },
  {
    method: "GET" as const,
    path: "/api/tool",
    summary: "List all registered tools",
    rateLimit: "No rate limit (read-only)",
    request: `curl https://agent.krsz.in/api/tool`,
    response: `{
  "tools": [
    {
      "name": "get_time",
      "description": "Get current time in a timezone",
      "example": "{\\"timezone\\": \\"Asia/Tokyo\\"}"
    }
  ],
  "functionDeclarations": [
    {
      "name": "get_time",
      "description": "Get current time in a timezone",
      "parameters": { /* JSON Schema */ }
    }
  ]
}`,
  },
  {
    method: "POST" as const,
    path: "/api/tool",
    summary: "Execute a tool directly (no LLM)",
    rateLimit: "10 / 10s burst · 200 / day per IP",
    request: `{
  "name": "get_time",
  "args": { "timezone": "Asia/Tokyo" }
}`,
    response: `{
  "success": true,
  "tool": "get_time",
  "result": {
    "time": "2026-07-21 22:14:11 JST",
    "timezone": "Asia/Tokyo",
    "utc": "2026-07-21T13:14:11.000Z"
  }
}`,
  },
];

const SSE_EVENTS = [
  { type: "start_process", when: "First", desc: "Stream opened, processing started." },
  { type: "start_think / think / end_think", when: "Optional", desc: "Model's internal reasoning (filtered from final text)." },
  { type: "tool_start", when: "Optional", desc: "Model decided to call a tool. Carries tool name + args." },
  { type: "tool_result", when: "After tool_start", desc: "Tool execution finished. result + success." },
  { type: "end_tool", when: "After tool_result", desc: "Tool block closed." },
  { type: "start_text / text / end_text", when: "Final", desc: "User-visible response (think blocks excluded)." },
  { type: "end_process", when: "Last", desc: "Stream complete. Reports hitIterationLimit and toolCalls count." },
  { type: "error", when: "On failure", desc: "Model or tool error. Stream still closes cleanly." },
];

const STACK = [
  { label: "Runtime", value: "Cloudflare Workers · @opennextjs/cloudflare · Next.js 15" },
  { label: "Model pool", value: "gemma-4-31b-it → gemma-4-26b-a4b-it (TPD fallback)" },
  { label: "Session store", value: "KV (1h TTL, last 20 turns trimmed per turn)" },
  { label: "Tool timeout", value: "TOOL_TIMEOUT_MS env var, default 5 000 ms" },
  { label: "Max tool calls", value: "5 iterations per chat request" },
];

export function ApiDocs() {
  const [tools, setTools] = useState<ToolSummary[] | null>(null);
  const [toolError, setToolError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/tool")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: ToolListResponse) => {
        if (cancelled) return;
        setTools(data.tools ?? []);
      })
      .catch((e) => {
        if (cancelled) return;
        setToolError(e instanceof Error ? e.message : "Failed to load");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="min-h-screen bg-[#0a0a0f] text-[#e8e8ed]">
      <div className="mx-auto max-w-5xl px-6 py-16">
        {/* Header */}
        <header className="mb-12">
          <div className="flex items-center gap-3">
            <span className="h-3 w-3 rounded-full bg-[#ff6b35] shadow-[0_0_12px_#ff6b35]" />
            <h1 className="text-3xl font-bold tracking-tight">
              <span className="text-[#ff6b35]">cf-agent</span>{" "}
              <span className="text-[#e8e8ed]/80">· API documentation</span>
            </h1>
          </div>
          <p className="mt-3 text-[#e8e8ed]/60">
            Cloudflare Worker hosting <strong className="text-[#e8e8ed]">KurAgent</strong>,
            an AI assistant with tool calling. All endpoints accept JSON, return JSON
            or Server-Sent Events, and are rate-limited per IP.
          </p>
          <div className="mt-4 inline-flex items-center gap-2 rounded border border-[#ff6b35]/30 bg-[#ff6b35]/5 px-3 py-1.5 text-sm">
            <span className="text-[#e8e8ed]/50">Base URL</span>
            <code className="text-[#ff6b35]">https://agent.krsz.in</code>
          </div>
        </header>

        {/* Try it interactively */}
        <aside className="mb-12 rounded border border-[#ff6b35]/30 bg-gradient-to-br from-[#ff6b35]/10 to-transparent p-5">
          <div className="flex flex-wrap items-start gap-4">
            <div className="flex-1 min-w-[240px]">
              <div className="flex items-center gap-2">
                <span className="rounded bg-[#ff6b35]/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#ff6b35]">
                  Try it
                </span>
                <h3 className="text-base font-semibold text-[#e8e8ed]">
                  Want a chat UI instead of curl?
                </h3>
              </div>
              <p className="mt-2 text-sm text-[#e8e8ed]/70">
                Open{" "}
                <a
                  href="https://blog.krsz.in"
                  className="text-[#ff6b35] underline decoration-[#ff6b35]/40 underline-offset-2 hover:decoration-[#ff6b35]"
                >
                  blog.krsz.in
                </a>
                , scroll to the <strong className="text-[#e8e8ed]">Gadgets</strong>{" "}
                section, and click the{" "}
                <strong className="text-[#e8e8ed]">KurAgent</strong> card. It opens
                a full-screen chat with the same tools and session memory — no
                setup required.
              </p>
              <p className="mt-2 text-xs text-[#e8e8ed]/50">
                This page is for integrating the API into your own apps. The blog
                UI is for trying it out.
              </p>
            </div>
            <a
              href="https://blog.krsz.in"
              className="inline-flex items-center gap-2 rounded bg-[#ff6b35] px-4 py-2 text-sm font-semibold text-[#0a0a0f] transition-colors hover:bg-[#ff7d4d]"
            >
              Open KurAgent
              <span aria-hidden>→</span>
            </a>
          </div>
        </aside>

        {/* Stack */}
        <Section title="Stack" id="stack">
          <dl className="grid gap-3 sm:grid-cols-2">
            {STACK.map((s) => (
              <div
                key={s.label}
                className="rounded border border-[#e8e8ed]/10 bg-[#e8e8ed]/[0.02] px-4 py-3"
              >
                <dt className="text-xs uppercase tracking-wider text-[#e8e8ed]/40">
                  {s.label}
                </dt>
                <dd className="mt-1 text-sm text-[#e8e8ed]">{s.value}</dd>
              </div>
            ))}
          </dl>
        </Section>

        {/* Endpoints */}
        <Section title="Endpoints" id="endpoints">
          <div className="space-y-6">
            {ENDPOINTS.map((ep) => (
              <EndpointCard key={ep.path + ep.method} {...ep} />
            ))}
          </div>
        </Section>

        {/* SSE events */}
        <Section title="SSE event order (/api/chat)" id="sse">
          <p className="mb-4 text-sm text-[#e8e8ed]/60">
            Events are JSON-encoded on lines starting with{" "}
            <code className="text-[#ff6b35]">data:</code>. The stream always ends
            with <code className="text-[#ff6b35]">end_process</code> or{" "}
            <code className="text-[#ff6b35]">error</code>.
          </p>
          <div className="overflow-hidden rounded border border-[#e8e8ed]/10">
            <table className="w-full text-sm">
              <thead className="bg-[#e8e8ed]/[0.04] text-left text-xs uppercase tracking-wider text-[#e8e8ed]/50">
                <tr>
                  <th className="px-4 py-2 font-medium">Event</th>
                  <th className="px-4 py-2 font-medium">When</th>
                  <th className="px-4 py-2 font-medium">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e8e8ed]/5">
                {SSE_EVENTS.map((e) => (
                  <tr key={e.type} className="hover:bg-[#e8e8ed]/[0.02]">
                    <td className="px-4 py-2 font-mono text-xs text-[#ff6b35]">
                      {e.type}
                    </td>
                    <td className="px-4 py-2 text-[#e8e8ed]/60">{e.when}</td>
                    <td className="px-4 py-2 text-[#e8e8ed]/80">{e.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        {/* Tools */}
        <Section title="Available tools" id="tools">
          <p className="mb-4 text-sm text-[#e8e8ed]/60">
            Loaded live from{" "}
            <code className="text-[#ff6b35]">GET /api/tool</code>. Tools run with a
            5 s default timeout and may invoke external services (Brave Search, etc.).
          </p>
          {tools === null && !toolError && (
            <div className="rounded border border-[#e8e8ed]/10 bg-[#e8e8ed]/[0.02] px-4 py-6 text-center text-sm text-[#e8e8ed]/50">
              Loading tools…
            </div>
          )}
          {toolError && (
            <div className="rounded border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-300">
              Couldn&apos;t reach <code>/api/tool</code>: {toolError}
            </div>
          )}
          {tools && tools.length === 0 && (
            <div className="rounded border border-[#e8e8ed]/10 bg-[#e8e8ed]/[0.02] px-4 py-6 text-center text-sm text-[#e8e8ed]/50">
              No tools registered.
            </div>
          )}
          {tools && tools.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2">
              {tools.map((t) => (
                <ToolCard key={t.name} tool={t} />
              ))}
            </div>
          )}
        </Section>

        {/* Footer */}
        <footer className="mt-16 border-t border-[#e8e8ed]/10 pt-6 text-xs text-[#e8e8ed]/40">
          <p>
            cf-agent · Cloudflare Workers ·{" "}
            <a
              className="text-[#ff6b35] hover:underline"
              href="/api/tool"
              target="_blank"
              rel="noreferrer"
            >
              JSON
            </a>{" "}
            · CORS enabled for all origins
          </p>
        </footer>
      </div>
    </main>
  );
}

function Section({
  title,
  id,
  children,
}: {
  title: string;
  id: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mb-12 scroll-mt-6">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
        <span className="h-px w-6 bg-[#ff6b35]" />
        {title}
      </h2>
      {children}
    </section>
  );
}

function EndpointCard(props: {
  method: "GET" | "POST";
  path: string;
  summary: string;
  rateLimit: string;
  request: string;
  response: string;
}) {
  return (
    <article className="rounded border border-[#e8e8ed]/10 bg-[#e8e8ed]/[0.02]">
      <header className="flex flex-wrap items-center gap-3 border-b border-[#e8e8ed]/10 px-4 py-3">
        <span
          className={`rounded px-2 py-0.5 font-mono text-xs font-bold ${
            props.method === "GET"
              ? "bg-blue-500/15 text-blue-300"
              : "bg-[#ff6b35]/15 text-[#ff6b35]"
          }`}
        >
          {props.method}
        </span>
        <code className="font-mono text-sm text-[#e8e8ed]">{props.path}</code>
        <span className="ml-auto text-xs text-[#e8e8ed]/50">{props.rateLimit}</span>
      </header>
      <div className="px-4 py-3 text-sm text-[#e8e8ed]/80">{props.summary}</div>
      <div className="grid gap-px border-t border-[#e8e8ed]/10 bg-[#e8e8ed]/10 sm:grid-cols-2">
        <CodeBlock label="Request" code={props.request} />
        <CodeBlock label="Response" code={props.response} />
      </div>
    </article>
  );
}

function ToolCard({ tool }: { tool: ToolSummary }) {
  return (
    <article className="rounded border border-[#e8e8ed]/10 bg-[#e8e8ed]/[0.02] p-4">
      <div className="flex items-center gap-2">
        <code className="font-mono text-sm font-semibold text-[#ff6b35]">
          {tool.name}
        </code>
      </div>
      <p className="mt-1 text-sm text-[#e8e8ed]/70">{tool.description}</p>
      {tool.example && (
        <pre className="mt-3 overflow-x-auto rounded bg-[#0a0a0f] px-3 py-2 font-mono text-xs text-[#e8e8ed]/80">
          {tool.example}
        </pre>
      )}
    </article>
  );
}

function CodeBlock({ label, code }: { label: string; code: string }) {
  return (
    <div className="bg-[#0a0a0f]">
      <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#e8e8ed]/40">
        {label}
      </div>
      <pre className="overflow-x-auto px-3 pb-3 font-mono text-xs text-[#e8e8ed]/85">
        {code}
      </pre>
    </div>
  );
}
