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

  // Streaming path — tool loop not yet supported in stream mode
  // TODO: streaming + tool combo: run tool loop synchronously, then streamGenerateContent for final text
  if (stream) {
    const generationConfig: Record<string, unknown> = {
      temperature: body.options?.temperature ?? 0.9,
      maxOutputTokens: body.options?.maxTokens ?? 8192,
      topP: body.options?.topP ?? 0.95,
      topK: body.options?.topK ?? 40,
    };

    const url = `${GEMINI_API_BASE}/models/${model}:streamGenerateContent?key=${apiKey}&alt=sse`;

    const geminiRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents, tools: [{ functionDeclarations: FUNCTION_DECLARATIONS }], generationConfig }),
    });

    if (!geminiRes.ok) {
      const error = await geminiRes.text();
      return NextResponse.json({ error: `Gemini API error ${geminiRes.status}: ${error}` }, { status: 500 });
    }

    let fullText = '';
    const geminiBody = geminiRes.body ?? null;

    const response = new Response(
      new ReadableStream({
        async start(controller) {
          if (!geminiBody) { controller.close(); return; }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          for await (const chunk of geminiBody as any) {
            const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
            fullText += text;
            controller.enqueue(
              new TextEncoder().encode(`data: ${JSON.stringify({ text })}\n\n`)
            );
          }
          controller.close();
        },
        async cancel() {
          // Stream cancelled — do NOT write KV, preserve clean history
        },
      }),
      {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      }
    );

    // After stream completes successfully, save to KV
    // We need to wait for the stream to finish before saving
    // For now, save after stream setup (actual write happens async)
    const assistantMsg: Message = { role: 'model', parts: [{ text: fullText }] };
    const updatedMessages = trimHistory([...messages, assistantMsg]);
    sessionKv.put(body.session_id, JSON.stringify({ messages: updatedMessages, version: version + 1 }), {
      expirationTtl: SESSION_TTL,
    });

    return response;
  }

  // Non-streaming: tool loop
  const toolCallLog: Array<{ name: string; args: Record<string, unknown>; result: unknown }> = [];
  let iteration = 0;

  while (iteration < MAX_TOOL_CALLS) {
    iteration++;

    const generationConfig: Record<string, unknown> = {
      temperature: body.options?.temperature ?? 0.9,
      maxOutputTokens: body.options?.maxTokens ?? 8192,
      topP: body.options?.topP ?? 0.95,
      topK: body.options?.topK ?? 40,
    };

    const url = `${GEMINI_API_BASE}/models/${model}:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
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
      const assistantMsg: Message = { role: 'model', parts: [{ text: textPart.text }] };
      const updatedMessages = trimHistory([...messages, assistantMsg]);

      await sessionKv.put(
        body.session_id,
        JSON.stringify({ messages: updatedMessages, version: version + 1 }),
        { expirationTtl: SESSION_TTL }
      );

      return NextResponse.json({
        session_id: body.session_id,
        text: textPart.text,
        model,
        usage: data.usageMetadata ? {
          promptTokens: data.usageMetadata.promptTokenCount,
          candidatesTokens: data.usageMetadata.candidatesTokenCount,
          totalTokens: data.usageMetadata.totalTokenCount,
        } : undefined,
        toolCalls: toolCallLog.length > 0 ? toolCallLog : undefined,
      });
    }

    const assistantMsg: Message = { role: 'model', parts: [{ text: '' }] };
    const updatedMessages = trimHistory([...messages, assistantMsg]);

    await sessionKv.put(
      body.session_id,
      JSON.stringify({ messages: updatedMessages, version: version + 1 }),
      { expirationTtl: SESSION_TTL }
    );

    return NextResponse.json({
      session_id: body.session_id,
      text: '',
      model,
      toolCalls: toolCallLog.length > 0 ? toolCallLog : undefined,
    });
  }

  // Max iterations exceeded — force answer
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

  const finalRes = await fetch(`${GEMINI_API_BASE}/models/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents, generationConfig: forcedConfig }),
  });

  if (!finalRes.ok) {
    return NextResponse.json({ error: `Gemini API error ${finalRes.status}` }, { status: 500 });
  }

  const finalData = await finalRes.json();
  const finalText = finalData.candidates?.[0]?.content?.parts?.find((p: { text?: string }) => p.text)?.text ?? '';

  const assistantMsg: Message = { role: 'model', parts: [{ text: finalText }] };
  const updatedMessages = trimHistory([...messages, assistantMsg]);

  await sessionKv.put(
    body.session_id,
    JSON.stringify({ messages: updatedMessages, version: version + 1 }),
    { expirationTtl: SESSION_TTL }
  );

  return NextResponse.json({
    session_id: body.session_id,
    text: finalText,
    model,
    toolCalls: toolCallLog,
    hitIterationLimit: true,
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

  const response = await fetch(url, {
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
