/**
 * Tool registry — exports all tools and their Gemini function declarations
 */
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { evalExpressionTool } from './eval-expression';
import { fetchWebpageTool } from './fetch-webpage';
import { getTimeTool } from './get-time';

export interface Tool {
  name: string;
  description: string;
  example: string;
  parameters: object;
  execute(args: Record<string, unknown>): Promise<unknown>;
}

const TOOL_LIST: Tool[] = [
  evalExpressionTool,
  fetchWebpageTool,
  getTimeTool,
];

export const TOOLS = TOOL_LIST.map((t) => ({
  name: t.name,
  description: t.description,
  example: t.example,
}));

export const FUNCTION_DECLARATIONS = TOOL_LIST.map((t) => ({
  name: t.name,
  description: t.description,
  parameters: t.parameters,
}));

const TOOL_MAP = new Map(TOOL_LIST.map((t) => [t.name, t]));

const DEFAULT_TIMEOUT_MS = 5000;

export async function executeTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const tool = TOOL_MAP.get(name);
  if (!tool) {
    return { success: false, error: `Tool "${name}" not found` };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const timeoutMs = parseInt((getCloudflareContext() as any).env?.TOOL_TIMEOUT_MS ?? String(DEFAULT_TIMEOUT_MS));

  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`Tool "${name}" timed out after ${timeoutMs}ms`)), timeoutMs)
  );

  try {
    return await Promise.race([tool.execute(args), timeout]);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}
