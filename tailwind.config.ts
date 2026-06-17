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
            borderRadius: {
                sm: "var(--radius-sm)",
                md: "var(--radius-md)",
                lg: "var(--radius-lg)",
                xl: "var(--radius-xl)",
            },
            transitionDuration: {
                fast: "150ms",
                base: "200ms",
                slow: "300ms",
            },
            keyframes: {
                "glow-pulse": {
                    "0%, 100%": {
                        boxShadow:
                            "0 0 20px var(--accent-glow), 0 0 40px var(--accent-subtle), inset 0 0 20px var(--accent-subtle)",
                        borderColor: "var(--accent)",
                        textShadow: "0 0 10px var(--accent-glow)",
                    },
                    "50%": {
                        boxShadow:
                            "0 0 35px var(--accent-glow), 0 0 70px var(--accent-subtle), inset 0 0 35px var(--accent-subtle)",
                        borderColor: "var(--accent-hover)",
                        textShadow: "0 0 20px var(--accent-glow)",
                    },
                },
                "glow-border": {
                    "0%, 100%": {
                        borderColor: "var(--accent)",
                        boxShadow:
                            "0 0 15px var(--accent-glow), 0 0 30px var(--accent-subtle)",
                    },
                    "50%": {
                        borderColor: "var(--accent-hover)",
                        boxShadow:
                            "0 0 25px var(--accent-glow), 0 0 50px var(--accent-subtle)",
                    },
                },
                "text-glow": {
                    "0%": {
                        textShadow:
                            "0 0 10px var(--accent-glow), 0 0 20px var(--accent-subtle)",
                    },
                    "100%": {
                        textShadow:
                            "0 0 20px var(--accent-glow), 0 0 40px var(--accent-subtle), 0 0 60px var(--accent-subtle)",
                    },
                },
                "fade-in": {
                    from: { opacity: "0" },
                    to: { opacity: "1" },
                },
                "fade-out": {
                    from: { opacity: "1" },
                    to: { opacity: "0" },
                },
                "scale-in": {
                    from: { opacity: "0", transform: "translateY(10px)" },
                    to: { opacity: "1", transform: "translateY(0)" },
                },
                "slide-up": {
                    from: { opacity: "0", transform: "translateY(12px)" },
                    to: { opacity: "1", transform: "translateY(0)" },
                },
                "slide-down": {
                    from: { opacity: "1", transform: "translateY(0)" },
                    to: { opacity: "0", transform: "translateY(12px)" },
                },
                "page-enter": {
                    from: { opacity: "0", transform: "translateY(8px)" },
                    to: { opacity: "1", transform: "translateY(0)" },
                },
                "hero-gradient": {
                    "0%": { backgroundPosition: "0% 50%" },
                    "50%": { backgroundPosition: "100% 50%" },
                    "100%": { backgroundPosition: "0% 50%" },
                },
                "fade-up": {
                    from: { opacity: "0", transform: "translateY(12px)" },
                    to: { opacity: "1", transform: "translateY(0)" },
                },
                "fade-up-sm": {
                    from: { opacity: "0", transform: "translateY(8px)" },
                    to: { opacity: "1", transform: "translateY(0)" },
                },
                "fade-zoom": {
                    from: { opacity: "0", transform: "translateY(10px)" },
                    to: { opacity: "1", transform: "translateY(0)" },
                },
                "bg-drift": {
                    "0%, 100%": { transform: "translate(-50%, -50%) scale(1)" },
                    "50%": { transform: "translate(-45%, -55%) scale(1.1)" },
                },
                "gradient-flow": {
                    "0%, 100%": {
                        backgroundPosition: "0% 50%",
                        filter: "brightness(1)",
                    },
                    "50%": {
                        backgroundPosition: "100% 50%",
                        filter: "brightness(1.1)",
                    },
                },
            },
            animation: {
                glow: "glow-pulse 2s ease-in-out infinite",
                "glow-text": "glow-pulse 2s ease-in-out infinite",
                "glow-border": "glow-border 2.5s ease-in-out infinite",
                "text-glow": "text-glow 2s ease-in-out infinite alternate",
                fadeIn: "fade-in 0.25s ease-out forwards",
                fadeOut: "fade-out 0.2s ease-out forwards",
                scaleIn: "scale-in 0.25s ease-out forwards",
                slideUp: "slide-up 0.25s ease-out forwards",
                slideDown: "slide-down 0.18s ease-in forwards",
                "page-enter": "page-enter 0.28s ease-out both",
                "hero-gradient": "hero-gradient 4s ease-in-out infinite",
                "fade-up": "fade-up 0.3s ease-out both",
                "fade-up-sm": "fade-up-sm 0.25s ease-out both",
                "fade-zoom": "fade-zoom 0.3s ease-out both",
                "bg-drift": "bg-drift 25s ease-in-out infinite",
                "gradient-flow": "gradient-flow 4s ease infinite",
            },
            fontFamily: {
                mono: ["SF Mono", "Monaco", "Menlo", "Consolas", "monospace"],
            },
            typography: {
                DEFAULT: {
                    css: {
                        "--tw-prose-body": "var(--text-secondary)",
                        "--tw-prose-headings": "var(--text-primary)",
                        "--tw-prose-links": "var(--accent)",
                        "--tw-prose-bold": "var(--text-primary)",
                        "--tw-prose-code": "var(--accent)",
                        "--tw-prose-pre-bg": "var(--bg-secondary)",
                        "--tw-prose-quotes": "var(--text-muted)",
                        "--tw-prose-quote-borders": "var(--accent)",
                        "--tw-prose-th-borders": "var(--border)",
                        "--tw-prose-td-borders": "var(--border)",
                        "--tw-prose-invert-body": "var(--text-secondary)",
                        "--tw-prose-invert-headings": "var(--text-primary)",
                        "--tw-prose-invert-links": "var(--accent)",
                        "--tw-prose-invert-bold": "var(--text-primary)",
                        "--tw-prose-invert-code": "var(--accent)",
                        "--tw-prose-invert-pre-bg": "var(--bg-secondary)",
                        "--tw-prose-invert-quotes": "var(--text-muted)",
                        "--tw-prose-invert-quote-borders": "var(--accent)",
                        "--tw-prose-invert-th-borders": "var(--border)",
                        "--tw-prose-invert-td-borders": "var(--border)",
                        code: {
                            fontWeight: "400",
                            padding: "0.125rem 0.375rem",
                            borderRadius: "var(--radius-sm)",
                            "&::before": { content: "none" },
                            "&::after": { content: "none" },
                        },
                        "code::before": { content: "none" },
                        "code::after": { content: "none" },
                        "pre code": {
                            background: "none",
                            padding: "0",
                            color: "var(--text-primary)",
                        },
                        a: {
                            textDecoration: "none",
                            borderBottom: "1px solid transparent",
                            transition: "border-color var(--transition-fast)",
                            "&:hover": {
                                borderBottomColor: "var(--accent)",
                            },
                        },
                    },
                },
            },
        },
    },
    plugins: [require("@tailwindcss/typography")],
};

export default config;
