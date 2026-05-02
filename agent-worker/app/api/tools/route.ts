import { NextResponse } from "next/server";
import { TOOLS } from "@/lib/tools";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ tools: TOOLS });
}
