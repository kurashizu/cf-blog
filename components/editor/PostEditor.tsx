"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Tag";
import { cn } from "@/lib/utils";
import { adminApi } from "@/lib/api";
import { MarkdownRenderer } from "@/components/markdown/MarkdownRenderer";
import { Field, MicroLabel, Notice, Select, TextArea, TextInput } from "@/components/admin/ui";
import { MarkdownToolbar, type ToolbarAction } from "./MarkdownToolbar";
import { TagInput } from "./TagInput";
import {
    type EditorState,
    indent,
    insertImage,
    insertLink,
    slugify,
    textStats,
    toggleCode,
    toggleLinePrefix,
    toggleOrderedList,
    toggleWrap,
} from "./markdown-commands";

/** Coerce a stored date into the `YYYY-MM-DD` that <input type="date"> needs. */
function toDateInputValue(raw?: string): string {
    if (!raw) return "";
    const match = /^\d{4}-\d{2}-\d{2}/.exec(raw.trim());
    if (match) return match[0];
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return "";
    return parsed.toISOString().split("T")[0];
}

export interface PostFormData {
    title: string;
    slug: string;
    date: string;
    description: string;
    tags: string[];
    category: string;
    published: boolean;
    coverImage: string;
    externalUrl: string;
    content: string;
}

interface PostEditorProps {
    initialData?: Partial<PostFormData> & { tags?: string[] | string };
    isNewPost?: boolean;
    /** Tags already used across the blog, offered as quick-add chips. */
    knownTags?: string[];
    knownCategories?: string[];
}

/**
 * Write and Preview are separate full-width panes, not columns. Side by
 * side, each half only got about a third of the viewport once the metadata
 * sidebar took its share — too narrow to read or write comfortably.
 */
type ViewMode = "write" | "preview";

const AUTOSAVE_KEY = "admin-post-draft-v1";
const AUTOSAVE_DELAY = 1500;

function normaliseTags(tags?: string[] | string): string[] {
    if (Array.isArray(tags)) return tags;
    if (typeof tags === "string") {
        return tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean);
    }
    return [];
}

export function PostEditor({
    initialData,
    isNewPost = false,
    knownTags = [],
    knownCategories = [],
}: PostEditorProps) {
    const isEditing = Boolean(initialData?.slug);

    const [form, setForm] = useState<PostFormData>(() => ({
        title: initialData?.title ?? "",
        slug: initialData?.slug ?? "",
        date: toDateInputValue(initialData?.date),
        description: initialData?.description ?? "",
        tags: normaliseTags(initialData?.tags),
        category: initialData?.category ?? "",
        published: initialData?.published ?? true,
        coverImage: initialData?.coverImage ?? "",
        externalUrl: initialData?.externalUrl ?? "",
        content: initialData?.content ?? "",
    }));

    const [view, setView] = useState<ViewMode>("write");
    const [dirty, setDirty] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [message, setMessage] = useState<{
        type: "success" | "error";
        text: string;
    } | null>(null);
    const [draftFound, setDraftFound] = useState<PostFormData | null>(null);
    const [slugTaken, setSlugTaken] = useState(false);

    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    // Mirrors `form` for handlers that must not be re-created on every
    // keystroke (the save shortcut, the unload guard).
    const formRef = useRef(form);
    formRef.current = form;

    const set = useCallback(<K extends keyof PostFormData>(
        key: K,
        value: PostFormData[K],
    ) => {
        setForm((prev) => ({ ...prev, [key]: value }));
        setDirty(true);
    }, []);

    const stats = useMemo(() => textStats(form.content), [form.content]);

    /* ── Date default (client-only, avoids a UTC-midnight SSR mismatch) ── */
    useEffect(() => {
        if (!form.date) {
            setForm((p) => ({
                ...p,
                date: new Date().toISOString().split("T")[0],
            }));
        }
    }, [form.date]);

    /* ── Slug auto-generation for new posts ── */
    useEffect(() => {
        if (isEditing || !form.title) return;
        setForm((p) => ({ ...p, slug: slugify(p.title) }));
    }, [form.title, isEditing]);

    /* ── Slug availability check ── */
    useEffect(() => {
        if (isEditing || !form.slug) {
            setSlugTaken(false);
            return;
        }
        const ctrl = new AbortController();
        const timer = setTimeout(() => {
            fetch(adminApi.post(form.slug), { signal: ctrl.signal })
                .then((res) => setSlugTaken(res.ok))
                .catch(() => {
                    /* offline or aborted — don't block saving */
                });
        }, 400);
        return () => {
            clearTimeout(timer);
            ctrl.abort();
        };
    }, [form.slug, isEditing]);

    /* ── Autosave to localStorage, and offer recovery on mount ── */
    useEffect(() => {
        try {
            const raw = localStorage.getItem(AUTOSAVE_KEY);
            if (!raw) return;
            const saved = JSON.parse(raw) as {
                slug: string;
                at: number;
                form: PostFormData;
            };
            // Only offer a draft belonging to this post (or to a new post).
            const sameTarget = isEditing
                ? saved.slug === initialData?.slug
                : saved.slug === "";
            if (sameTarget && saved.form) setDraftFound(saved.form);
        } catch {
            /* unreadable draft — ignore */
        }
        // Intentionally mount-only: recovery is offered once.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!dirty) return;
        const timer = setTimeout(() => {
            try {
                localStorage.setItem(
                    AUTOSAVE_KEY,
                    JSON.stringify({
                        slug: initialData?.slug ?? "",
                        at: Date.now(),
                        form: formRef.current,
                    }),
                );
            } catch {
                /* quota or private mode — autosave is best-effort */
            }
        }, AUTOSAVE_DELAY);
        return () => clearTimeout(timer);
    }, [form, dirty, initialData?.slug]);

    const clearDraft = useCallback(() => {
        try {
            localStorage.removeItem(AUTOSAVE_KEY);
        } catch {
            /* ignore */
        }
    }, []);

    /* ── Warn before losing unsaved work ── */
    useEffect(() => {
        if (!dirty) return;
        const handler = (e: BeforeUnloadEvent) => e.preventDefault();
        window.addEventListener("beforeunload", handler);
        return () => window.removeEventListener("beforeunload", handler);
    }, [dirty]);

    /* ── Editing commands ── */
    const applyCommand = useCallback(
        (fn: (s: EditorState) => EditorState) => {
            const el = textareaRef.current;
            if (!el) return;
            const next = fn({
                text: el.value,
                start: el.selectionStart,
                end: el.selectionEnd,
            });
            setForm((p) => ({ ...p, content: next.text }));
            setDirty(true);
            // Restore the selection after React commits the new value.
            requestAnimationFrame(() => {
                el.focus();
                el.setSelectionRange(next.start, next.end);
            });
        },
        [],
    );

    const uploadImage = useCallback(
        async (file: File) => {
            setUploading(true);
            setMessage(null);
            try {
                const presign = await fetch("/admin/api/media", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        filename: file.name,
                        contentType: file.type || "application/octet-stream",
                    }),
                });
                const info = (await presign.json().catch(() => null)) as {
                    url?: string;
                    publicUrl?: string;
                    error?: string;
                } | null;
                if (!presign.ok || !info?.url || !info.publicUrl) {
                    throw new Error(info?.error ?? `HTTP ${presign.status}`);
                }
                const put = await fetch(info.url, {
                    method: "PUT",
                    headers: { "Content-Type": file.type },
                    body: file,
                });
                if (!put.ok) throw new Error(`Upload failed (${put.status})`);

                applyCommand((s) =>
                    insertImage(s, info.publicUrl!, file.name.replace(/\.\w+$/, "")),
                );
                setMessage({ type: "success", text: `Uploaded ${file.name}` });
            } catch (e) {
                setMessage({
                    type: "error",
                    text: `Image upload failed: ${e instanceof Error ? e.message : String(e)}`,
                });
            } finally {
                setUploading(false);
            }
        },
        [applyCommand],
    );

    const actions: ToolbarAction[] = useMemo(
        () => [
            { id: "h2", label: "Heading", glyph: "H2", hint: "Heading (## )", run: () => applyCommand((s) => toggleLinePrefix(s, "## ")) },
            { id: "h3", label: "Subheading", glyph: "H3", hint: "Subheading (### )", run: () => applyCommand((s) => toggleLinePrefix(s, "### ")) },
            { id: "bold", label: "Bold", glyph: "B", hint: "Bold (⌘B)", run: () => applyCommand((s) => toggleWrap(s, "**")) },
            { id: "italic", label: "Italic", glyph: "I", hint: "Italic (⌘I)", run: () => applyCommand((s) => toggleWrap(s, "*")) },
            { id: "strike", label: "Strikethrough", glyph: "S̶", hint: "Strikethrough", run: () => applyCommand((s) => toggleWrap(s, "~~")) },
            { id: "code", label: "Code", glyph: "‹›", hint: "Code / code block", run: () => applyCommand(toggleCode) },
            { id: "link", label: "Link", glyph: "🔗", hint: "Link (⌘K)", run: () => applyCommand((s) => insertLink(s)) },
            { id: "ul", label: "Bulleted list", glyph: "•", hint: "Bulleted list", run: () => applyCommand((s) => toggleLinePrefix(s, "- ")) },
            { id: "ol", label: "Numbered list", glyph: "1.", hint: "Numbered list", run: () => applyCommand(toggleOrderedList) },
            { id: "quote", label: "Quote", glyph: "❝", hint: "Blockquote", run: () => applyCommand((s) => toggleLinePrefix(s, "> ")) },
            { id: "image", label: "Insert image", glyph: uploading ? "…" : "🖼", hint: "Upload an image to R2 and insert it", run: () => fileInputRef.current?.click() },
        ],
        [applyCommand, uploading],
    );

    /* ── Save ── */
    const handleSubmit = useCallback(
        async (e?: React.FormEvent) => {
            e?.preventDefault();
            const data = formRef.current;
            if (!data.title || !data.slug || !data.content) {
                setMessage({
                    type: "error",
                    text: "Title, slug and content are required.",
                });
                return;
            }
            setIsSubmitting(true);
            setMessage(null);

            const endpoint = isEditing
                ? adminApi.post(initialData!.slug!)
                : adminApi.posts;

            try {
                const response = await fetch(endpoint, {
                    method: isEditing ? "PUT" : "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(data),
                });
                if (!response.ok) {
                    const err = (await response.json().catch(() => null)) as {
                        error?: string;
                    } | null;
                    throw new Error(err?.error ?? `HTTP ${response.status}`);
                }
                setDirty(false);
                clearDraft();
                setMessage({ type: "success", text: "Saved." });
                if (!isEditing) {
                    setTimeout(() => {
                        window.location.href = "/admin/posts";
                    }, 800);
                }
            } catch (err) {
                setMessage({
                    type: "error",
                    text: `Failed to save: ${err instanceof Error ? err.message : String(err)}`,
                });
            } finally {
                setIsSubmitting(false);
            }
        },
        [isEditing, initialData, clearDraft],
    );

    /* ── ⌘S / ⌘B / ⌘I / ⌘K ── */
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (!(e.metaKey || e.ctrlKey)) return;
            const key = e.key.toLowerCase();
            if (key === "s") {
                e.preventDefault();
                void handleSubmit();
                return;
            }
            if (document.activeElement !== textareaRef.current) return;
            if (key === "b") {
                e.preventDefault();
                applyCommand((s) => toggleWrap(s, "**"));
            } else if (key === "i") {
                e.preventDefault();
                applyCommand((s) => toggleWrap(s, "*"));
            } else if (key === "k") {
                e.preventDefault();
                applyCommand((s) => insertLink(s));
            }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [handleSubmit, applyCommand]);

    const handleDelete = async () => {
        const slug = initialData?.slug;
        if (!slug) return;
        if (!window.confirm(`Delete "${form.title || slug}"? This cannot be undone.`)) {
            return;
        }
        setIsDeleting(true);
        setMessage(null);
        try {
            const res = await fetch(adminApi.post(slug), { method: "DELETE" });
            if (!res.ok) {
                const err = (await res.json().catch(() => null)) as {
                    error?: string;
                } | null;
                throw new Error(err?.error ?? `HTTP ${res.status}`);
            }
            clearDraft();
            setDirty(false);
            window.location.href = "/admin/posts";
        } catch (e) {
            setMessage({
                type: "error",
                text: `Failed to delete: ${e instanceof Error ? e.message : String(e)}`,
            });
            setIsDeleting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit}>
            {/* Sticky action bar */}
            <div className="sticky top-0 z-20 -mx-4 mb-5 flex flex-wrap items-center gap-3 border-b border-border bg-bg-primary/95 px-4 py-3 backdrop-blur">
                <div className="min-w-0 flex-1">
                    <h1 className="truncate text-lg font-bold text-text-primary">
                        {isNewPost ? "New post" : form.title || "Edit post"}
                    </h1>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-text-muted">
                        <span>
                            {stats.words} words · {stats.minutes} min read
                        </span>
                        {dirty ? (
                            <Badge variant="warning">unsaved</Badge>
                        ) : (
                            <Badge variant="success">saved</Badge>
                        )}
                        {form.published ? (
                            <Badge variant="success">published</Badge>
                        ) : (
                            <Badge variant="info">draft</Badge>
                        )}
                    </div>
                </div>

                <div className="flex gap-2">
                    {isEditing && (
                        <>
                            <a
                                href={`/blog/${initialData?.slug}`}
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                <Button type="button" variant="ghost" size="sm">
                                    View
                                </Button>
                            </a>
                            <Button
                                type="button"
                                variant="danger"
                                size="sm"
                                onClick={handleDelete}
                                disabled={isDeleting}
                            >
                                {isDeleting ? "Deleting…" : "Delete"}
                            </Button>
                        </>
                    )}
                    <Button type="submit" size="sm" disabled={isSubmitting}>
                        {isSubmitting ? "Saving…" : "Save"}
                    </Button>
                </div>
            </div>

            {message && (
                <Notice
                    tone={message.type}
                    onDismiss={() => setMessage(null)}
                >
                    {message.text}
                </Notice>
            )}

            {draftFound && (
                <Notice tone="error" onDismiss={() => setDraftFound(null)}>
                    An unsaved draft from a previous session was found.{" "}
                    <button
                        type="button"
                        className="underline underline-offset-2"
                        onClick={() => {
                            setForm(draftFound);
                            setDraftFound(null);
                            setDirty(true);
                        }}
                    >
                        Restore it
                    </button>{" "}
                    or{" "}
                    <button
                        type="button"
                        className="underline underline-offset-2"
                        onClick={() => {
                            clearDraft();
                            setDraftFound(null);
                        }}
                    >
                        discard
                    </button>
                    .
                </Notice>
            )}

            <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
                {/* Main column */}
                <div className="min-w-0 space-y-4">
                    {/* The title reads as a title, not as one more form
                        field in a stack of identical boxes. */}
                    <input
                        id="title"
                        aria-label="Title"
                        value={form.title}
                        onChange={(e) => set("title", e.target.value)}
                        placeholder="Post title"
                        className="w-full border-0 bg-transparent px-1 py-1 text-2xl font-bold text-text-primary placeholder:text-text-muted/60 focus:outline-none focus:ring-0"
                        required
                    />

                    <div>
                        <div className="overflow-hidden rounded-xl border border-border bg-bg-card">
                            {/* Pane switcher lives on the pane, so it reads
                                as "what this box is showing" rather than a
                                global setting. */}
                            <div className="flex items-center gap-1 border-b border-border bg-bg-secondary px-2 pt-2">
                                {(["write", "preview"] as ViewMode[]).map(
                                    (m) => (
                                        <button
                                            key={m}
                                            type="button"
                                            onClick={() => setView(m)}
                                            aria-pressed={view === m}
                                            className={cn(
                                                "-mb-px rounded-t-lg border border-b-0 px-4 py-1.5 text-xs capitalize transition-colors",
                                                view === m
                                                    ? "border-border bg-bg-card font-medium text-accent"
                                                    : "border-transparent text-text-muted hover:text-text-primary",
                                            )}
                                        >
                                            {m}
                                        </button>
                                    ),
                                )}
                                <span className="ml-auto pb-1.5 pr-1 text-[0.6875rem] text-text-muted">
                                    {stats.chars.toLocaleString("en-US")} chars
                                </span>
                            </div>

                            {view === "write" ? (
                                <>
                                    <MarkdownToolbar actions={actions} />
                                    <textarea
                                        ref={textareaRef}
                                        id="content"
                                        value={form.content}
                                        onChange={(e) =>
                                            set("content", e.target.value)
                                        }
                                        onKeyDown={(e) => {
                                            if (e.key === "Tab") {
                                                e.preventDefault();
                                                applyCommand((s) =>
                                                    indent(s, e.shiftKey),
                                                );
                                            }
                                        }}
                                        onPaste={(e) => {
                                            const file =
                                                e.clipboardData.files?.[0];
                                            if (
                                                file?.type.startsWith("image/")
                                            ) {
                                                e.preventDefault();
                                                void uploadImage(file);
                                            }
                                        }}
                                        onDrop={(e) => {
                                            const file =
                                                e.dataTransfer.files?.[0];
                                            if (
                                                file?.type.startsWith("image/")
                                            ) {
                                                e.preventDefault();
                                                void uploadImage(file);
                                            }
                                        }}
                                        placeholder="Write in Markdown. Drag or paste an image to upload it."
                                        className="min-h-[34rem] w-full resize-y bg-bg-primary p-6 font-mono text-sm leading-7 text-text-primary placeholder:text-text-muted focus:outline-none"
                                        required
                                    />
                                </>
                            ) : (
                                <div className="min-h-[34rem] overflow-auto bg-bg-primary p-6">
                                    {form.content ? (
                                        // Same measure as the real article
                                        // page, so the preview shows the
                                        // line length readers will get.
                                        <MarkdownRenderer className="prose prose-invert mx-auto max-w-3xl">
                                            {form.content}
                                        </MarkdownRenderer>
                                    ) : (
                                        <p className="text-sm text-text-muted">
                                            Nothing to preview yet.
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) void uploadImage(file);
                                e.target.value = "";
                            }}
                        />
                    </div>
                </div>

                {/* Metadata sidebar */}
                <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
                    <div className="space-y-4 rounded-xl border border-border bg-bg-card p-4">
                        <label className="flex cursor-pointer items-center justify-between gap-3">
                            <span>
                                <MicroLabel>Published</MicroLabel>
                                <span className="mt-0.5 block text-xs text-text-muted">
                                    Drafts stay hidden from /blog
                                </span>
                            </span>
                            <input
                                type="checkbox"
                                checked={form.published}
                                onChange={(e) =>
                                    set("published", e.target.checked)
                                }
                                className="h-4 w-4 accent-[var(--accent)]"
                            />
                        </label>

                        <Field label="Slug" htmlFor="slug">
                            <TextInput
                                id="slug"
                                value={form.slug}
                                onChange={(e) => set("slug", e.target.value)}
                                placeholder="post-slug"
                                className="font-mono text-xs"
                                required
                                readOnly={isEditing}
                            />
                            {isEditing ? (
                                <p className="mt-1 text-xs text-text-muted">
                                    Renaming is not supported here — create a
                                    new post instead.
                                </p>
                            ) : slugTaken ? (
                                <p className="mt-1 text-xs text-red-400">
                                    A post with this slug already exists.
                                </p>
                            ) : null}
                        </Field>

                        <Field label="Date" htmlFor="date">
                            <TextInput
                                id="date"
                                type="date"
                                value={form.date}
                                onChange={(e) => set("date", e.target.value)}
                                required
                            />
                        </Field>

                        <Field label="Category" htmlFor="category">
                            {knownCategories.length > 0 ? (
                                <Select
                                    id="category"
                                    value={form.category}
                                    onChange={(e) =>
                                        set("category", e.target.value)
                                    }
                                >
                                    <option value="">(none)</option>
                                    {knownCategories.map((c) => (
                                        <option key={c} value={c}>
                                            {c}
                                        </option>
                                    ))}
                                    {form.category &&
                                        !knownCategories.includes(
                                            form.category,
                                        ) && (
                                            <option value={form.category}>
                                                {form.category}
                                            </option>
                                        )}
                                </Select>
                            ) : (
                                <TextInput
                                    id="category"
                                    value={form.category}
                                    onChange={(e) =>
                                        set("category", e.target.value)
                                    }
                                    placeholder="e.g. engineering"
                                />
                            )}
                        </Field>

                        <Field label="Tags" htmlFor="tags">
                            <TagInput
                                id="tags"
                                value={form.tags}
                                onChange={(tags) => set("tags", tags)}
                                suggestions={knownTags}
                            />
                        </Field>
                    </div>

                    <div className="space-y-4 rounded-xl border border-border bg-bg-card p-4">
                        <Field
                            label="Description"
                            htmlFor="description"
                            hint="Shown on the /blog list cards and in search results."
                        >
                            <TextArea
                                id="description"
                                value={form.description}
                                onChange={(e) =>
                                    set("description", e.target.value)
                                }
                                rows={3}
                                placeholder="A one-line summary"
                            />
                        </Field>

                        <Field label="Cover image" htmlFor="coverImage">
                            <TextInput
                                id="coverImage"
                                value={form.coverImage}
                                onChange={(e) =>
                                    set("coverImage", e.target.value)
                                }
                                placeholder="https://…"
                                className="font-mono text-xs"
                            />
                            {form.coverImage && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                    src={form.coverImage}
                                    alt=""
                                    className="mt-2 h-24 w-full rounded border border-border object-cover"
                                />
                            )}
                        </Field>

                        <Field
                            label="External URL"
                            htmlFor="externalUrl"
                            hint="Set this to link the card straight to another site."
                        >
                            <TextInput
                                id="externalUrl"
                                value={form.externalUrl}
                                onChange={(e) =>
                                    set("externalUrl", e.target.value)
                                }
                                placeholder="https://…"
                                className="font-mono text-xs"
                            />
                        </Field>
                    </div>
                </aside>
            </div>
        </form>
    );
}
