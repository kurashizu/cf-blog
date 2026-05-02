import { NextRequest, NextResponse } from 'next/server';
import { TOOLS, FUNCTION_DECLARATIONS, executeTool } from '@/lib/tools';

export const dynamic = 'force-dynamic';

/**
 * GET /api/tool — list all tools
 */
export async function GET() {
  return NextResponse.json({
    tools: TOOLS,
    functionDeclarations: FUNCTION_DECLARATIONS,
  });
}

/**
 * POST /api/tool — execute a tool directly
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { name?: string; args?: Record<string, unknown> };
    const { name, args = {} } = body;

    if (typeof name !== 'string') {
      return NextResponse.json(
        { success: false, error: 'name is required' },
        { status: 400 }
      );
    }

    const result = await executeTool(name, args);

    return NextResponse.json({
      success: true,
      tool: name,
      result,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}