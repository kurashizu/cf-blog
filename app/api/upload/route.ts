import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
    UPLOAD_URL_EXPIRES_IN,
    deleteMedia,
    listMedia,
    presignMediaUpload,
    sanitizeUploadFilename,
    publicUrlFor,
} from "@/lib/media";
import { withApiAudit, type ApiAuditContext } from "@/lib/api-audit";

function checkAuth(
    request: Request,
    env: { UPLOAD_API_KEY: string },
): NextResponse | null {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || authHeader !== `Bearer ${env.UPLOAD_API_KEY}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return null;
}

export async function GET(request: Request) {
    return withApiAudit(request, "/api/upload", (audit) =>
        handleList(request, audit),
    );
}

async function handleList(
    request: Request,
    audit: ApiAuditContext,
): Promise<Response> {
    const { env } = getCloudflareContext();

    const authError = checkAuth(request, env);
    if (authError) {
        audit.set({ metadata: { op: "list" } });
        return authError;
    }

    const { searchParams } = new URL(request.url);
    const prefix = searchParams.get("prefix") ?? "";

    const files = await listMedia(env, prefix);

    audit.set({
        requestCount: 1,
        metadata: { op: "list", prefix, returned: files.length },
    });
    return NextResponse.json({ files });
}

export async function DELETE(request: Request) {
    return withApiAudit(request, "/api/upload", (audit) =>
        handleDelete(request, audit),
    );
}

async function handleDelete(
    request: Request,
    audit: ApiAuditContext,
): Promise<Response> {
    const { env } = getCloudflareContext();

    const authError = checkAuth(request, env);
    if (authError) {
        audit.set({ metadata: { op: "delete" } });
        return authError;
    }

    const { searchParams } = new URL(request.url);
    const filename = searchParams.get("filename");
    if (!filename) {
        return NextResponse.json(
            { error: "filename query param is required" },
            { status: 400 },
        );
    }

    await deleteMedia(env, filename);

    audit.set({
        requestCount: 1,
        metadata: { op: "delete", key: filename },
    });
    return NextResponse.json({ deleted: filename });
}

export async function POST(request: Request) {
    return withApiAudit(request, "/api/upload", (audit) =>
        handlePresign(request, audit),
    );
}

async function handlePresign(
    request: Request,
    audit: ApiAuditContext,
): Promise<Response> {
    const { env } = getCloudflareContext();

    const authError = checkAuth(request, env);
    if (authError) {
        audit.set({ metadata: { op: "presign" } });
        return authError;
    }

    // ── Parse body ──
    let filename = "";
    let contentType = "application/octet-stream";
    try {
        const body = (await request.json()) as Record<string, unknown>;
        if (body.filename) {
            // Sanitize: remove path separators, keep only the basename
            filename = sanitizeUploadFilename(body.filename);
        }
        if (body.contentType) {
            contentType = String(body.contentType).trim();
        }
    } catch {
        // No body or invalid JSON — use defaults
    }

    if (!filename) {
        return NextResponse.json(
            { error: "filename is required" },
            { status: 400 },
        );
    }

    // ── Generate presigned PUT URL ──
    const { url } = await presignMediaUpload(env, filename, contentType);

    audit.set({
        requestCount: 1,
        metadata: { op: "presign", key: filename, content_type: contentType },
    });

    return NextResponse.json({
        url,
        key: filename,
        publicUrl: publicUrlFor(filename),
        expiresIn: UPLOAD_URL_EXPIRES_IN,
    });
}
