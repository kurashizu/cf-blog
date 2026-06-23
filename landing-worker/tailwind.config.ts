import type { Config } from "tailwindcss";

const config: Config = {
    content: [
        "./app/**/*.{js,ts,jsx,tsx,mdx}",
        "./components/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        extend: {
            colors: {
                bg: {
                    primary: "var(--bg-primary)",
                    secondary: "var(--bg-secondary)",
                    card: "var(--bg-card)",
                    elevated: "var(--bg-elevated)",
                },
                border: {
                    DEFAULT: "var(--border)",
                    hover: "var(--border-hover)",
                },
                text: {
                    primary: "var(--text-primary)",
                    secondary: "var(--text-secondary)",
                    muted: "var(--text-muted)",
                },
                accent: {
                    DEFAULT: "var(--accent)",
                    hover: "var(--accent-hover)",
                    glow: "var(--accent-glow)",
                    subtle: "var(--accent-subtle)",
                },
            },
            fontFamily: {
                mono: ["SF Mono", "Monaco", "Menlo", "Consolas", "monospace"],
            },
            keyframes: {
                "gradient-flow": {
                    "0%, 100%": {
                        backgroundPosition: "0% 50%",
                        filter: "brightness(1)",
                    },
                    "50%": {
                        backgroundPosition: "100% 50%",
                        filter: "brightness(1.15)",
                    },
                },
                "aurora-drift": {
                    "0%, 100%": { transform: "translate(-50%, -50%) rotate(0deg) scale(1)" },
                    "50%": { transform: "translate(-45%, -55%) rotate(180deg) scale(1.1)" },
                },
                "particle-float": {
                    "0%, 100%": { transform: "translateY(0) translateX(0)" },
                    "50%": { transform: "translateY(-30px) translateX(15px)" },
                },
                "scroll-hint-bounce": {
                    "0%, 100%": { transform: "translateY(0)", opacity: "0.4" },
                    "50%": { transform: "translateY(8px)", opacity: "1" },
                },
                "fade-up": {
                    from: { opacity: "0", transform: "translateY(12px)" },
                    to: { opacity: "1", transform: "translateY(0)" },
                },
            },
            animation: {
                "gradient-flow": "gradient-flow 6s ease infinite",
                "aurora-drift": "aurora-drift 30s ease-in-out infinite",
                "scroll-hint": "scroll-hint-bounce 2s ease-in-out infinite",
                "fade-up": "fade-up 0.6s ease-out both",
            },
        },
    },
    plugins: [],
};

export default config;