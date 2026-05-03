import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { executeTool, FUNCTION_DECLARATIONS } from '@/lib/tools';
import { checkBurst, checkDailyKV, getIP } from '@/lib/ratelimiter';
import { callWithFallback, streamWithFallback, getModelPool, getDefaultModel } from '@/lib/model-pool';

const MAX_TOOL_CALLS = 5;
const MAX_HISTORY_TURNS = 20;
const SESSION_TTL = 3600;
const BURST_LIMIT = 2;
const BURST_PERIOD = 10;
const DAILY_LIMIT = 100;

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx = getCloudflareContext() as any;
    const env = ctx.env as {
      GEMINI_API_KEY: string;
      SESSION_KV: KVNamespace;
      CHAT_RATE_LIMIT?: RateLimit;
      GEMINI_MODELS?: string;
    };

    if (!env.GEMINI_API_KEY) {
      return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 });
    }

    const ip = getIP(request);

    // 1. CF Rate Limiter burst check (2/10s)
    const burstResp = await checkBurst(env.CHAT_RATE_LIMIT, ip, BURST_LIMIT, BURST_PERIOD);
    if (burstResp) return burstResp;

    // 2. KV daily check (100/IP)
    const dailyResp = await checkDailyKV(env.SESSION_KV, 'chat', ip, DAILY_LIMIT);
    if (dailyResp) return dailyResp;

    const body = await request.json() as {
      session_id?: string;
      message?: string;
      messages?: Message[];
      options?: { model?: string; temperature?: number; maxTokens?: number; topP?: number; topK?: number; stream?: boolean };
    };

    // New API: session_id + message
    if (body.session_id && body.message) {
      return handleSessionChat({
        env,
        session_id: body.session_id,
        message: body.message,
        options: body.options,
      });
    }

    // Legacy API: messages array
    if (body.messages && Array.isArray(body.messages)) {
      return handleLegacyChat({
        env,
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

async function handleSessionChat(
  body: {
    env: {
      GEMINI_API_KEY: string;
      SESSION_KV: KVNamespace;
      GEMINI_MODELS?: string;
    };
    session_id: string;
    message: string;
    options?: { model?: string; temperature?: number; maxTokens?: number; topP?: number; topK?: number; stream?: boolean };
  }
) {
  const { env, session_id, message, options } = body;
  const modelPool = getModelPool(env);
  const defaultModel = getDefaultModel(env);

  // Load session history from KV
  let stored: KVSession | null = null;
  try {
    const raw = await env.SESSION_KV.get(session_id, 'json');
    if (raw) stored = raw as KVSession;
  } catch {
    // KV read failure — start fresh
  }

  const messages: Message[] = stored?.messages ?? [];
  const version = stored?.version ?? 0;

  // Append user message
  const userMsg: Message = {
    role: 'user',
    parts: [{ text: String(message).slice(0, 10000) }],
  };
  messages.push(userMsg);

  const contents = messages.map((m) => ({ role: m.role, parts: m.parts }));

  // Non-streaming: run tool loop, save KV, return JSON
  if (!options?.stream) {
    const toolCallLog: Array<{ name: string; args: Record<string, unknown>; result: unknown }> = [];
    let iteration = 0;
    let finalText = '';
    let hitIterationLimit = false;
    let selectedModel = defaultModel;

    while (iteration < MAX_TOOL_CALLS) {
      iteration++;

      const { response: resp, model } = await callWithFallback(
        env.GEMINI_API_KEY,
        modelPool,
        contents,
        { ...options, model: options?.model || defaultModel },
        env.SESSION_KV,
        undefined,
        [{ functionDeclarations: FUNCTION_DECLARATIONS }]
      );
      selectedModel = model;

      if (!resp.ok) {
        return NextResponse.json({ error: `Gemini API error ${resp.status}: ${await resp.text()}` }, { status: 500 });
      }

      const data = (await resp.json()) as {
        candidates?: {
          content: { parts: { text?: string; functionCall?: { name: string; args: Record<string, unknown> } }[] };
        }[];
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

      const { response: finalRes } = await callWithFallback(
        env.GEMINI_API_KEY,
        modelPool,
        contents,
        options,
        env.SESSION_KV,
        undefined,
        undefined
      );

      if (!finalRes.ok) {
        return NextResponse.json({ error: `Gemini API error ${finalRes.status}` }, { status: 500 });
      }

      const finalData = await finalRes.json() as { candidates?: { content: { parts: { text?: string }[] } }[] };
      finalText = finalData.candidates?.[0]?.content?.parts?.find((p) => p.text)?.text ?? '';
    }

    // Save session state
    const assistantMsg: Message = { role: 'model', parts: [{ text: finalText }] };
    const updatedMessages = trimHistory([...messages, assistantMsg]);
    await env.SESSION_KV.put(session_id, JSON.stringify({ messages: updatedMessages, version: version + 1 }), {
      expirationTtl: SESSION_TTL,
    });

    return NextResponse.json({
      session_id,
      text: finalText,
      model: selectedModel,
      toolCalls: toolCallLog.length > 0 ? toolCallLog : undefined,
      hitIterationLimit,
    });
  }

  // Streaming: tool loop + SSE events run inside ReadableStream.start()
  if (options?.stream) {
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        const enqueue = (obj: object) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        };

        // Run tool loop inside stream — enqueue tool_start/tool_result events
        const localContents = [...contents];
        const toolCallLog: Array<{ name: string; args: Record<string, unknown>; result: unknown }> = [];
        let iter = 0;
        let text = '';
        let hitIterLimit = false;
        let selectedModel = defaultModel;

        while (iter < MAX_TOOL_CALLS) {
          iter++;
          const { response: resp, model } = await callWithFallback(
            env.GEMINI_API_KEY, modelPool, localContents,
            { ...options, model: options?.model || defaultModel },
            env.SESSION_KV,
            undefined,
            [{ functionDeclarations: FUNCTION_DECLARATIONS }]
          );
          selectedModel = model;

          if (!resp.ok) {
            enqueue({ type: 'error', error: await resp.text() });
            controller.close();
            return;
          }

          const data = await resp.json() as {
            candidates?: {
              content: { parts: { text?: string; functionCall?: { name: string; args: Record<string, unknown> } }[] };
            }[];
          };
          const parts = data.candidates?.[0]?.content?.parts || [];
          const fcPart = parts.find((p) => p.functionCall);
          const txtPart = parts.find((p) => p.text);

          if (fcPart) {
            const fc = fcPart.functionCall!;
            enqueue({ type: 'tool_start', tool: fc.name, args: fc.args, iteration: iter });
            const result = await executeTool(fc.name, fc.args);
            enqueue({ type: 'tool_result', tool: fc.name, result, success: true, iteration: iter });
            toolCallLog.push({ name: fc.name, args: fc.args, result });

            // Gemini function calling format — use functionCall/functionResponse parts
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            localContents.push({ role: 'model', parts: [{ functionCall: { name: fc.name, args: fc.args } } as any] });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            localContents.push({ role: 'user', parts: [{ functionResponse: { name: fc.name, response: { result } } } as any] });
            continue;
          }

          if (txtPart?.text) {
            text = txtPart.text;
            break;
          }
          text = '';
          break;
        }

        // Max iterations exceeded
        if (!text && iter >= MAX_TOOL_CALLS) {
          hitIterLimit = true;
          localContents.push({
            role: 'user',
            parts: [{ text: 'Please provide your answer based on the tool results gathered so far. Do not call any more tools.' }],
          });
        }

        // Stream final text from localContents (includes tool results)
        const { response: streamResp } = await streamWithFallback(
          env.GEMINI_API_KEY, modelPool,
          localContents,
          { ...options, model: selectedModel },
          env.SESSION_KV,
          undefined, // no system instruction
          [{ functionDeclarations: FUNCTION_DECLARATIONS }]
        );

        if (!streamResp.ok) {
          enqueue({ type: 'error', error: await streamResp.text() });
          controller.close();
          return;
        }

        const geminiBody = streamResp.body;
        if (!geminiBody) { controller.close(); return; }
        const reader = geminiBody.getReader();
        const decoder = new TextDecoder();

        let streamedText = '';  // accumulate streamed text for KV write

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const raw = decoder.decode(value, { stream: true });
          const lines = raw.split('\n').filter((l) => l.startsWith('data: '));
          for (const line of lines) {
            try {
              const json = JSON.parse(line.slice(6));
              const chunk = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
              if (chunk) {
                streamedText += chunk;
                enqueue({ type: 'text', text: chunk });
              }
            } catch { /* skip malformed */ }
          }
        }

        enqueue({ type: 'done', hitIterationLimit: hitIterLimit, toolCalls: toolCallLog });

        // Write session to KV on stream completion — use streamedText (actual complete output)
        const assistantText = streamedText || text;
        if (assistantText) {
          messages.push({ role: 'model', parts: [{ text: assistantText }] });
          await env.SESSION_KV.put(session_id, JSON.stringify({
            messages: trimHistory(messages),
            version: version + 1,
          }), { expirationTtl: SESSION_TTL });
        }
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }
}

async function handleLegacyChat(
  body: {
    env: {
      GEMINI_API_KEY: string;
      GEMINI_MODELS?: string;
    };
    messages?: Message[];
    options?: { model?: string; temperature?: number; maxTokens?: number; topP?: number; topK?: number; stream?: boolean };
  }
) {
  const { env, messages, options } = body;
  const modelPool = getModelPool(env);
  const defaultModel = getDefaultModel(env);

  const sanitizedMessages = (messages ?? []).map(sanitizeMessage).filter((m) => m.parts.length > 0);
  if (sanitizedMessages.length === 0) {
    return NextResponse.json({ error: 'At least one valid message is required' }, { status: 400 });
  }

  const contents = sanitizedMessages.map((m) => ({ role: m.role, parts: m.parts }));

  const { response: resp } = await callWithFallback(
    env.GEMINI_API_KEY,
    modelPool,
    contents,
    { ...options, model: options?.model || defaultModel },
    undefined, // no KV for legacy chat
    undefined, // no system instruction
    [{ functionDeclarations: FUNCTION_DECLARATIONS }]
  );

  if (!resp.ok) {
    const error = await resp.text();
    return NextResponse.json({ error: `Gemini API error ${resp.status}: ${error}` }, { status: 500 });
  }

  const data = await resp.json() as { candidates?: { content: { parts: { text?: string }[] } }[] };
  const text = data.candidates?.[0]?.content?.parts?.find((p) => p.text)?.text ?? '';

  return NextResponse.json({ text, model: defaultModel });
}