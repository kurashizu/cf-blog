import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { FUNCTION_DECLARATIONS, executeTool } from '@/lib/tools';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_MODEL = 'gemma-4-31b-it';
const MAX_TOOL_CALLS = 5;
const MAX_HISTORY_TURNS = 20;
const SESSION_TTL = 3600;

interface Message {
  role: 'user' | 'model' | 'system';
  parts: { text: string }[];
}

interface KVSession {
  messages: Message[];
  version: number;
}

function sanitizeMessage(msg: Message): Message {
  return {
    role: msg.role === 'user' || msg.role === 'model' || msg.role === 'system' ? msg.role : 'user',
    parts: Array.isArray(msg.parts)
      ? msg.parts.filter((p) => p && typeof p.text === 'string').map((p) => ({
          text: String(p.text).slice(0, 10000),
        }))
      : [],
  };
}

function trimHistory(messages: Message[]): Message[] {
  const limit = MAX_HISTORY_TURNS * 2;
  if (messages.length <= limit) return messages;
  const firstRole = messages[0]?.role;
  if (firstRole === 'system') {
    const [first, ...rest] = messages;
    return [first, ...rest.slice(-(limit - 1))];
  }
  return messages.slice(-limit);
}

export async function OPTIONS() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      session_id?: string;
      message?: string;
      messages?: Message[];
      options?: { model?: string; temperature?: number; maxTokens?: number; topP?: number; topK?: number; stream?: boolean };
    };

    // New API: session_id + message
    if (body.session_id && body.message) {
      return handleSessionChat({
        session_id: body.session_id,
        message: body.message,
        options: body.options,
      });
    }

    // Legacy API: messages array
    if (body.messages && Array.isArray(body.messages)) {
      return handleLegacyChat({
        messages: body.messages,
        options: body.options,
      });
    }

    return NextResponse.json(
      { error: 'Either { session_id, message } or { messages } is required' },
      { status: 400 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 2): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, options);
      // Retry on 500 errors only
      if (res.status >= 500 && attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000));
        continue;
      }
      return res;
    } catch (e) {
      lastError = e as Error;
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000));
      }
    }
  }
  throw lastError ?? new Error('Request failed after retries');
}

async function handleSessionChat(
  body: {
    session_id: string;
    message: string;
    options?: { model?: string; temperature?: number; maxTokens?: number; topP?: number; topK?: number; stream?: boolean };
  }
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ctx = getCloudflareContext() as any;
  const apiKey = ctx.env?.GEMINI_API_KEY as string | undefined;
  const sessionKv = ctx.env?.SESSION_KV;

  if (!apiKey) {
    return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 });
  }

  if (!sessionKv) {
    return NextResponse.json({ error: 'SESSION_KV not configured' }, { status: 500 });
  }

  const model = body.options?.model || DEFAULT_MODEL;
  const stream = body.options?.stream ?? false;

  // Load session history from KV
  let stored: KVSession | null = null;
  try {
    const raw = await sessionKv.get(body.session_id, 'json');
    if (raw) stored = raw as KVSession;
  } catch {
    // KV read failure — start fresh
  }

  const messages: Message[] = stored?.messages ?? [];
  const version = stored?.version ?? 0;

  // Append user message
  const userMsg: Message = {
    role: 'user',
    parts: [{ text: String(body.message).slice(0, 10000) }],
  };
  messages.push(userMsg);

  const contents = messages.map((m) => ({ role: m.role, parts: m.parts }));

  // Tool loop always runs synchronously (non-streaming generateContent)
  const toolCallLog: Array<{ name: string; args: Record<string, unknown>; result: unknown }> = [];
  let iteration = 0;
  let finalText = '';
  let hitIterationLimit = false;

  while (iteration < MAX_TOOL_CALLS) {
    iteration++;

    const generationConfig: Record<string, unknown> = {
      temperature: body.options?.temperature ?? 0.9,
      maxOutputTokens: body.options?.maxTokens ?? 8192,
      topP: body.options?.topP ?? 0.95,
      topK: body.options?.topK ?? 40,
    };

    const url = `${GEMINI_API_BASE}/models/${model}:generateContent?key=${apiKey}`;

    const response = await fetchWithRetry(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        tools: [{ functionDeclarations: FUNCTION_DECLARATIONS }],
        generationConfig,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json({ error: `Gemini API error ${response.status}: ${error}` }, { status: 500 });
    }

    const data = (await response.json()) as {
      candidates?: {
        content: { parts: { text?: string; functionCall?: { name: string; args: Record<string, unknown> } }[] };
      }[];
      usageMetadata?: {
        promptTokenCount: number;
        candidatesTokenCount: number;
        totalTokenCount: number;
      };
    };

    const parts = data.candidates?.[0]?.content?.parts || [];
    const functionCallPart = parts.find((p) => p.functionCall);
    const textPart = parts.find((p) => p.text);

    if (functionCallPart) {
      const fc = functionCallPart.functionCall!;
      const result = await executeTool(fc.name, fc.args);
      toolCallLog.push({ name: fc.name, args: fc.args, result });

      contents.push({ role: 'model', parts: [{ text: '' }] });
      contents.push({
        role: 'user',
        parts: [{ text: JSON.stringify({ name: fc.name, args: fc.args, result }) }],
      });

      continue;
    }

    if (textPart?.text) {
      finalText = textPart.text;
      break;
    }

    finalText = '';
    break;
  }

  // Max iterations exceeded — force answer without tools
  if (!finalText && iteration >= MAX_TOOL_CALLS) {
    hitIterationLimit = true;
    contents.push({
      role: 'user',
      parts: [{
        text: 'Please provide your answer based on the tool results gathered so far. Do not call any more tools.',
      }],
    });

    const forcedConfig: Record<string, unknown> = {
      temperature: body.options?.temperature ?? 0.9,
      maxOutputTokens: body.options?.maxTokens ?? 8192,
      topP: body.options?.topP ?? 0.95,
      topK: body.options?.topK ?? 40,
    };

    const finalRes = await fetchWithRetry(
      `${GEMINI_API_BASE}/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents, generationConfig: forcedConfig }),
      }
    );

    if (!finalRes.ok) {
      return NextResponse.json({ error: `Gemini API error ${finalRes.status}` }, { status: 500 });
    }

    const finalData = await finalRes.json();
    finalText = finalData.candidates?.[0]?.content?.parts?.find((p: { text?: string }) => p.text)?.text ?? '';
  }

  // Save session state before streaming response
  const assistantMsg: Message = { role: 'model', parts: [{ text: finalText }] };
  const updatedMessages = trimHistory([...messages, assistantMsg]);
  sessionKv.put(body.session_id, JSON.stringify({ messages: updatedMessages, version: version + 1 }), {
    expirationTtl: SESSION_TTL,
  });

  // Streaming: final text output via streamGenerateContent (no tools)
  if (stream) {
    const generationConfig: Record<string, unknown> = {
      temperature: body.options?.temperature ?? 0.9,
      maxOutputTokens: body.options?.maxTokens ?? 8192,
      topP: body.options?.topP ?? 0.95,
      topK: body.options?.topK ?? 40,
    };

    const streamUrl = `${GEMINI_API_BASE}/models/${model}:streamGenerateContent?key=${apiKey}&alt=sse`;

    // Use contents with the assistant message included for streaming
    const streamContents = messages.map((m) => ({ role: m.role, parts: m.parts }));
    streamContents.push({ role: 'model', parts: [{ text: finalText }] });

    const geminiRes = await fetchWithRetry(streamUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: streamContents, generationConfig }),
    });

    if (!geminiRes.ok) {
      const error = await geminiRes.text();
      return NextResponse.json({ error: `Gemini API error ${geminiRes.status}: ${error}` }, { status: 500 });
    }

    const geminiBody = geminiRes.body ?? null;

    return new Response(
      new ReadableStream({
        async start(controller) {
          if (!geminiBody) { controller.close(); return; }
          const reader = geminiBody.getReader();
          const decoder = new TextDecoder();

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const raw = decoder.decode(value, { stream: true });
            const lines = raw.split('\n').filter((l) => l.startsWith('data: '));
            for (const line of lines) {
              try {
                const json = JSON.parse(line.slice(6));
                const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
                controller.enqueue(
                  new TextEncoder().encode(`data: ${JSON.stringify({ text })}\n\n`)
                );
              } catch {
                // Skip malformed lines
              }
            }
          }
          controller.close();
        },
        async cancel() {
          // Stream cancelled — preserve clean history (already saved above)
        },
      }),
      {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      }
    );
  }

  // Non-streaming response
  return NextResponse.json({
    session_id: body.session_id,
    text: finalText,
    model,
    toolCalls: toolCallLog.length > 0 ? toolCallLog : undefined,
    hitIterationLimit,
  });
}

async function handleLegacyChat(
  body: {
    messages?: Message[];
    options?: { model?: string; temperature?: number; maxTokens?: number; topP?: number; topK?: number; stream?: boolean };
  }
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ctx = getCloudflareContext() as any;
  const apiKey = ctx.env?.GEMINI_API_KEY as string | undefined;
  if (!apiKey) {
    return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 });
  }

  const messages = (body.messages ?? []).map(sanitizeMessage).filter((m) => m.parts.length > 0);
  if (messages.length === 0) {
    return NextResponse.json({ error: 'At least one valid message is required' }, { status: 400 });
  }

  const model = body.options?.model || DEFAULT_MODEL;
  const contents = messages.map((m) => ({ role: m.role, parts: m.parts }));

  // Simple non-streaming path for legacy API
  const generationConfig: Record<string, unknown> = {
    temperature: body.options?.temperature ?? 0.9,
    maxOutputTokens: body.options?.maxTokens ?? 8192,
    topP: body.options?.topP ?? 0.95,
    topK: body.options?.topK ?? 40,
  };

  const url = `${GEMINI_API_BASE}/models/${model}:generateContent?key=${apiKey}`;

    const response = await fetchWithRetry(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents, tools: [{ functionDeclarations: FUNCTION_DECLARATIONS }], generationConfig }),
    });

  if (!response.ok) {
    const error = await response.text();
    return NextResponse.json({ error: `Gemini API error ${response.status}: ${error}` }, { status: 500 });
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.find((p: { text?: string }) => p.text)?.text ?? '';

  return NextResponse.json({ text, model });
}
