import { NextRequest, NextResponse } from 'next/server';
import {
  generateContentWithContext,
  generateContentStreamWithContext,
  type GeminiMessage,
  type GeminiGenerateOptions,
} from '@/lib/gemini';

const MAX_MESSAGE_LENGTH = 10000;
const MAX_MESSAGES = 50;
const ALLOWED_MODELS = ['gemini-2.5-flash-lite', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.0-pro-exp'];
const MAX_TOKENS = 8192;
const MAX_TEMPERATURE = 1.5;

function sanitizeMessage(msg: GeminiMessage): GeminiMessage {
  return {
    role: msg.role === 'user' || msg.role === 'model' ? msg.role : 'user',
    parts: Array.isArray(msg.parts) ? msg.parts.filter(p => p && typeof p.text === 'string').slice(0, 10).map(p => ({
      text: String(p.text).slice(0, MAX_MESSAGE_LENGTH)
    })) : []
  };
}

function sanitizeOptions(options?: GeminiGenerateOptions): GeminiGenerateOptions | undefined {
  if (!options) return undefined;
  return {
    model: ALLOWED_MODELS.includes(options.model || '') ? options.model : 'gemini-2.5-flash-lite',
    temperature: typeof options.temperature === 'number' ? Math.min(Math.max(options.temperature, 0), MAX_TEMPERATURE) : 0.9,
    maxTokens: typeof options.maxTokens === 'number' ? Math.min(Math.max(options.maxTokens, 1), MAX_TOKENS) : MAX_TOKENS,
    topP: typeof options.topP === 'number' ? Math.min(Math.max(options.topP, 0), 1) : 0.95,
    topK: typeof options.topK === 'number' ? Math.min(Math.max(options.topK, 1), 100) : 40,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { messages, stream, options } = body as {
      messages?: GeminiMessage[];
      stream?: boolean;
      options?: GeminiGenerateOptions;
    };

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: 'messages is required and must be an array' },
        { status: 400 }
      );
    }

    if (messages.length > MAX_MESSAGES) {
      return NextResponse.json(
        { error: `Maximum ${MAX_MESSAGES} messages allowed` },
        { status: 400 }
      );
    }

    // Sanitize messages
    const sanitizedMessages = messages.map(sanitizeMessage).filter(m => m.parts.length > 0);

    if (sanitizedMessages.length === 0) {
      return NextResponse.json(
        { error: 'At least one valid message with text content is required' },
        { status: 400 }
      );
    }

    const sanitizedOptions = sanitizeOptions(options);

    if (stream) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of generateContentStreamWithContext(sanitizedMessages, sanitizedOptions)) {
              controller.enqueue(encoder.encode(chunk));
            }
            controller.close();
          } catch (error) {
            controller.error(error);
          }
        },
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
        },
      });
    }

    const result = await generateContentWithContext(sanitizedMessages, sanitizedOptions);
    return NextResponse.json(result);
  } catch (error) {
    console.error('LLM API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}