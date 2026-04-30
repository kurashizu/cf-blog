import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: "#050505",
          secondary: "#0f0f0f",
          card: "#111111",
        },
        border: "#1f1f1f",
        text: {
          primary: "#f5f5f5",
          secondary: "#888888",
          muted: "#555555",
        },
        accent: {
          DEFAULT: "#ff6b00",
          light: "#ff8534",
        },
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};

export default config;