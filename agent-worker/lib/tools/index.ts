/**
 * Tool registry — exports all tools and their Gemini function declarations
 */
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

export async function executeTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const tool = TOOL_MAP.get(name);
  if (!tool) {
    return { success: false, error: `Tool "${name}" not found` };
  }
  try {
    return await tool.execute(args);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}