// Animation class utilities for reusable effects

export const animations = {
  // Entrance animations
  fadeInUp: 'animate-fade-in-up',
  fadeInScale: 'animate-fade-in-scale',
  slideInLeft: 'animate-slide-in-left',
  glowPulse: 'animate-glow-pulse',
  float: 'animate-float',
  blob: 'animate-blob',

  // Hover effects
  cardGlowHover: 'card-glow-hover',
  hoverScale: 'hover-scale',

  // Text effects
  gradientText: 'gradient-text',
  neonText: 'neon-text',

  // Link effects
  linkUnderlineAnimate: 'link-underline-animate',
  btnGlow: 'btn-glow',
} as const;

export const animationDelays = {
  100: 'delay-100',
  200: 'delay-200',
  300: 'delay-300',
  400: 'delay-400',
  500: 'delay-500',
  600: 'delay-600',
  700: 'delay-700',
  800: 'delay-800',
} as const;

export function delayClass(ms: number): string {
  if (ms <= 100) return animationDelays[100];
  if (ms <= 200) return animationDelays[200];
  if (ms <= 300) return animationDelays[300];
  if (ms <= 400) return animationDelays[400];
  if (ms <= 500) return animationDelays[500];
  if (ms <= 600) return animationDelays[600];
  if (ms <= 700) return animationDelays[700];
  return animationDelays[800];
}