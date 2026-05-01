import { NextRequest, NextResponse } from 'next/server';
import { generateContent, generateContentStream, type GeminiMessage, type GeminiGenerateOptions } from '@/lib/gemini';

export const runtime = 'edge';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { messages, stream, options } = body as {
      messages: GeminiMessage[];
      stream?: boolean;
      options?: GeminiGenerateOptions;
    };

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: 'messages is required and must be an array' },
        { status: 400 }
      );
    }

    if (stream) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of generateContentStream(messages, options)) {
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

    const result = await generateContent(messages, options);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const type = searchParams.get('type') || 'chat';

  if (type === 'models') {
    return NextResponse.json({
      models: [
        'gemini-2.5-flash-lite',
        'gemini-2.5-flash',
        'gemini-2.5-pro',
        'gemini-3-pro',
        'gemini-3-flash',
      ],
    });
  }

  return NextResponse.json({ error: 'Unknown type. Use: models' }, { status: 400 });
}