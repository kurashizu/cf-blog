"use client";

import { useRef, useState, useEffect } from "react";
import { type ContributionsCache, buildHeatmap } from "@/lib/contributions";
import { ContributionsHeatmap } from "./ContributionsHeatmap";

interface ContributionsRibbonProps {
    data: ContributionsCache;
}

export function ContributionsRibbon({ data }: ContributionsRibbonProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState(0);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        const updateWidth = () => setWidth(el.clientWidth);
        updateWidth();

        const observer = new ResizeObserver(updateWidth);
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    const view = width > 0 ? buildHeatmap(data, width) : null;

    return (
        <div ref={containerRef} className="contributions-ribbon">
            {view && view.cols > 0 ? (
                <ContributionsHeatmap view={view} />
            ) : (
                <div style={{ height: 28 }} />
            )}
        </div>
    );
}
