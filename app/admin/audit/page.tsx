"use client";

import { useState } from "react";
import { PageHeader } from "@/components/admin/ui";
import { AccessLogView } from "@/components/admin/AccessLogView";
import { AuditLogView } from "@/components/admin/AuditLogView";
import { cn } from "@/lib/utils";

type Tab = "inbound" | "outbound";

const TABS: { id: Tab; label: string; hint: string }[] = [
    {
        id: "inbound",
        label: "Inbound requests",
        hint: "Who called our APIs — IP, geo, model and tokens they spent.",
    },
    {
        id: "outbound",
        label: "Outbound calls",
        hint: "Calls we made to Gemini, GitHub, Artificial Analysis and HN.",
    },
];

export default function AuditPage() {
    const [tab, setTab] = useState<Tab>("inbound");
    const active = TABS.find((t) => t.id === tab)!;

    return (
        <div>
            <PageHeader title="Audit" description={active.hint} />

            <div
                role="tablist"
                aria-label="Audit source"
                className="mb-6 flex gap-1 border-b border-border"
            >
                {TABS.map((t) => (
                    <button
                        key={t.id}
                        role="tab"
                        type="button"
                        aria-selected={tab === t.id}
                        onClick={() => setTab(t.id)}
                        className={cn(
                            "-mb-px border-b-2 px-4 py-2 text-sm transition-colors",
                            tab === t.id
                                ? "border-accent font-medium text-accent"
                                : "border-transparent text-text-muted hover:text-text-primary",
                        )}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {/* Both views own their filters and paging; mounting only the
                active one keeps a hidden tab from polling in the background. */}
            {tab === "inbound" ? <AccessLogView /> : <AuditLogView />}
        </div>
    );
}
