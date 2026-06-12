/**
 * Shared types for the KurAgent panel.
 *
 * The shapes mirror the SSE event stream emitted by
 * `agent-worker/app/api/chat/route.ts`. If that contract changes, this is
 * the first place to update.
 */

export interface ToolStep {
    tool: string;
    args: Record<string, unknown>;
    status: "pending" | "in_progress" | "completed" | "error";
    result?: unknown;
    iteration: number;
}

export interface Message {
    /** Unique client-generated ID (also used to update messages in place). */
    id: string;
    role: "user" | "model";
    parts: { text: string }[];
    toolSteps?: ToolStep[];
    thinkContent?: string;
    isThinking?: boolean;
    error?: string;
}

export interface SessionMeta {
    id: string;
    createdAt: number;
    lastActiveAt: number;
    title: string;
}

export interface AgentPanelProps {
    expanded?: boolean;
    onCollapse?: () => void;
    onExpand?: () => void;
}

/** Server-sent events that /api/chat emits. */
export type StreamEvent =
    | { type: "start_think"; content: string }
    | { type: "think"; content: string }
    | { type: "end_think"; content: string }
    | { type: "start_text"; content: string }
    | { type: "text"; content: string }
    | { type: "end_text"; content: string }
    | {
          type: "tool_start" | "start_tool";
          tool: string;
          args: Record<string, unknown>;
          iteration?: number;
      }
    | {
          type: "tool_result";
          success: boolean;
          result: unknown;
      }
    | { type: "end_tool"; content: string }
    | { type: "end_process" | "done"; content: string }
    | { type: "error"; content: string; message?: string };

/** Raw shape returned by /api/tool. */
export interface ToolListItem {
    name: string;
    description: string;
}
