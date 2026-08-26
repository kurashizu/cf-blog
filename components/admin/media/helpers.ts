/**
 * Browser-safe presentation helpers for the Media manager.
 *
 * These deliberately do NOT live in `lib/media.ts`: that module imports the
 * AWS SDK, and pulling it into a client component would drag the whole S3
 * client into the browser bundle.
 */

const IMAGE_EXTENSIONS = [
    "apng",
    "avif",
    "bmp",
    "gif",
    "ico",
    "jpeg",
    "jpg",
    "png",
    "svg",
    "webp",
];

const UNITS = ["B", "KB", "MB", "GB", "TB"];

/** Human-readable size. `undefined` renders as an em dash, not "0 B". */
export function fmtBytes(bytes: number | undefined | null): string {
    if (bytes == null) return "—";
    if (bytes < 1024) return `${bytes} B`;
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < UNITS.length - 1) {
        value /= 1024;
        unit += 1;
    }
    return `${value.toFixed(value >= 100 || unit === 0 ? 0 : 1)} ${UNITS[unit]}`;
}

export function fileExtension(key: string): string {
    const base = key.slice(key.lastIndexOf("/") + 1);
    const dot = base.lastIndexOf(".");
    return dot <= 0 ? "" : base.slice(dot + 1).toLowerCase();
}

export function isImageKey(key: string): boolean {
    return IMAGE_EXTENSIONS.includes(fileExtension(key));
}

/** The R2 listing gives ISO timestamps; show them as explicit UTC. */
export function fmtIsoTs(iso: string | undefined): string {
    if (!iso) return "—";
    return `${iso.replace("T", " ").slice(0, 19)}Z`;
}

/**
 * Guess a content type from the extension. Browsers leave `File.type` empty
 * for plenty of formats (`.svg` from some OSes, `.md`, `.woff2`), and an
 * empty content type is baked into the presigned signature — so the PUT
 * would then have to send an empty one too. Guessing keeps the object
 * servable.
 */
const CONTENT_TYPES: Record<string, string> = {
    apng: "image/apng",
    avif: "image/avif",
    bmp: "image/bmp",
    css: "text/css",
    csv: "text/csv",
    gif: "image/gif",
    gz: "application/gzip",
    ico: "image/x-icon",
    jpeg: "image/jpeg",
    jpg: "image/jpeg",
    js: "text/javascript",
    json: "application/json",
    md: "text/markdown",
    mp3: "audio/mpeg",
    mp4: "video/mp4",
    pdf: "application/pdf",
    png: "image/png",
    svg: "image/svg+xml",
    txt: "text/plain",
    webm: "video/webm",
    webp: "image/webp",
    woff2: "font/woff2",
    xml: "application/xml",
    zip: "application/zip",
};

export function contentTypeFor(file: File): string {
    if (file.type) return file.type;
    return CONTENT_TYPES[fileExtension(file.name)] ?? "application/octet-stream";
}

/** Mirror of the server-side rule, so the UI can preview the final key. */
export function sanitizeName(name: string): string {
    return name.replace(/[/\\]/g, "").trim();
}
