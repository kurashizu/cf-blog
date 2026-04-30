export const colors = {
  bgPrimary: '#050505',
  bgSecondary: '#0f0f0f',
  bgCard: '#111111',
  border: '#1f1f1f',
  textPrimary: '#f5f5f5',
  textSecondary: '#888888',
  textMuted: '#555555',
  accent: '#ff6b00',
  accentLight: '#ff8534',
} as const;

export type ColorKey = keyof typeof colors;

// Individual color constants for convenience
export const bgPrimary = colors.bgPrimary;
export const bgSecondary = colors.bgSecondary;
export const bgCard = colors.bgCard;
export const border = colors.border;
export const textPrimary = colors.textPrimary;
export const textSecondary = colors.textSecondary;
export const textMuted = colors.textMuted;
export const accent = colors.accent;
export const accentLight = colors.accentLight;