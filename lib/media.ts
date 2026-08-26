/**
 * R2 `public-files` bucket access, shared by the public upload API and the
 * admin Media manager.
 *
 * Both entry points need the same four things — an S3 client pointed at R2,
 * a listing, a presigned PUT, a delete — so they live here rather than being
 * copy-pasted with the AWS SDK setup drifting between them.
 *
 * Server-only: importing this module pulls in `@aws-sdk/client-s3`. Client
 * components may import the *types* (`import type`), never the functions.
 * Presentation helpers that the browser needs live next to the components
 * (`components/admin/media/helpers.ts`).
 */
import {
    S3Client,
    PutObjectCommand,
    ListObjectsV2Command,
    DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { BUCKET_URL } from "@/shared/site-config";

export const BUCKET_NAME = "public-files";

/** Presigned PUT lifetime. The uploader re-signs rather than reuse past this. */
export const UPLOAD_URL_EXPIRES_IN = 300; // 5 分钟

/** The R2 credentials slice of the worker env. */
export interface MediaEnv {
    R2_ACCESS_KEY_ID: string;
    R2_SECRET_ACCESS_KEY: string;
    R2_ACCOUNT_ID: string;
}

/** One object in the bucket, as returned to the admin UI. */
export interface MediaFile {
    key: string | undefined;
    size: number | undefined;
    lastModified: string | undefined;
    publicUrl: string | null;
}

export interface PresignResult {
    url: string;
    key: string;
    publicUrl: string;
    expiresIn: number;
}

export function createS3Client(env: MediaEnv) {
    return new S3Client({
        region: "auto",
        endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: {
            accessKeyId: env.R2_ACCESS_KEY_ID,
            secretAccessKey: env.R2_SECRET_ACCESS_KEY,
        },
    });
}

/** The worker env, for callers that don't already hold a Cloudflare context. */
export function getMediaEnv(): MediaEnv & { UPLOAD_API_KEY: string } {
    const { env } = getCloudflareContext();
    return env as unknown as MediaEnv & { UPLOAD_API_KEY: string };
}

export function publicUrlFor(key: string): string {
    return `${BUCKET_URL}/${key}`;
}

/**
 * Sanitise a caller-supplied upload name down to a flat basename.
 *
 * Path separators are removed outright rather than rejected, which makes
 * traversal (`../../secret`) and absolute keys (`/etc/x`) unrepresentable:
 * everything lands at the root of the bucket. This is the pre-existing
 * `/api/upload` rule, kept byte-for-byte so that route's behaviour is
 * unchanged — uploads cannot create folders through either entry point.
 */
export function sanitizeUploadFilename(raw: unknown): string {
    return String(raw).replace(/[/\\]/g, "").trim();
}

/**
 * Validate a key that names an *existing* object (delete). Unlike an upload
 * name this may legitimately contain `/` — objects predating the flat rule,
 * or written by other tooling — so separators are checked, not stripped.
 */
export function isSafeObjectKey(key: string): boolean {
    if (!key || key.length > 1024) return false;
    if (key.startsWith("/") || key.includes("\\")) return false;
    if (key.includes("\0")) return false;
    return !key.split("/").includes("..");
}

export async function listMedia(
    env: MediaEnv,
    prefix: string,
): Promise<MediaFile[]> {
    const s3 = createS3Client(env);

    const command = new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        Prefix: prefix,
    });

    const result = await s3.send(command);

    return (result.Contents ?? []).map((obj) => ({
        key: obj.Key,
        size: obj.Size,
        lastModified: obj.LastModified?.toISOString(),
        publicUrl: obj.Key ? publicUrlFor(obj.Key) : null,
    }));
}

export async function presignMediaUpload(
    env: MediaEnv,
    filename: string,
    contentType: string,
): Promise<PresignResult> {
    const s3 = createS3Client(env);

    const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: filename,
        ContentType: contentType,
    });

    const url = await getSignedUrl(s3, command, {
        expiresIn: UPLOAD_URL_EXPIRES_IN,
    });

    return {
        url,
        key: filename,
        publicUrl: publicUrlFor(filename),
        expiresIn: UPLOAD_URL_EXPIRES_IN,
    };
}

export async function deleteMedia(env: MediaEnv, key: string): Promise<void> {
    const s3 = createS3Client(env);

    await s3.send(
        new DeleteObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key,
        }),
    );
}
