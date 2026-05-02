import { NextRequest, NextResponse } from "next/server";
import { htmlToMarkdown } from "@/lib/html-to-md";

export const dynamic = "force-dynamic";

const MAX_SIZE = 500 * 1024; // 500KB

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { url?: string };
    const { url } = body;

    if (typeof url !== "string") {
      return NextResponse.json({ success: false, error: "url must be a string" }, { status: 400 });
    }

    // Protocol check
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      return NextResponse.json({ success: false, error: "Only http/https URLs allowed" }, { status: 400 });
    }

    let res: Response;
    try {
      res = await fetch(url, {
        headers: { "User-Agent": "cf-agent/1.0" },
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      return NextResponse.json({ success: false, error: "Fetch failed" }, { status: 500 });
    }

    const contentType = res.headers.get("content-type") || "";
    const type = contentType.includes("json") ? "json" : "html";

    if (!res.ok) {
      return NextResponse.json({ success: false, error: `HTTP ${res.status}` }, { status: 500 });
    }

    let text: string;
    try {
      text = await res.text();
    } catch {
      return NextResponse.json({ success: false, error: "Failed to read response" }, { status: 500 });
    }

    if (text.length > MAX_SIZE) {
      text = text.slice(0, MAX_SIZE);
    }

    if (type === "html") {
      const { title, content } = htmlToMarkdown(text);
      return NextResponse.json({
        success: true,
        title,
        content,
        type: "markdown",
        status: res.status,
      });
    }

    return NextResponse.json({
      success: true,
      content: text.slice(0, 1000),
      type: "text",
      status: res.status,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
