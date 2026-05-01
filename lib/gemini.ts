/**
 * Gemini API wrapper
 * API Docs: https://ai.google.dev/gemini-api/docs
 */

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * System prompt for kurashizu's AI assistant
 */
export const SYSTEM_PROMPT = `You are Kurashizu's AI assistant. Kurashizu is an IT Master's student and software engineer passionate about:

- AI & Infrastructure: building agentic workflows, exploring HPC, pushing human-computer interaction boundaries
- Automation and performance optimization
- Clean UI design

Background:
- Currently pursuing an IT Master's degree
- Strong focus on cloud infrastructure, serverless architectures, and developer tooling
- Experienced with NixOS, Arch Linux, Zed, Neovim, Zsh, Fish

Social links:
- GitHub: https://github.com/kurashizu
- Gmail: kurashizu123@gmail.com
- Bilibili: https://space.bilibili.com/17886260

Communication style:
- Helpful, technical, concise
- Can discuss programming, cloud infrastructure, AI/ML, developer tools
- Share knowledge in a clear, accessible way

When asked about Kurashizu or yourself, refer to this context. If you don't know something, say so honestly.`;

const DEFAULT_SYSTEM = SYSTEM_PROMPT;

function buildContents(messages: GeminiMessage[]) {
  return messages.map((m) => ({
    role: m.role,
    parts: m.parts,
  }));
}

function buildBody(contents: ReturnType<typeof buildContents>, systemInstruction?: string, options?: GeminiGenerateOptions) {
  const body: Record<string, unknown> = {
    contents,
  };

  if (systemInstruction) {
    body.systemInstruction = {
      parts: [{ text: systemInstruction }],
    };
  }

  if (options) {
    body.generationConfig = {
      temperature: options.temperature,
      maxOutputTokens: options.maxTokens,
      topP: options.topP,
      topK: options.topK,
    };
  }

  return body;
}

export interface GeminiMessage {
  role: 'user' | 'model';
  parts: { text: string }[];
}

export interface GeminiGenerateOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
}

export interface GeminiGenerateResult {
  text: string;
  usage?: {
    promptTokens: number;
    candidatesTokens: number;
    totalTokens: number;
  };
}

import { getCloudflareContext } from '@opennextjs/cloudflare';

function getApiKey(): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { env } = getCloudflareContext() as any;
  return env.GEMINI_API_KEY as string;
}

function getCurrentModel(): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { env } = getCloudflareContext() as any;
  return (env.GEMINI_MODEL as string) || 'gemini-2.5-flash-lite';
}

async function fetchAI<T>(path: string, body: unknown): Promise<T> {
  const apiKey = getApiKey();
  const model = getCurrentModel();
  const url = `${GEMINI_API_BASE}/models/${model}:${path}?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${error}`);
  }

  return response.json() as Promise<T>;
}

/**
 * Generate content with Gemini
 */
export async function generateContent(
  messages: GeminiMessage[],
  options?: GeminiGenerateOptions
): Promise<GeminiGenerateResult> {
  const contents = buildContents(messages);
  const body = buildBody(contents, DEFAULT_SYSTEM, options);

  const data = await fetchAI<{
    candidates?: { content: { parts: { text: string }[] } }[];
    usageMetadata?: {
      promptTokenCount: number;
      candidatesTokenCount: number;
      totalTokenCount: number;
    };
  }>('generateContent', body);

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

  return {
    text,
    usage: data.usageMetadata
      ? {
          promptTokens: data.usageMetadata.promptTokenCount,
          candidatesTokens: data.usageMetadata.candidatesTokenCount,
          totalTokens: data.usageMetadata.totalTokenCount,
        }
      : undefined,
  };
}

/**
 * Generate content with streaming
 */
export async function* generateContentStream(
  messages: GeminiMessage[],
  options?: GeminiGenerateOptions
): AsyncGenerator<string> {
  const apiKey = getApiKey();
  const model = getCurrentModel();

  const contents = buildContents(messages);
  const body = buildBody(contents, DEFAULT_SYSTEM, options);

  const url = `${GEMINI_API_BASE}/models/${model}:streamGenerateContent?key=${apiKey}&alt=sse`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${error}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const json = line.slice(6);
        if (json) {
          try {
            const data = JSON.parse(json);
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) yield text;
          } catch {
            // skip invalid JSON
          }
        }
      }
    }
  }
}

/**
 * Simple chat helper - takes a single prompt string with system prompt prepended
 */
export async function chat(
  prompt: string,
  options?: GeminiGenerateOptions
): Promise<GeminiGenerateResult> {
  const messages: GeminiMessage[] = [{ role: 'user', parts: [{ text: prompt }] }];
  return generateContent(messages, options);
}

/**
 * Generate content - system prompt is applied by default via generateContent/generateContentStream
 */
export async function generateContentWithContext(
  messages: GeminiMessage[],
  options?: GeminiGenerateOptions
): Promise<GeminiGenerateResult> {
  return generateContent(messages, options);
}

/**
 * Generate content with streaming - system prompt is applied by default via generateContentStream
 */
export async function* generateContentStreamWithContext(
  messages: GeminiMessage[],
  options?: GeminiGenerateOptions
): AsyncGenerator<string> {
  yield* generateContentStream(messages, options);
}