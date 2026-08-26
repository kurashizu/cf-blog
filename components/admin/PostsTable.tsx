import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Badge, Tag } from "@/components/ui/Tag";
import { type Column, DataTable } from "./ui";

export interface PostRow {
    slug: string;
    title: string;
    /** Already formatted by the caller — keeps this component presentational. */
    date: string;
    category: string;
    tags: string[];
    published: boolean;
}

const MAX_TAGS_SHOWN = 3;

/**
 * The posts list, built on the shared DataTable so it matches every other
 * admin table (this screen used to hand-roll its own thead/td markup with
 * different padding and radii).
 */
export function PostsTable({ rows }: { rows: PostRow[] }) {
    const columns: Column<PostRow>[] = [
        {
            key: "title",
            header: "Title",
            render: (p) => (
                <Link
                    href={`/admin/editor/${p.slug}`}
                    className="group block min-w-0"
                >
                    <span className="block truncate font-medium text-text-primary transition-colors group-hover:text-accent">
                        {p.title || "(untitled)"}
                    </span>
                    <span className="mt-0.5 block truncate font-mono text-xs text-text-muted">
                        /{p.slug}
                    </span>
                </Link>
            ),
            title: (p) => p.title || p.slug,
        },
        {
            key: "tags",
            header: "Taxonomy",
            render: (p) => (
                <span className="flex flex-wrap items-center gap-1">
                    {p.category && <Tag variant="accent">{p.category}</Tag>}
                    {p.tags.slice(0, MAX_TAGS_SHOWN).map((t) => (
                        <Tag key={t}>{t}</Tag>
                    ))}
                    {p.tags.length > MAX_TAGS_SHOWN && (
                        <span className="text-xs text-text-muted">
                            +{p.tags.length - MAX_TAGS_SHOWN}
                        </span>
                    )}
                    {!p.category && p.tags.length === 0 && (
                        <span className="text-text-muted">—</span>
                    )}
                </span>
            ),
            title: (p) => [p.category, ...p.tags].filter(Boolean).join(", "),
        },
        {
            key: "date",
            header: "Date",
            nowrap: true,
            cellClassName: "text-text-muted",
            render: (p) => p.date || "—",
        },
        {
            key: "status",
            header: "Status",
            nowrap: true,
            render: (p) => (
                <Badge variant={p.published ? "success" : "warning"}>
                    {p.published ? "published" : "draft"}
                </Badge>
            ),
        },
        {
            key: "actions",
            header: "",
            align: "right",
            nowrap: true,
            render: (p) => (
                <span className="flex justify-end gap-2">
                    {p.published && (
                        <a
                            href={`/blog/${p.slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            <Button variant="ghost" size="sm">
                                View
                            </Button>
                        </a>
                    )}
                    <Link href={`/admin/editor/${p.slug}`}>
                        <Button variant="secondary" size="sm">
                            Edit
                        </Button>
                    </Link>
                </span>
            ),
        },
    ];

    return (
        <DataTable
            caption="All blog posts"
            columns={columns}
            rows={rows}
            rowKey={(p) => p.slug}
            footer={`${rows.length} post${rows.length === 1 ? "" : "s"}`}
        />
    );
}
