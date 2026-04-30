/**
 * Parse YAML-like frontmatter from markdown content
 */
export function parseFrontmatter(content: string): { data: Record<string, unknown>; body: string } {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return { data: {}, body: content };
  }

  const frontmatterStr = match[1];
  const body = match[2];
  const data: Record<string, unknown> = {};

  const lines = frontmatterStr.split('\n');
  let currentKey = '';
  let currentArray: string[] = [];

  for (const line of lines) {
    if (line.trimStart().startsWith('- ')) {
      const value = line.trimStart().substring(2).trim();
      if (value) currentArray.push(value);
      continue;
    }

    if (currentArray.length > 0 && !line.includes(':')) {
      data[currentKey] = [...currentArray];
      currentArray = [];
    }

    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.substring(0, colonIndex).trim();
      const value = line.substring(colonIndex + 1).trim();

      if (currentArray.length > 0) {
        data[currentKey] = [...currentArray];
        currentArray = [];
      }

      if (value === '') {
        currentKey = key;
      } else {
        data[key] = value;
        currentKey = '';
      }
    }
  }

  if (currentArray.length > 0) {
    data[currentKey] = currentArray;
  }

  return { data, body };
}

/**
 * Build YAML frontmatter string from data object
 */
export function buildFrontmatter(data: Record<string, unknown>): string {
  const lines: string[] = ['---'];

  for (const [key, value] of Object.entries(data)) {
    if (Array.isArray(value)) {
      lines.push(`${key}:`);
      for (const item of value) {
        lines.push(`  - ${item}`);
      }
    } else if (typeof value === 'boolean') {
      lines.push(`${key}: ${value}`);
    } else if (typeof value === 'number') {
      lines.push(`${key}: ${value}`);
    } else if (value !== undefined && value !== null) {
      lines.push(`${key}: ${value}`);
    }
  }

  lines.push('---');
  return lines.join('\n');
}
