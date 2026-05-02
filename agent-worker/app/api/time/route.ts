// @tool time - Get current time in timezone (tz param, e.g. Australia/Sydney)
// @tool-example time?tz=Sydney
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tz = searchParams.get("tz") || "UTC";

  try {
    const now = new Date();
    let time: string;

    if (tz === "UTC") {
      time = now.toISOString();
    } else {
      try {
        time = now.toLocaleString("en-US", { timeZone: tz, hour12: false });
      } catch {
        return NextResponse.json({ success: false, error: `Invalid timezone: ${tz}` }, { status: 400 });
      }
    }

    return NextResponse.json({ time, tz });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
