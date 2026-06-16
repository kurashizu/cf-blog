import { lint } from "markdownlint/sync";

const VALID_MERMAID_TYPES = new Set([
    "graph",
    "flowchart",
    "sequenceDiagram",
    "classDiagram",
    "stateDiagram",
    "stateDiagram-v2",
    "erDiagram",
    "gantt",
    "pie",
    "journey",
    "timeline",
    "requirementDiagram",
    "gitGraph",
    "mindmap",
    "sankey",
    "xychart",
    "xyChart",
    "block",
    "packet",
    "kanban",
    "info",
    "c4context",
    "c4container",
    "c4component",
    "c4dynamic",
    "c4deployment",
]);

const MERMAID_BLOCK_RE = /```mermaid\n?([\s\S]*?)```/g;
const MERMAID_PIPE_LABELS_RE = /\|.+\|/;

function sanitizeMermaidBody(body: string, diagramType: string): string {
    if (diagramType !== "graph" && diagramType !== "flowchart") {
        return body;
    }
    if (!MERMAID_PIPE_LABELS_RE.test(body)) {
        return body;
    }
    return body.split("\n")
        .map((line) => {
            let inPipe = false;
            let out = "";
            for (const ch of line) {
                if (ch === "|") {
                    inPipe = !inPipe;
                    out += ch;
                } else if (ch === '"' && inPipe) {
                    out += "'";
                } else {
                    out += ch;
                }
            }
            return out;
        })
        .join("\n");
}

export async function validateMarkdown(text: string): Promise<string> {
    let sanitized = text;

    for (const match of text.matchAll(MERMAID_BLOCK_RE)) {
        const body = match[1].trim();
        if (!body) continue;

        const firstLine = body.split("\n")[0]?.trim() ?? "";
        const diagramType = firstLine.split(/\s+/)[0];

        if (!VALID_MERMAID_TYPES.has(diagramType)) {
            throw new Error(
                `Unknown mermaid diagram type "${diagramType}":\n${body.slice(0, 200)}`,
            );
        }

        const lines = body.split("\n").slice(1).join("\n").trim();
        if (!lines) {
            throw new Error(
                `Empty mermaid diagram body for type "${diagramType}"`,
            );
        }

        const sanitizedBody = sanitizeMermaidBody(body, diagramType);
        if (sanitizedBody !== body) {
            sanitized = sanitized.replace(match[0], `\`\`\`mermaid\n${sanitizedBody}\n\`\`\``);
        }
    }

    const results = lint({
        strings: { text: sanitized },
        config: {
            MD013: false,
            MD033: false,
            MD041: false,
            MD047: false,
            MD001: false,
            MD004: false,
            MD007: false,
            MD009: false,
            MD012: false,
            MD014: false,
            MD022: false,
            MD024: false,
            MD026: false,
            MD028: false,
            MD029: false,
            MD031: false,
            MD030: false,
            MD032: false,
            MD034: false,
            MD035: false,
            MD036: false,
            MD037: false,
            MD038: false,
            MD039: false,
            MD045: false,
            MD046: false,
            MD055: false,
            MD056: false,
            MD058: false,
            MD060: false,
        },
    });

    const errors = results.text;
    if (errors.length > 0) {
        const summary = errors
            .map(
                (e) =>
                    `  line ${e.lineNumber}: ${e.ruleNames[0]} ${e.ruleDescription}`,
            )
            .join("\n");
        throw new Error(`Markdown lint errors:\n${summary}`);
    }

    return sanitized;
}
