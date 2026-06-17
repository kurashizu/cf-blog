"use client";

import { useState, useEffect } from "react";
import { marked } from "marked";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { adminApi } from "@/lib/api";

function markdownToHtml(md: string): string {
    if (!md) return "";
    const result = marked.parse(md, { gfm: true, breaks: true });
    return typeof result === "string" ? result : "";
}

interface PostData {
    title: string;
    slug: string;
    date: string;
    tags: string;
    published: boolean;
    coverImage: string;
    content: string;
}

interface PostEditorProps {
    initialData?: Partial<PostData>;
    onSubmit?: (data: PostData) => void;
    isNewPost?: boolean;
}

export function PostEditor({
    initialData,
    onSubmit,
    isNewPost = false,
}: PostEditorProps) {
    const [title, setTitle] = useState(initialData?.title || "");
    const [slug, setSlug] = useState(initialData?.slug || "");
    const [date, setDate] = useState(
        initialData?.date || new Date().toISOString().split("T")[0],
    );
    const [tags, setTags] = useState(initialData?.tags || "");
    const [published, setPublished] = useState(initialData?.published ?? true);
    const [coverImage, setCoverImage] = useState(initialData?.coverImage || "");
    const [content, setContent] = useState(initialData?.content || "");
    const [preview, setPreview] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [message, setMessage] = useState<{
        type: "success" | "error";
        text: string;
    } | null>(null);

    // Update preview when content changes
    useEffect(() => {
        if (content) {
            const html = markdownToHtml(content);
            setPreview(html);
        } else {
            setPreview("");
        }
    }, [content]);

    // Auto-generate slug from title
    useEffect(() => {
        if (!initialData?.slug && title) {
            const autoSlug = title
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-|-$/g, "");
            setSlug(autoSlug);
        }
    }, [title, initialData?.slug]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setMessage(null);

        const postData: PostData = {
            title,
            slug,
            date,
            tags,
            published,
            coverImage,
            content,
        };

        if (onSubmit) {
            onSubmit(postData);
            return;
        }

        // Default behavior: submit to API
        const isEditing = !!initialData?.slug;
        const endpoint = isEditing ? adminApi.post(slug) : adminApi.posts;
        const method = isEditing ? "PUT" : "POST";

        try {
            const response = await fetch(endpoint, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(postData),
            });

            if (response.ok) {
                setMessage({
                    type: "success",
                    text: "Post saved successfully!",
                });
                // Reset form for new post
                setTitle("");
                setSlug("");
                setContent("");
                setTags("");
                setCoverImage("");
                // Redirect to admin list for new posts
                if (!isEditing) {
                    setTimeout(() => {
                        window.location.href = "/admin";
                    }, 1500);
                }
            } else {
                const error = (await response.json()) as { message?: string };
                setMessage({
                    type: "error",
                    text: error.message || "Failed to save post",
                });
            }
        } catch {
            setMessage({ type: "error", text: "Failed to save post" });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async () => {
        if (!slug || !confirm("Are you sure you want to delete this post?")) {
            return;
        }

        setIsDeleting(true);
        setMessage(null);

        try {
            const response = await fetch(adminApi.post(slug), {
                method: "DELETE",
            });

            if (response.ok) {
                window.location.href = "/admin";
            } else {
                const error = (await response.json()) as { message?: string };
                setMessage({
                    type: "error",
                    text: error.message || "Failed to delete post",
                });
            }
        } catch {
            setMessage({ type: "error", text: "Failed to delete post" });
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="p-0">
            {/* Header with title and actions */}
            <div className="mb-5 flex items-center justify-between">
                <h1 className="text-xl font-bold text-text-primary">
                    {isNewPost ? "New Post" : "Edit Post"}
                </h1>
                <div className="flex gap-2.5">
                    {!isNewPost && (
                        <Button
                            type="button"
                            variant="secondary"
                            className="btn-danger"
                            onClick={handleDelete}
                            disabled={isDeleting}
                        >
                            {isDeleting ? "Deleting..." : "Delete"}
                        </Button>
                    )}
                    <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting ? "Saving..." : "Save Changes"}
                    </Button>
                </div>
            </div>

            {/* Form fields */}
            <div className="space-y-4">
                <div>
                    <label
                        htmlFor="title"
                        className="block text-[0.6875rem] font-semibold uppercase tracking-[0.05em] text-text-muted mb-2"
                    >
                        Title
                    </label>
                    <input
                        id="title"
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Post title"
                        className="w-full px-4 py-3 bg-bg-secondary border border-border rounded-md text-[0.9375rem] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-3 focus:ring-accent/10 transition-all"
                        required
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label
                            htmlFor="slug"
                            className="block text-[0.6875rem] font-semibold uppercase tracking-[0.05em] text-text-muted mb-2"
                        >
                            Slug
                        </label>
                        <input
                            id="slug"
                            type="text"
                            value={slug}
                            onChange={(e) => setSlug(e.target.value)}
                            placeholder="post-slug"
                            className="w-full px-4 py-3 bg-bg-secondary border border-border rounded-md text-[0.9375rem] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-3 focus:ring-accent/10 transition-all"
                            required
                        />
                    </div>

                    <div>
                        <label
                            htmlFor="date"
                            className="block text-[0.6875rem] font-semibold uppercase tracking-[0.05em] text-text-muted mb-2"
                        >
                            Date
                        </label>
                        <input
                            id="date"
                            type="date"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            className="w-full px-4 py-3 bg-bg-secondary border border-border rounded-md text-[0.9375rem] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-3 focus:ring-accent/10 transition-all"
                            required
                        />
                    </div>
                </div>

                <div>
                    <label
                        htmlFor="tags"
                        className="block text-[0.6875rem] font-semibold uppercase tracking-[0.05em] text-text-muted mb-2"
                    >
                        Tags (comma-separated)
                    </label>
                    <input
                        id="tags"
                        type="text"
                        value={tags}
                        onChange={(e) => setTags(e.target.value)}
                        placeholder="tech, tutorial, guide"
                        className="w-full px-4 py-3 bg-bg-secondary border border-border rounded-md text-[0.9375rem] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-3 focus:ring-accent/10 transition-all"
                    />
                </div>

                <div>
                    <label
                        htmlFor="coverImage"
                        className="block text-[0.6875rem] font-semibold uppercase tracking-[0.05em] text-text-muted mb-2"
                    >
                        Cover Image URL
                    </label>
                    <input
                        id="coverImage"
                        type="url"
                        value={coverImage}
                        onChange={(e) => setCoverImage(e.target.value)}
                        placeholder="https://..."
                        className="w-full px-4 py-3 bg-bg-secondary border border-border rounded-md text-[0.9375rem] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-3 focus:ring-accent/10 transition-all"
                    />
                </div>

                <div>
                    <div className="mb-2 flex items-center gap-2">
                        <label
                            htmlFor="published"
                            className="block text-[0.6875rem] font-semibold uppercase tracking-[0.05em] text-text-muted mb-0"
                        >
                            Publish
                        </label>
                        <input
                            type="checkbox"
                            id="published"
                            checked={published}
                            onChange={(e) => setPublished(e.target.checked)}
                            className="h-4 w-4 rounded border-border bg-bg-secondary text-accent focus:ring-accent"
                        />
                    </div>
                </div>
            </div>

            {/* Split Editor/Preview */}
            <div className="mt-6">
                <label className="block text-[0.6875rem] font-semibold uppercase tracking-[0.05em] text-text-muted mb-4">
                    Content
                </label>
                <div className="grid grid-cols-2 gap-4 h-[28rem] mt-4">
                    <div className="flex flex-col bg-bg-card border border-border rounded-xl overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-2.5 bg-bg-secondary border-b border-border text-[0.6875rem] font-semibold uppercase tracking-[0.05em] text-text-muted">
                            Markdown
                        </div>
                        <div className="flex-1 overflow-auto p-4 bg-bg-primary">
                            <textarea
                                id="content"
                                value={content}
                                onChange={(e) => setContent(e.target.value)}
                                placeholder="Write your post content here..."
                                className="w-full h-full bg-transparent border-none resize-none outline-none font-mono text-sm leading-relaxed text-text-primary placeholder:text-text-muted"
                                required
                            />
                        </div>
                    </div>
                    <div className="flex flex-col bg-bg-card border border-border rounded-xl overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-2.5 bg-bg-secondary border-b border-border text-[0.6875rem] font-semibold uppercase tracking-[0.05em] text-text-muted">
                            Preview
                        </div>
                        <div className="flex-1 overflow-auto p-4 bg-bg-primary">
                            {preview ? (
                                <div
                                    className="text-[0.9375rem] leading-relaxed text-text-secondary"
                                    dangerouslySetInnerHTML={{
                                        __html: preview,
                                    }}
                                />
                            ) : (
                                <p className="text-text-muted">
                                    Start typing to see preview...
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {message && (
                <div
                    className={cn(
                        "mt-4 rounded-lg p-4",
                        message.type === "success"
                            ? "bg-green-500/10 text-green-400"
                            : "bg-red-500/10 text-red-400",
                    )}
                >
                    {message.text}
                </div>
            )}
        </form>
    );
}
