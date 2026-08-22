/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        mono: ['JetBrains Mono', 'Menlo', 'Monaco', 'Courier New', 'monospace'],
        sans: ['Inter Tight', 'Inter', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
        display: ['Space Grotesk', 'Inter Tight', 'sans-serif'],
      },
      colors: {
        matte: {
          bg: 'var(--matte-bg)',
          card: 'var(--matte-card)',
          'card-hover': 'var(--matte-card-hover)',
          border: 'var(--matte-border)',
          'border-hover': 'var(--matte-border-hover)',
          text: 'var(--matte-text)',
          muted: 'var(--matte-muted)',
          faint: 'var(--matte-faint)',
          accent: 'var(--matte-accent)',
          'accent-glow': 'var(--matte-accent-glow)',
          tag: 'var(--matte-tag)',
          highlight: 'var(--matte-highlight)',
        }
      },
      animation: {
        'pulse-subtle': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'draw-path': 'draw 1.6s cubic-bezier(0.65, 0, 0.35, 1) forwards',
      },
      keyframes: {
        draw: {
          '0%': { strokeDashoffset: '1000' },
          '100%': { strokeDashoffset: '0' }
        }
      }
    },
  },
  plugins: [],
}
