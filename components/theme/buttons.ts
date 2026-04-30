// Button variant class strings
export const buttonVariants = {
  primary: 'bg-accent text-white hover:bg-accent/90',
  secondary: 'border border-border bg-transparent text-text-primary hover:bg-bg-secondary',
  danger: 'bg-red-600 text-white hover:bg-red-700',
} as const;

export const buttonClasses = {
  base: 'inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-bg-primary disabled:pointer-events-none disabled:opacity-50',
  danger: 'btn-danger',
} as const;
