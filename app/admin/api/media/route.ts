/**
 * Admin API — R2 `public-files` bucket (the Media manager's backend).
 *
 * The browser must never hold `UPLOAD_API_KEY`, so the admin page cannot
 * call `/api/upload` directly. These handlers run server-side inside the
 * admin surface, read the R2 credentials from the Cloudflare env and drive
 * the same helpers `/api/upload` uses (`lib/media.ts`) — no key is ever
 * shipped to the client, and there is no second copy of the S3 setup.
 *
 * GET    /admin/api/media?prefix=      → { files: MediaFile[] }
 * POST   /admin/api/media              → { url, key, publicUrl, expiresIn }
 *          body { filename, contentType }
 * DELETE /admin/api/media?key=         → { deleted }
 *
 * DELETE takes the key on the query string rather than as a `[key]` path
 * segment: existing objects may contain `/`, which a dynamic segment can't
 * carry.
 */
import { NextRequest, NextResponse } from "next/server";
import {
    deleteMedia,
    getMediaEnv,
    isSafeObjectKey,
    listMedia,
    presignMediaUpload,
    sanitizeUploadFilename,
} from "@/lib/media";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
    try {
        const prefix = request.nextUrl.searchParams.get("prefix") ?? "";
        const files = await listMedia(getMediaEnv(), prefix);
        return NextResponse.json({ files });
    } catch (e) {
        console.error("Admin media GET error:", e);
        return NextResponse.json(
            { error: "Failed to list bucket contents" },
            { status: 500 },
        );
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = (await request.json().catch(() => null)) as Record<
            string,
            unknown
        > | null;

        // Same rule as /api/upload: separators are stripped, so a traversal
        // or absolute key can't be expressed at all.
        const filename = body?.filename
            ? sanitizeUploadFilename(body.filename)
            : "";
        if (!filename) {
            return NextResponse.json(
                { error: "filename is required" },
                { status: 400 },
            );
        }

        const contentType = body?.contentType
            ? String(body.contentType).trim()
            : "application/octet-stream";

        const result = await presignMediaUpload(
            getMediaEnv(),
            filename,
            contentType,
        );
        return NextResponse.json(result);
    } catch (e) {
        console.error("Admin media POST error:", e);
        return NextResponse.json(
            { error: "Failed to create upload URL" },
            { status: 500 },
        );
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const key = request.nextUrl.searchParams.get("key") ?? "";
        if (!key) {
            return NextResponse.json(
                { error: "key query param is required" },
                { status: 400 },
            );
        }
        if (!isSafeObjectKey(key)) {
            return NextResponse.json({ error: "Invalid key" }, { status: 400 });
        }

        await deleteMedia(getMediaEnv(), key);
        return NextResponse.json({ deleted: key });
    } catch (e) {
        console.error("Admin media DELETE error:", e);
        return NextResponse.json(
            { error: "Failed to delete file" },
            { status: 500 },
        );
    }
}
