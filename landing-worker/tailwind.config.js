/** @type {import('tailwindcss').Config} */

/* Jelly Pixel is a 12px bitmap face: its glyphs are drawn on a 12px grid and
   are only sharp at whole multiples of it. Every other size resamples that
   grid and comes out soft, which is the one thing a pixel font must not look
   like.
   So the type scale is the grid, not the other way round. Tailwind's own
   ramp is replaced wholesale (not extended) so no unconverted default can
   leak in, and it holds exactly three steps: body, heading and display. 12px
   is the floor -- the site's old 4/6/8/9/10/11px labels all land there, since
   anything smaller has no representable glyph at all.
   Line heights are whole multiples too: a fractional line box lands the grid
   on a half pixel and undoes the alignment even when the size is right. */
const px = (size, line) => [`${size}px`, { lineHeight: `${line}px` }];

export default {
  content: [
    "./src/**/*.{html,js,ts,svelte}",
  ],
  darkMode: 'class',
  theme: {
    // Replaces the scale rather than extending it: every text-* class in the
    // codebase has to resolve to a multiple of 12, including the ones written
    // before this change.
    fontSize: {
      xs: px(12, 24),
      sm: px(12, 24),
      base: px(12, 24),
      lg: px(24, 36),
      xl: px(24, 36),
      '2xl': px(24, 36),
      '3xl': px(36, 48),
      '4xl': px(36, 48),
      '5xl': px(48, 60),
      '6xl': px(48, 60),
    },
    extend: {
      fontFamily: {
        // The pixel face first, with the old stack kept behind it: a glyph
        // Jelly does not carry (and the CJK ranges it is not loaded for)
        // still has somewhere to fall back to.
        mono: ['Jelly Pixel', 'JetBrains Mono', 'Menlo', 'Monaco', 'Courier New', 'monospace'],
        sans: ['Jelly Pixel', 'Inter Tight', 'Inter', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
        display: ['Jelly Pixel', 'Space Grotesk', 'Inter Tight', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
