// CSS variable names for type-safe references
export const color = {
  bg: {
    primary: 'var(--bg-primary)',
    secondary: 'var(--bg-secondary)',
    card: 'var(--bg-card)',
  },
  border: 'var(--border)',
  text: {
    primary: 'var(--text-primary)',
    secondary: 'var(--text-secondary)',
    muted: 'var(--text-muted)',
  },
  accent: {
    DEFAULT: 'var(--accent)',
    light: 'var(--accent-light)',
  },
} as const;

export const spacing = {
  xs: '4px',
  sm: '8px',
  md: '16px',
  lg: '24px',
  xl: '32px',
  '2xl': '48px',
  '3xl': '64px',
} as const;

export const typography = {
  sectionTitle: 'section-title',
  pageTitle: 'page-title',
  heroTitle: 'hero-title',
  heroSubtitle: 'hero-subtitle',
  heroBio: 'hero-bio',
  articleTitle: 'article-title',
  articleDesc: 'article-desc',
  articleMeta: 'article-meta',
} as const;
