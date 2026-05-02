import { NextRequest, NextResponse } from 'next/server';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_MODEL = 'gemma-4-31b-it';
const MAX_MESSAGE_LENGTH = 10000;
const MAX_MESSAGES = 50;

interface Message {
  role: 'user' | 'model';
  parts: { text: string }[];
}

function sanitizeMessage(msg: Message): Message {
  return {
    role: msg.role === 'user' || msg.role === 'model' ? msg.role : 'user',
    parts: Array.isArray(msg.parts)
      ? msg.parts
          .filter((p) => p && typeof p.text === 'string')
          .slice(0, 10)
          .map((p) => ({
            text: String(p.text).slice(0, MAX_MESSAGE_LENGTH),
          }))
      : [],
  };
}

function buildContents(messages: Message[]) {
  return messages.map((m) => ({
    role: m.role,
    parts: m.parts,
  }));
}

function buildBody(contents: ReturnType<typeof buildContents>, options?: { model?: string; temperature?: number; maxTokens?: number; topP?: number; topK?: number }) {
  const body: Record<string, unknown> = {
    contents,
  };

  if (options) {
    body.generationConfig = {
      temperature: options.temperature ?? 0.9,
      maxOutputTokens: options.maxTokens ?? 8192,
      topP: options.topP ?? 0.95,
      topK: options.topK ?? 40,
    };
  }

  return body;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { messages, options } = body as {
      messages?: Message[];
      options?: { model?: string; temperature?: number; maxTokens?: number; topP?: number; topK?: number };
    };

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'messages is required and must be an array' }, { status: 400 });
    }

    if (messages.length > MAX_MESSAGES) {
      return NextResponse.json({ error: `Maximum ${MAX_MESSAGES} messages allowed` }, { status: 400 });
    }

    const sanitizedMessages = messages.map(sanitizeMessage).filter((m) => m.parts.length > 0);

    if (sanitizedMessages.length === 0) {
      return NextResponse.json({ error: 'At least one valid message with text content is required' }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const apiKey = (globalThis as any).env?.GEMINI_API_KEY as string | undefined;
    if (!apiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 });
    }

    const model = options?.model || DEFAULT_MODEL;
    const contents = buildContents(sanitizedMessages);
    const requestBody = buildBody(contents, options);

    const url = `${GEMINI_API_BASE}/models/${model}:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json({ error: `Gemini API error ${response.status}: ${error}` }, { status: 500 });
    }

    const data = (await response.json()) as {
      candidates?: { content: { parts: { text: string }[] } }[];
      usageMetadata?: {
        promptTokenCount: number;
        candidatesTokenCount: number;
        totalTokenCount: number;
      };
    };

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

    return NextResponse.json({
      text,
      model,
      usage: data.usageMetadata
        ? {
            promptTokens: data.usageMetadata.promptTokenCount,
            candidatesTokens: data.usageMetadata.candidatesTokenCount,
            totalTokens: data.usageMetadata.totalTokenCount,
          }
        : undefined,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}