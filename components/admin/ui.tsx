/**
 * Shared admin UI primitives.
 *
 * Before this module every admin page hand-rolled its own table, its own
 * status pill and its own uppercase micro-label — the same class strings
 * copy-pasted 20+ times with drifting padding and colours. Anything that
 * appears on more than one admin screen belongs here.
 *
 * Server-safe: no hooks, no "use client". Client pages can import these
 * freely; interactive pieces take plain props.
 */
import * as React from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/Tag";

/* ── Text ─────────────────────────────────────────────────────────────── */

/** The uppercase micro-label used for table headers, field labels, stats. */
export function MicroLabel({
    className,
    ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
    return (
        <span
            className={cn(
                "text-[0.6875rem] font-semibold uppercase tracking-[0.05em] text-text-muted",
                className,
            )}
            {...props}
        />
    );
}

export function PageHeader({
    title,
    description,
    actions,
}: {
    title: string;
    description?: string;
    actions?: React.ReactNode;
}) {
    return (
        <div className="mb-6 flex items-start justify-between gap-4">
            <div className="min-w-0">
                <h1 className="text-2xl font-bold text-text-primary">
                    {title}
                </h1>
                {description && (
                    <p className="mt-1 text-sm text-text-muted">
                        {description}
                    </p>
                )}
            </div>
            {actions && (
                <div className="flex shrink-0 gap-2">{actions}</div>
            )}
        </div>
    );
}

export function EmptyState({
    children,
    className,
}: {
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <div
            className={cn(
                "rounded-lg border border-border bg-bg-card px-6 py-10 text-center text-sm text-text-muted",
                className,
            )}
        >
            {children}
        </div>
    );
}

/** Non-blocking inline feedback, replacing the old `alert()` calls. */
export function Notice({
    tone,
    children,
    onDismiss,
}: {
    tone: "success" | "error";
    children: React.ReactNode;
    onDismiss?: () => void;
}) {
    return (
        <div
            role="status"
            aria-live="polite"
            className={cn(
                "mb-4 flex items-start justify-between gap-3 rounded-lg border px-4 py-2.5 text-sm",
                tone === "success"
                    ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                    : "border-red-500/20 bg-red-500/10 text-red-400",
            )}
        >
            <span className="min-w-0">{children}</span>
            {onDismiss && (
                <button
                    type="button"
                    onClick={onDismiss}
                    className="shrink-0 opacity-70 transition-opacity hover:opacity-100"
                    aria-label="Dismiss"
                >
                    ✕
                </button>
            )}
        </div>
    );
}

/* ── Stats ────────────────────────────────────────────────────────────── */

/**
 * A stat tile. Deliberately NOT the public `Card`: that one is an
 * interactive affordance (lift on hover, glow) and these don't respond to
 * clicks. It also defaults to `items-center`, which silently centred the
 * old audit tiles.
 */
export function StatTile({
    label,
    value,
    hint,
    tone,
}: {
    label: string;
    value: React.ReactNode;
    hint?: React.ReactNode;
    tone?: "default" | "warn" | "danger";
}) {
    return (
        <div className="rounded-xl border border-border bg-bg-card p-4">
            <MicroLabel className="block">{label}</MicroLabel>
            <div
                className={cn(
                    "mt-1 text-2xl font-bold tabular-nums",
                    tone === "danger"
                        ? "text-red-400"
                        : tone === "warn"
                          ? "text-amber-400"
                          : "text-text-primary",
                )}
            >
                {value}
            </div>
            {hint != null && (
                <div className="mt-1 text-xs text-text-muted">{hint}</div>
            )}
        </div>
    );
}

export function StatGrid({ children }: { children: React.ReactNode }) {
    return (
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            {children}
        </div>
    );
}

/* ── Badges ───────────────────────────────────────────────────────────── */

/**
 * Maps a domain status onto the shared `Badge` primitive, which already
 * has the right variants. Covers both audit vocabularies: the outbound
 * `ok|failed|skipped` and the inbound `ok|rate_limited|unauthorized|
 * bad_request|error`.
 */
export function StatusBadge({
    status,
    suffix,
}: {
    status: string;
    suffix?: string | number | null;
}) {
    const variant =
        status === "ok"
            ? "success"
            : status === "failed" || status === "error"
              ? "error"
              : status === "rate_limited" || status === "unauthorized"
                ? "warning"
                : "info";
    return (
        <Badge variant={variant} className="whitespace-nowrap">
            {status}
            {suffix != null && suffix !== "" ? ` · ${suffix}` : ""}
        </Badge>
    );
}

/* ── Form controls ────────────────────────────────────────────────────── */

const CONTROL_CLASS =
    "w-full rounded-md border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary transition-colors placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20";

export function Field({
    label,
    htmlFor,
    hint,
    children,
    className,
}: {
    label: string;
    htmlFor?: string;
    hint?: string;
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <div className={className}>
            <label htmlFor={htmlFor} className="mb-1.5 block">
                <MicroLabel>{label}</MicroLabel>
            </label>
            {children}
            {hint && <p className="mt-1 text-xs text-text-muted">{hint}</p>}
        </div>
    );
}

export const TextInput = React.forwardRef<
    HTMLInputElement,
    React.InputHTMLAttributes<HTMLInputElement>
>(function TextInput({ className, ...props }, ref) {
    return (
        <input ref={ref} className={cn(CONTROL_CLASS, className)} {...props} />
    );
});

export const TextArea = React.forwardRef<
    HTMLTextAreaElement,
    React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function TextArea({ className, ...props }, ref) {
    return (
        <textarea
            ref={ref}
            className={cn(CONTROL_CLASS, "resize-y", className)}
            {...props}
        />
    );
});

export const Select = React.forwardRef<
    HTMLSelectElement,
    React.SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className, ...props }, ref) {
    return (
        <select
            ref={ref}
            className={cn(CONTROL_CLASS, "py-1.5", className)}
            {...props}
        />
    );
});

/** Labelled `<select>` for filter bars — the admin's most repeated pattern. */
export function FilterSelect({
    id,
    label,
    value,
    onChange,
    options,
    className,
}: {
    id: string;
    label: string;
    value: string;
    onChange: (value: string) => void;
    options: { value: string; label: string }[];
    className?: string;
}) {
    return (
        <Field label={label} htmlFor={id} className={className}>
            <Select
                id={id}
                value={value}
                onChange={(e) => onChange(e.target.value)}
            >
                {options.map((o) => (
                    <option key={o.value} value={o.value}>
                        {o.label}
                    </option>
                ))}
            </Select>
        </Field>
    );
}

export function FilterBar({ children }: { children: React.ReactNode }) {
    return (
        <div className="mb-4 flex flex-wrap items-end gap-3">{children}</div>
    );
}

/* ── Table ────────────────────────────────────────────────────────────── */

export interface Column<T> {
    /** Stable identity for the column — also the React key. */
    key: string;
    header: string;
    align?: "left" | "right";
    nowrap?: boolean;
    /** Extra classes for the body cell. */
    cellClassName?: string;
    render: (row: T) => React.ReactNode;
    /** Native tooltip for truncated content. */
    title?: (row: T) => string | undefined;
}

/**
 * The admin's one table. Every column's alignment, padding and truncation
 * comes from here, so a new screen can't drift into its own dialect.
 *
 * Horizontal overflow scrolls inside the shell rather than pushing the
 * page wide.
 */
export function DataTable<T>({
    columns,
    rows,
    rowKey,
    footer,
    caption,
}: {
    columns: Column<T>[];
    rows: T[];
    rowKey: (row: T) => string | number;
    footer?: React.ReactNode;
    caption?: string;
}) {
    return (
        <div className="overflow-hidden rounded-lg border border-border">
            <div className="overflow-x-auto">
                <table className="w-full border-collapse bg-bg-card text-sm">
                    {caption && <caption className="sr-only">{caption}</caption>}
                    <thead>
                        <tr>
                            {columns.map((c) => (
                                <th
                                    key={c.key}
                                    scope="col"
                                    className={cn(
                                        "border-b border-border bg-bg-secondary px-3 py-2.5 text-[0.6875rem] font-semibold uppercase tracking-[0.05em] text-text-muted",
                                        c.align === "right"
                                            ? "text-right"
                                            : "text-left",
                                        c.nowrap && "whitespace-nowrap",
                                    )}
                                >
                                    {c.header}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="[&>tr:last-child>td]:border-b-0">
                        {rows.map((row) => (
                            <tr
                                key={rowKey(row)}
                                className="transition-colors hover:bg-bg-secondary/40"
                            >
                                {columns.map((c) => (
                                    <td
                                        key={c.key}
                                        title={c.title?.(row)}
                                        className={cn(
                                            "border-b border-border px-3 py-2 align-top text-text-secondary",
                                            c.align === "right" &&
                                                "text-right tabular-nums",
                                            c.nowrap && "whitespace-nowrap",
                                            c.cellClassName,
                                        )}
                                    >
                                        {c.render(row)}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {footer && (
                <div className="border-t border-border bg-bg-secondary px-4 py-2 text-xs text-text-muted">
                    {footer}
                </div>
            )}
        </div>
    );
}

/* ── Pagination ───────────────────────────────────────────────────────── */

/**
 * Offset pagination. The old audit view hardcoded `limit=200`, never sent
 * an offset, and then told you rows were hidden with no way to reach them.
 */
export function Pagination({
    offset,
    limit,
    total,
    onOffsetChange,
    busy,
}: {
    offset: number;
    limit: number;
    total: number;
    onOffsetChange: (offset: number) => void;
    busy?: boolean;
}) {
    const page = Math.floor(offset / limit) + 1;
    const pages = Math.max(1, Math.ceil(total / limit));
    const from = total === 0 ? 0 : offset + 1;
    const to = Math.min(offset + limit, total);

    return (
        <div className="flex flex-wrap items-center justify-between gap-3">
            <span>
                {from}–{to} of {total} (newest first)
            </span>
            <span className="flex items-center gap-2">
                <button
                    type="button"
                    className="rounded border border-border px-2 py-1 transition-colors hover:border-accent hover:text-accent disabled:pointer-events-none disabled:opacity-40"
                    disabled={busy || offset === 0}
                    onClick={() => onOffsetChange(Math.max(0, offset - limit))}
                >
                    ← Prev
                </button>
                <span className="tabular-nums">
                    {page} / {pages}
                </span>
                <button
                    type="button"
                    className="rounded border border-border px-2 py-1 transition-colors hover:border-accent hover:text-accent disabled:pointer-events-none disabled:opacity-40"
                    disabled={busy || offset + limit >= total}
                    onClick={() => onOffsetChange(offset + limit)}
                >
                    Next →
                </button>
            </span>
        </div>
    );
}

/* ── Formatting helpers ───────────────────────────────────────────────── */

/**
 * Audit timestamps are stored as UTC `YYYY-MM-DD HH:MM:SS` by D1's
 * `datetime('now')`. Render them as explicit UTC — the old helper sliced
 * the string and presented UTC as if it were local time.
 */
export function fmtTs(ts: string): string {
    return `${ts.replace("T", " ").slice(0, 19)}Z`;
}

export function fmtNum(n: number | null | undefined): string {
    if (n == null) return "—";
    return n.toLocaleString("en-US");
}
