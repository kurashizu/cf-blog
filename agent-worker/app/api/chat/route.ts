import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { FUNCTION_DECLARATIONS, executeTool } from '@/lib/tools';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_MODEL = 'gemma-4-31b-it';
const MAX_MESSAGES = 50;
const MAX_TOOL_CALLS = 5;

interface Message {
  role: 'user' | 'model';
  parts: { text: string }[];
}

function sanitizeMessage(msg: Message): Message {
  return {
    role: msg.role === 'user' || msg.role === 'model' ? msg.role : 'user',
    parts: Array.isArray(msg.parts)
      ? msg.parts.filter((p) => p && typeof p.text === 'string').map((p) => ({
          text: String(p.text).slice(0, 10000),
        }))
      : [],
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      messages?: Message[];
      options?: { model?: string; temperature?: number; maxTokens?: number; topP?: number; topK?: number };
    };

    if (!body.messages || !Array.isArray(body.messages)) {
      return NextResponse.json({ error: 'messages is required and must be an array' }, { status: 400 });
    }

    if (body.messages.length > MAX_MESSAGES) {
      return NextResponse.json({ error: `Maximum ${MAX_MESSAGES} messages allowed` }, { status: 400 });
    }

    const messages = body.messages.map(sanitizeMessage).filter((m) => m.parts.length > 0);
    if (messages.length === 0) {
      return NextResponse.json({ error: 'At least one valid message with text content is required' }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const apiKey = (getCloudflareContext() as any).env?.GEMINI_API_KEY as string | undefined;
    if (!apiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 });
    }

    const model = body.options?.model || DEFAULT_MODEL;
    const toolCallLog: Array<{ name: string; args: Record<string, unknown>; result: unknown }> = [];

    // Build contents for Gemini
    const contents = messages.map((m) => ({
      role: m.role,
      parts: m.parts,
    }));

    // Tool loop
    let iteration = 0;
    while (iteration < MAX_TOOL_CALLS) {
      iteration++;

      const generationConfig: Record<string, unknown> = {
        temperature: body.options?.temperature ?? 0.9,
        maxOutputTokens: body.options?.maxTokens ?? 8192,
        topP: body.options?.topP ?? 0.95,
        topK: body.options?.topK ?? 40,
      };

      const requestBody = {
        contents,
        tools: [{ functionDeclarations: FUNCTION_DECLARATIONS }],
        generationConfig,
      };

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

      // Check for function call
      const functionCallPart = parts.find((p) => p.functionCall);
      const textPart = parts.find((p) => p.text);

      if (functionCallPart) {
        const fc = functionCallPart.functionCall!;
        const result = await executeTool(fc.name, fc.args);
        toolCallLog.push({ name: fc.name, args: fc.args, result });

        // Append assistant message with function call
        contents.push({
          role: 'model',
          parts: [{ text: '' }],
        });
        // Gemini uses functionCall format differently, we need to append function_response
        // Actually for Gemini we need to append a function_response role message
        contents.push({
          role: 'user',
          parts: [{
            text: JSON.stringify({ name: fc.name, args: fc.args, result }),
          }],
        });

        continue; // loop again
      }

      if (textPart?.text) {
        return NextResponse.json({
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

      // No text and no function call — return empty
      return NextResponse.json({
        text: '',
        model,
        toolCalls: toolCallLog.length > 0 ? toolCallLog : undefined,
      });
    }

    return NextResponse.json({ error: 'Max tool call iterations exceeded' }, { status: 500 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}