/// <reference types="node" />
/// <reference types="@cloudflare/workers-types" />
/**
 * Model pool with quota-based fallback for Gemini models.
 *
 * Models: ["gemma-4-31b-it", "gemma-4-26b-a4b-it"]
 * Default = pool[0]
 * On TPD 429 (daily quota exhausted) → mark exhausted → try next model
 * On RPM 429 (minute burst) → sleep 1s → retry same model
 */

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const OPENAI_API_BASE = 'https://ai.022025.xyz/v1';
const QUOTA_TTL = 25 * 3600; // 25 hours TTL for quota entries

export interface ModelQuota {
  requests: number;
  exhausted: boolean;
  exhaustedAt?: string;
}

export interface CallOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
}

function getTodayUTC(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString().slice(0, 10);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Parse GEMINI_MODELS env var (JSON array string) */
export function getModelPool(env: { GEMINI_MODELS?: string }): string[] {
  try {
    const raw = env.GEMINI_MODELS ?? '["gemma-4-31b-it"]';
    return JSON.parse(raw) as string[];
  } catch {
    return ['gemma-4-31b-it'];
  }
}

export function getDefaultModel(env: { GEMINI_MODELS?: string }): string {
  const pool = getModelPool(env);
  return pool[0];
}

function quotaKey(model: string): string {
  return `quota:${model}:${getTodayUTC()}`;
}

/** Check if a model is exhausted (quota used up) */
export async function isModelExhausted(
  model: string,
  kv: KVNamespace | undefined
): Promise<boolean> {
  if (!kv) return false;
  try {
    const raw = await kv.get(quotaKey(model), 'json');
    const quota = raw as ModelQuota | null;
    return quota?.exhausted === true;
  } catch {
    return false;
  }
}

/** Mark a model as exhausted (TPD quota hit) */
export async function markModelExhausted(
  model: string,
  kv: KVNamespace | undefined
): Promise<void> {
  if (!kv) return;
  try {
    const key = quotaKey(model);
    const raw = await kv.get(key, 'json');
    const quota = (raw as ModelQuota | null) ?? { requests: 0, exhausted: false };
    quota.exhausted = true;
    quota.exhaustedAt = new Date().toISOString();
    await kv.put(key, JSON.stringify(quota), { expirationTtl: QUOTA_TTL });
  } catch {
    // KV write failure — treat as not exhausted
  }
}

/** Increment request count for a model */
export async function incrementQuota(
  model: string,
  kv: KVNamespace | undefined
): Promise<void> {
  if (!kv) return;
  try {
    const key = quotaKey(model);
    const raw = await kv.get(key, 'json');
    const quota = (raw as ModelQuota | null) ?? { requests: 0, exhausted: false };
    quota.requests = (quota.requests ?? 0) + 1;
    await kv.put(key, JSON.stringify(quota), { expirationTtl: QUOTA_TTL });
  } catch {
    // KV write failure — non-critical
  }
}

/** Detect TPD (daily quota) 429 vs RPM (burst) 429 */
export function isTPDLimit(errBody: unknown): boolean {
  const msg = (errBody as any)?.error?.message || (errBody as any)?.error || '';
  const lower = msg.toLowerCase();
  return lower.includes('quota') || lower.includes('exhausted') || lower.includes('daily') || lower.includes('tpd');
}

/** Check if model uses OpenAI-compatible API */
function isOpenAIModel(model: string): boolean {
  return model.toLowerCase().startsWith('minimax');
}

/** Convert Gemini-style contents to OpenAI messages format */
function convertToOpenAIMessages(
  contents: object[],
  systemInstruction?: string,
): { role: string; content: string | null; tool_call_id?: string; name?: string; tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }> }[] {
  const messages: { role: string; content: string | null; tool_call_id?: string; name?: string; tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }> }[] = [];

  if (systemInstruction) {
    messages.push({ role: 'system', content: systemInstruction });
  }

  for (const c of contents as any[]) {
    if (c.role === 'system') continue;
    // Map 'model' role to 'assistant' for OpenAI compatibility
    let role = c.role === 'model' ? 'assistant' : c.role;

    if (Array.isArray(c.parts)) {
      for (const p of c.parts) {
        if (p.functionResponse) {
          // Gemini functionResponse -> OpenAI tool message
          const funcResp = p.functionResponse;
          messages.push({
            role: 'tool',
            content: typeof funcResp.response === 'string'
              ? funcResp.response
              : JSON.stringify(funcResp.response),
            tool_call_id: funcResp.name,
            name: funcResp.name,
          });
        } else if (p.functionCall) {
          // Gemini functionCall -> OpenAI assistant message with tool_calls
          // Use function name as tool_call_id so tool response can reference it
          messages.push({
            role: 'assistant',
            content: null,
            tool_calls: [{
              id: p.functionCall.name,
              type: 'function',
              function: {
                name: p.functionCall.name,
                arguments: JSON.stringify(p.functionCall.args),
              },
            }],
          });
        } else if (p.text) {
          messages.push({ role, content: p.text });
        }
      }
    } else if (c.content) {
      messages.push({ role, content: c.content });
    }
  }

  return messages;
}

/** Convert Gemini-style function declarations to OpenAI tools format */
function convertToOpenAITools(functionDeclarations: object[] | undefined): object[] | undefined {
  if (!functionDeclarations || functionDeclarations.length === 0) return undefined;
  // Extract functionDeclarations array from Gemini's { functionDeclarations: [...] } wrapper
  const declarations = (functionDeclarations[0] as any)?.functionDeclarations ?? functionDeclarations;
  return declarations.map((decl: any) => ({
    type: 'function',
    function: {
      name: decl.name,
      description: decl.description,
      parameters: decl.parameters,
    },
  }));
}

/** Make a single OpenAI-compatible API call */
async function fetchOpenAI(
  apiKey: string,
  model: string,
  contents: object[],
  options?: CallOptions,
  systemInstruction?: string,
  tools?: object[]
): Promise<Response> {
  // Convert Gemini-style contents/messages to OpenAI format
  const messages = convertToOpenAIMessages(contents, systemInstruction);
  const openaiTools = convertToOpenAITools(tools);

  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: options?.temperature ?? 0.9,
    max_tokens: options?.maxTokens ?? 8192,
    top_p: options?.topP ?? 0.95,
  };
  if (openaiTools && openaiTools.length > 0) body.tools = openaiTools;

  const url = `${OPENAI_API_BASE}/chat/completions`;
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
}

/** Make a single Gemini API call */
async function fetchGemini(
  apiKey: string,
  model: string,
  contents: object[],
  options?: CallOptions,
  systemInstruction?: string,
  tools?: object[]
): Promise<Response> {
  const generationConfig: Record<string, unknown> = {
    temperature: options?.temperature ?? 0.9,
    maxOutputTokens: options?.maxTokens ?? 8192,
    topP: options?.topP ?? 0.95,
    topK: options?.topK ?? 40,
  };

  const body: Record<string, unknown> = { contents, generationConfig };
  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] };
  }
  if (tools && tools.length > 0) {
    body.tools = tools;
  }

  const url = `${GEMINI_API_BASE}/models/${model}:generateContent?key=${apiKey}`;
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * Call with model pool fallback.
 * Routes to OpenAI API for MiniMax models, Gemini API for others.
 * On 429: retries same model once after 1s for RPM, marks exhausted for TPD and tries next.
 */
export async function callWithFallback(
  apiKey: string,
  openaiApiKey: string,
  models: string[],
  contents: object[],
  options?: CallOptions,
  kv?: KVNamespace,
  systemInstruction?: string,
  tools?: object[]
): Promise<{ response: Response; model: string; hitIterationLimit?: boolean }> {
  let hitIterationLimit = false;

  for (const model of models) {
    if (await isModelExhausted(model, kv)) continue;

    // Route to OpenAI or Gemini based on model
    const fetcher = isOpenAIModel(model) ? fetchOpenAI : fetchGemini;
    const key = isOpenAIModel(model) ? openaiApiKey : apiKey;

    // First attempt
    let resp = await fetcher(key, model, contents, options, systemInstruction, tools);

    // RPM 429: retry same model once after 1s
    if (resp.status === 429) {
      const errBody = await resp.clone().json().catch(() => ({}));
      if (!isTPDLimit(errBody)) {
        await sleep(1000);
        resp = await fetcher(key, model, contents, options, systemInstruction, tools);
      }
    }

    // Still 429 after retry: check if TPD → mark exhausted, try next model
    if (resp.status === 429) {
      const errBody = await resp.clone().json().catch(() => ({}));
      if (isTPDLimit(errBody)) {
        await markModelExhausted(model, kv);
        continue;
      }
    }

    if (resp.ok) {
      await incrementQuota(model, kv);
    }

    return { response: resp, model, hitIterationLimit };
  }

  // All models exhausted
  return {
    response: new Response(
      JSON.stringify({ error: 'All model quotas exhausted', retryAfter: 3600 }),
      { status: 429, headers: { 'Content-Type': 'application/json' } }
    ),
    model: models[0],
  };
}

/** Make a single OpenAI-compatible streaming API call */
async function streamOpenAI(
  apiKey: string,
  model: string,
  contents: object[],
  options?: CallOptions,
  systemInstruction?: string,
  tools?: object[]
): Promise<Response> {
  // Convert Gemini-style contents/messages and tools to OpenAI format
  const messages = convertToOpenAIMessages(contents, systemInstruction);
  const openaiTools = convertToOpenAITools(tools);

  const body: Record<string, unknown> = {
    model,
    messages,
    stream: true,
    temperature: options?.temperature ?? 0.9,
    max_tokens: options?.maxTokens ?? 8192,
    top_p: options?.topP ?? 0.95,
  };
  if (openaiTools && openaiTools.length > 0) body.tools = openaiTools;

  const url = `${OPENAI_API_BASE}/chat/completions`;
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
}

/** Streaming variant — uses streamGenerateContent but cycles models on TPD 429 */
export async function streamWithFallback(
  apiKey: string,
  openaiApiKey: string,
  models: string[],
  contents: object[],
  options?: CallOptions,
  kv?: KVNamespace,
  systemInstruction?: string,
  tools?: object[]
): Promise<{ response: Response; model: string }> {
  for (const model of models) {
    if (await isModelExhausted(model, kv)) continue;

    // Route to OpenAI or Gemini based on model
    if (isOpenAIModel(model)) {
      const resp = await streamOpenAI(openaiApiKey, model, contents, options, systemInstruction, tools);

      if (resp.status === 429) {
        const errBody = await resp.clone().json().catch(() => ({}));
        if (isTPDLimit(errBody)) {
          await markModelExhausted(model, kv);
          continue;
        }
      }

      if (resp.ok) {
        await incrementQuota(model, kv);
      }

      return { response: resp, model };
    }

    // Gemini streaming
    const generationConfig: Record<string, unknown> = {
      temperature: options?.temperature ?? 0.9,
      maxOutputTokens: options?.maxTokens ?? 8192,
      topP: options?.topP ?? 0.95,
      topK: options?.topK ?? 40,
    };

    const body: Record<string, unknown> = { contents, generationConfig };
    if (systemInstruction) {
      body.systemInstruction = { parts: [{ text: systemInstruction }] };
    }
    if (tools && tools.length > 0) {
      body.tools = tools;
    }

    const streamUrl = `${GEMINI_API_BASE}/models/${model}:streamGenerateContent?key=${apiKey}&alt=sse`;
    const resp = await fetch(streamUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (resp.status === 429) {
      const errBody = await resp.clone().json().catch(() => ({}));
      if (isTPDLimit(errBody)) {
        await markModelExhausted(model, kv);
        continue;
      }
    }

    if (resp.ok) {
      await incrementQuota(model, kv);
    }

    return { response: resp, model };
  }

  return {
    response: new Response(
      JSON.stringify({ error: 'All model quotas exhausted', retryAfter: 3600 }),
      { status: 429, headers: { 'Content-Type': 'application/json' } }
    ),
    model: models[0],
  };
}
