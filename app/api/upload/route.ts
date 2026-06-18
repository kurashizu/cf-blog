import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const BUCKET_NAME = "public-files";
const UPLOAD_URL_EXPIRES_IN = 300; // 5 分钟

export async function POST(request: Request) {
    const { env } = getCloudflareContext();

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

    // ── Read R2 credentials ──
    const {
        R2_ACCESS_KEY_ID: accessKeyId,
        R2_SECRET_ACCESS_KEY: secretAccessKey,
        R2_ACCOUNT_ID: accountId,
    } = env;

    // ── Create S3 client pointed at R2 ──
    const s3 = new S3Client({
        region: "auto",
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: {
            accessKeyId,
            secretAccessKey,
        },
    });

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
        publicUrl: `https://bucket.022025.xyz/${filename}`,
        expiresIn: UPLOAD_URL_EXPIRES_IN,
    });
}
