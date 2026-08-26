"use client";

import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { MicroLabel } from "@/components/admin/ui";
import { cn } from "@/lib/utils";
import { contentTypeFor, fmtBytes, sanitizeName } from "./helpers";

interface PresignResult {
    url: string;
    key: string;
    publicUrl: string;
    expiresIn: number;
}

type ItemStatus = "queued" | "signing" | "uploading" | "done" | "error";

interface QueueItem {
    id: string;
    file: File;
    key: string;
    status: ItemStatus;
    /** 0–100, only meaningful while `uploading`. */
    progress: number;
    error?: string;
    overwrites: boolean;
}

const STATUS_LABEL: Record<ItemStatus, string> = {
    queued: "Queued",
    signing: "Signing…",
    uploading: "Uploading",
    done: "Uploaded",
    error: "Failed",
};

async function requestPresign(file: File, key: string): Promise<PresignResult> {
    const res = await fetch("/admin/api/media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            filename: key,
            contentType: contentTypeFor(file),
        }),
    });
    const body = (await res.json().catch(() => null)) as
        | (PresignResult & { error?: string })
        | null;
    if (!res.ok || !body?.url) {
        throw new Error(body?.error ?? `Could not sign upload (${res.status})`);
    }
    return body;
}

/**
 * PUT straight to R2. `fetch` can't report upload progress, so this is the
 * one place the admin still reaches for XMLHttpRequest.
 */
function putToR2(
    url: string,
    file: File,
    onProgress: (pct: number) => void,
): Promise<void> {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", url);
        xhr.setRequestHeader("Content-Type", contentTypeFor(file));
        xhr.upload.addEventListener("progress", (e) => {
            if (e.lengthComputable) {
                onProgress(Math.round((e.loaded / e.total) * 100));
            }
        });
        xhr.addEventListener("load", () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                resolve();
                return;
            }
            // 403 from R2 on a presigned PUT is almost always an expired or
            // mismatched signature; the caller re-signs once on this.
            const err = new Error(
                xhr.status === 403
                    ? "Upload link expired or was rejected (403)"
                    : `R2 rejected the upload (${xhr.status})`,
            );
            (err as Error & { status?: number }).status = xhr.status;
            reject(err);
        });
        xhr.addEventListener("error", () =>
            reject(new Error("Network error while uploading to R2")),
        );
        xhr.addEventListener("abort", () =>
            reject(new Error("Upload cancelled")),
        );
        xhr.send(file);
    });
}

export function MediaUploader({
    existingKeys,
    onUploaded,
}: {
    existingKeys: Set<string>;
    /** Called once the whole batch settles, so the list can refresh. */
    onUploaded: (succeeded: number, failed: number) => void;
}) {
    const [queue, setQueue] = useState<QueueItem[]>([]);
    const [busy, setBusy] = useState(false);
    const [dragging, setDragging] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const patch = useCallback((id: string, next: Partial<QueueItem>) => {
        setQueue((q) =>
            q.map((item) => (item.id === id ? { ...item, ...next } : item)),
        );
    }, []);

    const run = useCallback(
        async (items: QueueItem[]) => {
            setBusy(true);
            let succeeded = 0;
            let failed = 0;

            // Sequential on purpose: a presigned URL lives 5 minutes, and a
            // parallel batch of large files can outlive the signatures issued
            // at the start of it.
            for (const item of items) {
                try {
                    patch(item.id, { status: "signing", progress: 0 });
                    let signed = await requestPresign(item.file, item.key);

                    patch(item.id, { status: "uploading", key: signed.key });
                    try {
                        await putToR2(signed.url, item.file, (pct) =>
                            patch(item.id, { progress: pct }),
                        );
                    } catch (e) {
                        // One retry with a fresh signature covers the case
                        // where the URL expired while earlier files uploaded.
                        if ((e as { status?: number }).status !== 403) throw e;
                        patch(item.id, { status: "signing", progress: 0 });
                        signed = await requestPresign(item.file, item.key);
                        patch(item.id, { status: "uploading" });
                        await putToR2(signed.url, item.file, (pct) =>
                            patch(item.id, { progress: pct }),
                        );
                    }

                    patch(item.id, { status: "done", progress: 100 });
                    succeeded += 1;
                } catch (e) {
                    patch(item.id, {
                        status: "error",
                        error: e instanceof Error ? e.message : String(e),
                    });
                    failed += 1;
                }
            }

            setBusy(false);
            onUploaded(succeeded, failed);
        },
        [onUploaded, patch],
    );

    const enqueue = useCallback(
        (files: FileList | File[]) => {
            const items: QueueItem[] = Array.from(files).map((file, i) => {
                const key = sanitizeName(file.name) || `file-${Date.now()}-${i}`;
                return {
                    id: `${Date.now()}-${i}-${key}`,
                    file,
                    key,
                    status: "queued" as const,
                    progress: 0,
                    overwrites: existingKeys.has(key),
                };
            });
            if (items.length === 0) return;
            // Drop the settled rows from the previous batch so the panel
            // doesn't grow without bound.
            setQueue((q) => [...q.filter((i) => i.status === "error"), ...items]);
            void run(items);
        },
        [existingKeys, run],
    );

    const pendingOverwrites = queue.filter(
        (i) => i.overwrites && i.status !== "done",
    ).length;

    return (
        <div className="mb-6">
            <div
                onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    if (e.dataTransfer.files.length) {
                        enqueue(e.dataTransfer.files);
                    }
                }}
                className={cn(
                    "flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-8 text-center transition-colors",
                    dragging
                        ? "border-accent bg-accent/5"
                        : "border-border bg-bg-card",
                )}
            >
                <MicroLabel>Upload to public-files</MicroLabel>
                <p className="text-sm text-text-muted">
                    Drop files here, or pick them manually. They upload
                    straight from your browser to R2.
                </p>
                <input
                    ref={inputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                        if (e.target.files?.length) enqueue(e.target.files);
                        // Allow re-picking the same file after a failure.
                        e.target.value = "";
                    }}
                />
                <Button
                    variant="secondary"
                    size="sm"
                    disabled={busy}
                    onClick={() => inputRef.current?.click()}
                >
                    {busy ? "Uploading…" : "Choose files"}
                </Button>
                <p className="text-xs text-text-muted">
                    Folders aren&apos;t supported — path separators are
                    stripped and every file lands at the bucket root.
                </p>
            </div>

            {pendingOverwrites > 0 && (
                <p className="mt-2 text-xs text-amber-400">
                    {pendingOverwrites} file
                    {pendingOverwrites === 1 ? "" : "s"} will overwrite an
                    existing object with the same key.
                </p>
            )}

            {queue.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                    {queue.map((item) => (
                        <li
                            key={item.id}
                            className="rounded-lg border border-border bg-bg-card px-3 py-2"
                        >
                            <div className="flex items-center justify-between gap-3 text-sm">
                                <span className="min-w-0 truncate font-mono text-xs text-text-primary">
                                    {item.key}
                                </span>
                                <span
                                    className={cn(
                                        "shrink-0 text-xs tabular-nums",
                                        item.status === "error"
                                            ? "text-red-400"
                                            : item.status === "done"
                                              ? "text-emerald-400"
                                              : "text-text-muted",
                                    )}
                                >
                                    {item.status === "uploading"
                                        ? `${item.progress}%`
                                        : STATUS_LABEL[item.status]}{" "}
                                    · {fmtBytes(item.file.size)}
                                </span>
                            </div>
                            {(item.status === "uploading" ||
                                item.status === "signing") && (
                                <div
                                    className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-bg-secondary"
                                    role="progressbar"
                                    aria-valuenow={item.progress}
                                    aria-valuemin={0}
                                    aria-valuemax={100}
                                    aria-label={`Uploading ${item.key}`}
                                >
                                    <div
                                        className="h-full bg-accent transition-[width] duration-150"
                                        style={{ width: `${item.progress}%` }}
                                    />
                                </div>
                            )}
                            {item.error && (
                                <p className="mt-1 text-xs text-red-400">
                                    {item.error}
                                </p>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
