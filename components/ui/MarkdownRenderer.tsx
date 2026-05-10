"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import type { Components } from "react-markdown";
import { Mermaid } from "./Mermaid";

interface MarkdownRendererProps {
  children: string;
  className?: string;
}

const components: Components = {
  code({ className, children, ...props }) {
    const match = /language-mermaid/.exec(className || "");
    if (match) {
      const chart = String(children).replace(/```mermaid\n?/g, "").replace(/```$/, "");
      return <Mermaid chart={chart} />;
    }
    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  },
};

export function MarkdownRenderer({ children, className }: MarkdownRendererProps) {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={components}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}