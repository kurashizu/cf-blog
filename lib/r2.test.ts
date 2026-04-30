import { describe, it, expect } from 'vitest';
import { parseFrontmatter, buildFrontmatter } from './r2';

describe('parseFrontmatter', () => {
  it('should parse valid frontmatter', () => {
    const content = `---
title: Test Post
date: 2024-01-15
---
# Hello World

This is content.`;

    const result = parseFrontmatter(content);

    expect(result.data).toEqual({
      title: 'Test Post',
      date: '2024-01-15',
    });
    expect(result.body).toBe('# Hello World\n\nThis is content.');
  });

  it('should parse frontmatter with tags array', () => {
    const content = `---
title: Test Post
tags:
  - javascript
  - typescript
  - react
---
Content here`;

    const result = parseFrontmatter(content);

    expect(result.data).toEqual({
      title: 'Test Post',
      tags: ['javascript', 'typescript', 'react'],
    });
  });

  it('should return original content if no frontmatter', () => {
    const content = 'No frontmatter here';

    const result = parseFrontmatter(content);

    expect(result.data).toEqual({});
    expect(result.body).toBe(content);
  });

  it('should handle empty frontmatter', () => {
    // Empty frontmatter still matches the pattern
    const content = `---
---
Just content`;

    const result = parseFrontmatter(content);

    expect(result.data).toEqual({});
    // Body will include the --- markers for empty frontmatter
    expect(result.body).toContain('Just content');
  });

  it('should parse frontmatter with published boolean', () => {
    const content = `---
title: Test
published: true
draft: false
---
Content`;

    const result = parseFrontmatter(content);

    expect(result.data).toEqual({
      title: 'Test',
      published: 'true',
      draft: 'false',
    });
  });

  it('should handle frontmatter with description', () => {
    const content = `---
title: My Article
description: This is a description
author: John Doe
---
Content`;

    const result = parseFrontmatter(content);

    expect(result.data).toEqual({
      title: 'My Article',
      description: 'This is a description',
      author: 'John Doe',
    });
  });

  it('should handle frontmatter with coverImage', () => {
    const content = `---
title: With Image
coverImage: /images/cover.jpg
---
Content`;

    const result = parseFrontmatter(content);

    expect(result.data).toEqual({
      title: 'With Image',
      coverImage: '/images/cover.jpg',
    });
  });
});

describe('buildFrontmatter', () => {
  it('should build simple frontmatter', () => {
    const data = {
      title: 'Test Post',
      date: '2024-01-15',
    };

    const result = buildFrontmatter(data);

    expect(result).toBe(`---
title: Test Post
date: 2024-01-15
---`);
  });

  it('should build frontmatter with array values', () => {
    const data = {
      title: 'Test',
      tags: ['javascript', 'typescript'],
    };

    const result = buildFrontmatter(data);

    expect(result).toBe(`---
title: Test
tags:
  - javascript
  - typescript
---`);
  });

  it('should build frontmatter with boolean values', () => {
    const data = {
      published: true,
      draft: false,
    };

    const result = buildFrontmatter(data);

    expect(result).toBe(`---
published: true
draft: false
---`);
  });

  it('should build frontmatter with number values', () => {
    const data = {
      priority: 1,
      views: 100,
    };

    const result = buildFrontmatter(data);

    expect(result).toBe(`---
priority: 1
views: 100
---`);
  });

  it('should handle empty data object', () => {
    const result = buildFrontmatter({});

    expect(result).toBe(`---
---`);
  });

  it('should skip null and undefined values', () => {
    const data: Record<string, unknown> = {
      title: 'Test',
      description: undefined,
      author: null,
    };

    const result = buildFrontmatter(data);

    expect(result).toBe(`---
title: Test
---`);
  });

  it('should round-trip parse and build frontmatter', () => {
    const data = {
      title: 'Round Trip Test',
      date: '2024-01-15',
      tags: ['test', 'demo'],
      published: true,
    };

    const frontmatterStr = buildFrontmatter(data);
    const content = `${frontmatterStr}\n\nActual content here`;

    const parsed = parseFrontmatter(content);
    const rebuilt = buildFrontmatter(parsed.data);

    expect(rebuilt).toContain('title: Round Trip Test');
    expect(rebuilt).toContain('date: 2024-01-15');
    expect(rebuilt).toContain('tags:');
  });
});
