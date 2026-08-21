import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
    S3Client,
    PutObjectCommand,
    ListObjectsV2Command,
    DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { BUCKET_URL } from "@/shared/site-config";

const BUCKET_NAME = "public-files";
const UPLOAD_URL_EXPIRES_IN = 300; // 5 分钟

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

function createS3Client(env: {
    R2_ACCESS_KEY_ID: string;
    R2_SECRET_ACCESS_KEY: string;
    R2_ACCOUNT_ID: string;
}) {
    return new S3Client({
        region: "auto",
        endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: {
            accessKeyId: env.R2_ACCESS_KEY_ID,
            secretAccessKey: env.R2_SECRET_ACCESS_KEY,
        },
    });
}

export async function GET(request: Request) {
    const { env } = getCloudflareContext();

    const authError = checkAuth(request, env);
    if (authError) return authError;

    const { searchParams } = new URL(request.url);
    const prefix = searchParams.get("prefix") ?? "";

    const s3 = createS3Client(env);

    const command = new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        Prefix: prefix,
    });

    const result = await s3.send(command);

    const files = (result.Contents ?? []).map((obj) => ({
        key: obj.Key,
        size: obj.Size,
        lastModified: obj.LastModified?.toISOString(),
        publicUrl: obj.Key ? `${BUCKET_URL}/${obj.Key}` : null,
    }));

    return NextResponse.json({ files });
}

export async function DELETE(request: Request) {
    const { env } = getCloudflareContext();

    const authError = checkAuth(request, env);
    if (authError) return authError;

    const { searchParams } = new URL(request.url);
    const filename = searchParams.get("filename");
    if (!filename) {
        return NextResponse.json(
            { error: "filename query param is required" },
            { status: 400 },
        );
    }

    const s3 = createS3Client(env);

    await s3.send(
        new DeleteObjectCommand({
            Bucket: BUCKET_NAME,
            Key: filename,
        }),
    );

    return NextResponse.json({ deleted: filename });
}

export async function POST(request: Request) {
    const { env } = getCloudflareContext();

    const authError = checkAuth(request, env);
    if (authError) return authError;

    // ── Parse body ──
    let filename = "";
    let contentType = "application/octet-stream";
    try {
        const body = (await request.json()) as Record<string, unknown>;
        if (body.filename) {
            // Sanitize: remove path separators, keep only the basename
            filename = String(body.filename).replace(/[/\\]/g, "").trim();
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

    const s3 = createS3Client(env);

    // ── Generate presigned PUT URL ──
    const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: filename,
        ContentType: contentType,
    });

    const url = await getSignedUrl(s3, command, {
        expiresIn: UPLOAD_URL_EXPIRES_IN,
    });

    return NextResponse.json({
        url,
        key: filename,
        publicUrl: `${BUCKET_URL}/${filename}`,
        expiresIn: UPLOAD_URL_EXPIRES_IN,
    });
}
