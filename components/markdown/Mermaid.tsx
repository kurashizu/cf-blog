"use client";

import { useEffect, useId, useRef, useState } from "react";

interface MermaidProps {
  chart: string;
}

export function Mermaid({ chart }: MermaidProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);
  // useId is stable and unique per component instance — Date.now() collided
  // when several diagrams in one post mounted in the same tick.
  const reactId = useId();

  useEffect(() => {
    let cancelled = false;
    import("mermaid").then((mermaid) => {
      mermaid.default.initialize({
        startOnLoad: false,
        // Pin explicitly: "strict" keeps htmlLabels/script injection off even
        // if a future mermaid version changes its default.
        securityLevel: "strict",
      });
      // mermaid.render rejects IDs containing ":" (useId wraps in «»/:)
      const domId = `mermaid-${reactId.replace(/[^a-zA-Z0-9]/g, "")}`;
      mermaid.default.render(domId, chart)
        .then(({ svg }: { svg: string }) => {
          // Ignore a slow render that finishes after unmount or after the
          // chart prop already changed — it would overwrite newer output.
          if (!cancelled && ref.current) ref.current.innerHTML = svg;
        })
        .catch(() => {
          if (!cancelled) setError(true);
        });
    });
    return () => {
      cancelled = true;
    };
  }, [chart, reactId]);

  if (error) {
    return (
      <pre className="text-red-400 text-xs p-2 bg-red-400/10 rounded overflow-x-auto">
        {chart}
      </pre>
    );
  }

  return (
    <div className="my-4 overflow-x-auto">
      <div ref={ref} className="mermaid flex justify-center min-w-fit" />
    </div>
  );
}
