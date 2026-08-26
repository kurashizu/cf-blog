"use client";

import { useEffect, useMemo, useState } from "react";
import type { MediaFile } from "@/lib/media";
import { useAdminQuery } from "@/components/admin/useAdminQuery";
import {
    Column,
    DataTable,
    EmptyState,
    Field,
    FilterBar,
    FilterSelect,
    Notice,
    PageHeader,
    Pagination,
    StatGrid,
    StatTile,
    TextInput,
    fmtNum,
} from "@/components/admin/ui";
import { Button } from "@/components/ui/Button";
import { MediaUploader } from "./MediaUploader";
import { fileExtension, fmtBytes, fmtIsoTs, isImageKey } from "./helpers";

const PAGE_SIZE = 25;

const TYPE_OPTIONS = [
    { value: "", label: "all types" },
    { value: "image", label: "images" },
    { value: "other", label: "other files" },
];

const SORT_OPTIONS = [
    { value: "newest", label: "Newest first" },
    { value: "oldest", label: "Oldest first" },
    { value: "name", label: "Key (A–Z)" },
    { value: "largest", label: "Largest first" },
];

interface Row {
    key: string;
    size: number | undefined;
    lastModified: string | undefined;
    publicUrl: string;
    isImage: boolean;
}

function toRow(file: MediaFile): Row | null {
    if (!file.key) return null;
    return {
        key: file.key,
        size: file.size,
        lastModified: file.lastModified,
        publicUrl: file.publicUrl ?? "",
        isImage: isImageKey(file.key),
    };
}

export function MediaManager() {
    const [prefixInput, setPrefixInput] = useState("");
    const [prefix, setPrefix] = useState("");
    const [type, setType] = useState("");
    const [sort, setSort] = useState("newest");
    const [offset, setOffset] = useState(0);

    const [notice, setNotice] = useState<{
        tone: "success" | "error";
        text: string;
    } | null>(null);
    const [copiedKey, setCopiedKey] = useState<string | null>(null);
    const [confirmKey, setConfirmKey] = useState<string | null>(null);
    const [deletingKey, setDeletingKey] = useState<string | null>(null);

    // The prefix goes to R2 as a `Prefix`, so debounce it rather than firing
    // a ListObjects per keystroke.
    useEffect(() => {
        const t = setTimeout(() => {
            setPrefix(prefixInput.trim());
            setOffset(0);
        }, 300);
        return () => clearTimeout(t);
    }, [prefixInput]);

    const url = useMemo(
        () =>
            prefix
                ? `/admin/api/media?prefix=${encodeURIComponent(prefix)}`
                : "/admin/api/media",
        [prefix],
    );

    const { data, error, loading, initialLoading, refetch } = useAdminQuery<{
        files: MediaFile[];
    }>(url);

    const allRows = useMemo(
        () => (data?.files ?? []).map(toRow).filter((r): r is Row => r !== null),
        [data],
    );

    const existingKeys = useMemo(
        () => new Set(allRows.map((r) => r.key)),
        [allRows],
    );

    const rows = useMemo(() => {
        const filtered = allRows.filter((r) =>
            type === "image"
                ? r.isImage
                : type === "other"
                  ? !r.isImage
                  : true,
        );
        const sorted = [...filtered];
        sorted.sort((a, b) => {
            switch (sort) {
                case "name":
                    return a.key.localeCompare(b.key);
                case "largest":
                    return (b.size ?? 0) - (a.size ?? 0);
                case "oldest":
                    return (a.lastModified ?? "").localeCompare(
                        b.lastModified ?? "",
                    );
                default:
                    return (b.lastModified ?? "").localeCompare(
                        a.lastModified ?? "",
                    );
            }
        });
        return sorted;
    }, [allRows, sort, type]);

    // A delete (or a tighter filter) can strand the current page past the
    // end of the list — clamp instead of rendering an empty table.
    const maxOffset =
        rows.length === 0
            ? 0
            : Math.floor((rows.length - 1) / PAGE_SIZE) * PAGE_SIZE;
    const safeOffset = Math.min(offset, maxOffset);
    const pageRows = rows.slice(safeOffset, safeOffset + PAGE_SIZE);

    const totalBytes = allRows.reduce((sum, r) => sum + (r.size ?? 0), 0);
    const imageCount = allRows.filter((r) => r.isImage).length;

    async function copyUrl(row: Row) {
        try {
            await navigator.clipboard.writeText(row.publicUrl);
            setCopiedKey(row.key);
            setTimeout(
                () => setCopiedKey((k) => (k === row.key ? null : k)),
                1500,
            );
        } catch {
            setNotice({
                tone: "error",
                text: "Clipboard write was blocked — the URL is linked in the Key column.",
            });
        }
    }

    async function confirmDelete(row: Row) {
        setDeletingKey(row.key);
        setNotice(null);
        try {
            const res = await fetch(
                `/admin/api/media?key=${encodeURIComponent(row.key)}`,
                { method: "DELETE" },
            );
            if (!res.ok) {
                const body = (await res.json().catch(() => null)) as {
                    error?: string;
                } | null;
                throw new Error(body?.error ?? `HTTP ${res.status}`);
            }
            setNotice({ tone: "success", text: `Deleted ${row.key}.` });
            setConfirmKey(null);
            refetch();
        } catch (e) {
            setNotice({
                tone: "error",
                text: `Couldn't delete ${row.key}: ${
                    e instanceof Error ? e.message : String(e)
                }`,
            });
        } finally {
            setDeletingKey(null);
        }
    }

    const columns: Column<Row>[] = [
        {
            key: "preview",
            header: "",
            nowrap: true,
            render: (r) =>
                r.isImage && r.publicUrl ? (
                    <a
                        href={r.publicUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="block"
                    >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={r.publicUrl}
                            alt={r.key}
                            loading="lazy"
                            className="h-10 w-10 rounded border border-border bg-bg-secondary object-cover"
                        />
                    </a>
                ) : (
                    <span className="flex h-10 w-10 items-center justify-center rounded border border-border bg-bg-secondary text-[0.625rem] font-semibold uppercase text-text-muted">
                        {fileExtension(r.key) || "?"}
                    </span>
                ),
        },
        {
            key: "key",
            header: "Key",
            cellClassName: "max-w-[22rem]",
            render: (r) => (
                <a
                    href={r.publicUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="block truncate font-mono text-xs text-text-primary transition-colors hover:text-accent"
                >
                    {r.key}
                </a>
            ),
            title: (r) => r.publicUrl,
        },
        {
            key: "size",
            header: "Size",
            align: "right",
            nowrap: true,
            cellClassName: "font-mono text-xs text-text-muted",
            render: (r) => fmtBytes(r.size),
        },
        {
            key: "modified",
            header: "Modified",
            nowrap: true,
            cellClassName: "font-mono text-xs text-text-muted",
            render: (r) => fmtIsoTs(r.lastModified),
        },
        {
            key: "actions",
            header: "Actions",
            align: "right",
            nowrap: true,
            render: (r) =>
                confirmKey === r.key ? (
                    <span className="flex items-center justify-end gap-2">
                        <span className="text-xs text-text-muted">
                            Delete permanently?
                        </span>
                        <Button
                            variant="danger"
                            size="sm"
                            disabled={deletingKey === r.key}
                            onClick={() => void confirmDelete(r)}
                        >
                            {deletingKey === r.key ? "Deleting…" : "Yes, delete"}
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            disabled={deletingKey === r.key}
                            onClick={() => setConfirmKey(null)}
                        >
                            Cancel
                        </Button>
                    </span>
                ) : (
                    <span className="flex items-center justify-end gap-2">
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => void copyUrl(r)}
                        >
                            {copiedKey === r.key ? "Copied ✓" : "Copy URL"}
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                                setConfirmKey(r.key);
                                setNotice(null);
                            }}
                        >
                            Delete
                        </Button>
                    </span>
                ),
        },
    ];

    return (
        <div>
            <PageHeader
                title="Media"
                description="Files in the public-files R2 bucket, served from the bucket subdomain."
                actions={
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={refetch}
                        disabled={loading}
                    >
                        {loading ? "Refreshing…" : "Refresh"}
                    </Button>
                }
            />

            {notice && (
                <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>
                    {notice.text}
                </Notice>
            )}
            {error && (
                <Notice tone="error">
                    Couldn&apos;t load the bucket: {error}{" "}
                    <button
                        type="button"
                        onClick={refetch}
                        className="underline underline-offset-2"
                    >
                        Retry
                    </button>
                </Notice>
            )}

            <MediaUploader
                existingKeys={existingKeys}
                onUploaded={(succeeded, failed) => {
                    setNotice(
                        failed === 0
                            ? {
                                  tone: "success",
                                  text: `Uploaded ${succeeded} file${
                                      succeeded === 1 ? "" : "s"
                                  }.`,
                              }
                            : {
                                  tone: "error",
                                  text: `${failed} of ${
                                      succeeded + failed
                                  } uploads failed — see the list above.`,
                              },
                    );
                    if (succeeded > 0) refetch();
                }}
            />

            <StatGrid>
                <StatTile
                    label="Files"
                    value={fmtNum(allRows.length)}
                    hint={prefix ? `prefix “${prefix}”` : "whole bucket"}
                />
                <StatTile label="Total size" value={fmtBytes(totalBytes)} />
                <StatTile
                    label="Images"
                    value={fmtNum(imageCount)}
                    hint="by extension"
                />
                <StatTile
                    label="Other files"
                    value={fmtNum(allRows.length - imageCount)}
                />
            </StatGrid>

            <FilterBar>
                <Field label="Prefix" htmlFor="media-prefix" className="w-56">
                    <TextInput
                        id="media-prefix"
                        value={prefixInput}
                        placeholder="e.g. cover-"
                        onChange={(e) => setPrefixInput(e.target.value)}
                    />
                </Field>
                <FilterSelect
                    id="media-type"
                    label="Type"
                    value={type}
                    onChange={(v) => {
                        setType(v);
                        setOffset(0);
                    }}
                    options={TYPE_OPTIONS}
                />
                <FilterSelect
                    id="media-sort"
                    label="Sort"
                    value={sort}
                    onChange={(v) => {
                        setSort(v);
                        setOffset(0);
                    }}
                    options={SORT_OPTIONS}
                />
                {(prefixInput || type) && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                            setPrefixInput("");
                            setType("");
                            setOffset(0);
                        }}
                    >
                        Clear filters
                    </Button>
                )}
            </FilterBar>

            {initialLoading ? (
                <EmptyState>Loading bucket contents…</EmptyState>
            ) : !data ? null : rows.length === 0 ? (
                <EmptyState>
                    {allRows.length === 0
                        ? "The bucket is empty for this prefix."
                        : "No files match the current type filter."}
                </EmptyState>
            ) : (
                <DataTable
                    caption="Objects in the public-files bucket"
                    columns={columns}
                    rows={pageRows}
                    rowKey={(r) => r.key}
                    footer={
                        <Pagination
                            offset={safeOffset}
                            limit={PAGE_SIZE}
                            total={rows.length}
                            onOffsetChange={setOffset}
                            busy={loading}
                        />
                    }
                />
            )}
        </div>
    );
}
