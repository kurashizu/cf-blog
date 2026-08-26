"use client";

import { useEffect, useMemo, useState } from "react";
import type { NewsItem } from "@/lib/news";
import { unixToUtc } from "@/lib/news";
import { useAdminQuery } from "../useAdminQuery";
import { Field, MicroLabel, Notice, TextArea, fmtNum, fmtTs } from "../ui";
import { Button } from "@/components/ui/Button";

/**
 * Modal for reading and rewriting one item's AI summary.
 *
 * The list endpoint only ships a 180-char preview (the table would otherwise
 * carry every summary body on every page), so the full text is fetched here
 * by id.
 */
export function SummaryEditor({
    id,
    onClose,
    onSaved,
}: {
    id: number;
    onClose: () => void;
    /** Called after a successful save so the list can refresh itself. */
    onSaved: (message: string) => void;
}) {
    const url = useMemo(() => `/admin/api/news/${id}`, [id]);
    const { data, error, initialLoading } = useAdminQuery<{ item: NewsItem }>(
        url,
    );

    const [draft, setDraft] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);

    const item = data?.item ?? null;
    // Seed the textarea once the body arrives; `draft === null` means
    // "untouched", so a refetch can't clobber in-progress edits.
    useEffect(() => {
        if (item && draft === null) setDraft(item.summary);
    }, [item, draft]);

    const dirty = item != null && draft != null && draft !== item.summary;

    // Escape closes, but never out from under an in-flight save.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape" && !saving) onClose();
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [onClose, saving]);

    async function handleSave() {
        if (draft == null) return;
        setSaving(true);
        setSaveError(null);
        try {
            const res = await fetch(`/admin/api/news/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ summary: draft }),
            });
            if (!res.ok) {
                const body = (await res.json().catch(() => null)) as {
                    error?: string;
                } | null;
                throw new Error(body?.error ?? `HTTP ${res.status}`);
            }
            onSaved(
                `Summary for #${id} saved — queued for re-indexing on the next tick.`,
            );
            onClose();
        } catch (e) {
            setSaveError(e instanceof Error ? e.message : String(e));
        } finally {
            setSaving(false);
        }
    }

    return (
        <div
            className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 sm:p-8"
            onClick={(e) => {
                if (e.target === e.currentTarget && !saving && !dirty) {
                    onClose();
                }
            }}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-label="Edit news summary"
                className="w-full max-w-3xl rounded-xl border border-border bg-bg-card p-5 shadow-xl"
            >
                {error && (
                    <Notice tone="error">
                        Couldn&apos;t load this item: {error}
                    </Notice>
                )}
                {saveError && (
                    <Notice tone="error" onDismiss={() => setSaveError(null)}>
                        Save failed: {saveError}
                    </Notice>
                )}

                {initialLoading ? (
                    <p className="py-8 text-center text-sm text-text-muted">
                        Loading item…
                    </p>
                ) : item ? (
                    <>
                        <div className="mb-4">
                            <MicroLabel>News #{item.id}</MicroLabel>
                            <h2 className="mt-1 text-lg font-bold text-text-primary">
                                {item.title}
                            </h2>
                            <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted">
                                <span>
                                    <dt className="inline">by </dt>
                                    <dd className="inline">{item.by}</dd>
                                </span>
                                <span>
                                    <dt className="inline">score </dt>
                                    <dd className="inline tabular-nums">
                                        {fmtNum(item.score)}
                                    </dd>
                                </span>
                                <span>
                                    <dt className="inline">posted </dt>
                                    <dd className="inline font-mono">
                                        {unixToUtc(item.time)}
                                    </dd>
                                </span>
                                <span>
                                    <dt className="inline">fetched </dt>
                                    <dd className="inline font-mono">
                                        {fmtTs(item.fetched_at)}
                                    </dd>
                                </span>
                                <span>
                                    <dt className="inline">indexed </dt>
                                    <dd className="inline font-mono">
                                        {item.search_updated_at
                                            ? fmtTs(item.search_updated_at)
                                            : "never"}
                                    </dd>
                                </span>
                            </dl>
                            {item.url && (
                                <a
                                    href={item.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="mt-2 inline-block break-all font-mono text-xs text-accent underline underline-offset-2"
                                >
                                    {item.url}
                                </a>
                            )}
                        </div>

                        <Field
                            label="AI summary"
                            htmlFor="news-summary"
                            hint={
                                dirty
                                    ? "Saving clears the indexing state, so the next 3-min tick re-embeds this text."
                                    : "Markdown. Empty means the rewrite heartbeat hasn't reached this item yet."
                            }
                        >
                            <TextArea
                                id="news-summary"
                                rows={16}
                                spellCheck={false}
                                value={draft ?? ""}
                                disabled={saving}
                                onChange={(e) => setDraft(e.target.value)}
                                className="font-mono text-xs leading-relaxed"
                            />
                        </Field>

                        <div className="mt-4 flex items-center justify-between gap-3">
                            <span className="text-xs text-text-muted tabular-nums">
                                {fmtNum(draft?.length ?? 0)} chars
                                {dirty ? " · unsaved changes" : ""}
                            </span>
                            <span className="flex gap-2">
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    disabled={saving}
                                    onClick={onClose}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    size="sm"
                                    disabled={saving || !dirty}
                                    onClick={() => void handleSave()}
                                >
                                    {saving ? "Saving…" : "Save summary"}
                                </Button>
                            </span>
                        </div>
                    </>
                ) : (
                    <div className="flex justify-end">
                        <Button variant="secondary" size="sm" onClick={onClose}>
                            Close
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}
