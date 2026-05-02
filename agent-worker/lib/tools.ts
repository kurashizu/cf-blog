export interface Tool {
  name: string;
  description: string;
  example: string;
}

export const TOOLS: Tool[] = [
  {
    name: 'js',
    description: 'Safe expression evaluator (math, JSON, Date, String, Array)',
    example: 'js 1+2*3',
  },
  {
    name: 'fetch',
    description: 'Fetch URL and convert HTML to Markdown',
    example: 'fetch https://example.com',
  },
  {
    name: 'time',
    description: 'Get current time',
    example: 'time?tz=Sydney',
  },
  {
    name: 'chat',
    description: 'Chat with AI model (default: gemma-4-31b-it)',
    example: 'chat [{"role":"user","parts":[{"text":"Hello!"}]}]',
  },
];
