// @tool js - Safe expression evaluator (math, JSON, Date, String, Array)
// @tool-example js 1+2*3
import { NextRequest, NextResponse } from "next/server";
import { evaluate } from "@/lib/evaluator";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { code?: string; timeout?: number };
    const { code, timeout = 5000 } = body;

    if (typeof code !== "string") {
      return NextResponse.json({ success: false, error: "code must be a string" }, { status: 400 });
    }

    if (code.length > 10000) {
      return NextResponse.json({ success: false, error: "code too long (max 10000 chars)" }, { status: 400 });
    }

    // Enforce timeout via Promise.race
    const result = await Promise.race([
      evaluate(code),
      new Promise<{ success: false; error: string }>((resolve) =>
        setTimeout(() => resolve({ success: false, error: "Timeout" }), Math.min(timeout, 10000))
      ),
    ]);

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
