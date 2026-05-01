import { NextRequest, NextResponse } from 'next/server';
import { chat, generateContent, generateContentStream } from '@/lib/gemini';

export const runtime = 'edge';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const testType = searchParams.get('type') || 'chat';

  try {
    switch (testType) {
      case 'chat': {
        const result = await chat('Say "Hello, API works!" in exactly those words.');
        return NextResponse.json({
          success: true,
          test: 'chat',
          result,
        });
      }

      case 'generate': {
        const messages = [
          { role: 'user' as const, parts: [{ text: 'What is 2+2? Answer in one word.' }] },
        ];
        const result = await generateContent(messages, { temperature: 0 });
        return NextResponse.json({
          success: true,
          test: 'generateContent',
          result,
        });
      }

      case 'stream': {
        const messages = [
          { role: 'user' as const, parts: [{ text: 'Count from 1 to 3, one number per line.' }] },
        ];
        let fullText = '';
        for await (const chunk of generateContentStream(messages)) {
          fullText += chunk;
        }
        return NextResponse.json({
          success: true,
          test: 'streamGenerateContent',
          fullText,
        });
      }

      default:
        return NextResponse.json(
          { error: 'Unknown test type. Use: chat, generate, or stream' },
          { status: 400 }
        );
    }
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}