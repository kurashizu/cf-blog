"use client";

import { useEffect, useRef, useState } from "react";

interface MermaidProps {
  chart: string;
}

export function Mermaid({ chart }: MermaidProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    import("mermaid").then((mermaid) => {
      mermaid.default.initialize({ startOnLoad: false });
      mermaid.default.render(`mermaid-${Date.now()}`, chart)
        .then(({ svg }: { svg: string }) => {
          if (ref.current) ref.current.innerHTML = svg;
        })
        .catch(() => setError(true));
    });
  }, [chart]);

  if (error) {
    return (
      <pre className="text-red-400 text-xs p-2 bg-red-400/10 rounded overflow-x-auto">
        {chart}
      </pre>
    );
  }

  return <div ref={ref} className="mermaid flex justify-center my-4" />;
}