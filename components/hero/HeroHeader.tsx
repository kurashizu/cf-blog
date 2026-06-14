interface HeroHeaderProps {
    title: string;
}

/**
 * Hero header with flowing gradient animation on the title.
 * Respects `prefers-reduced-motion`.
 */
export function HeroHeader({ title }: HeroHeaderProps) {
    return (
        <h1
            className="hero-title hero-title--animated animate-fade-up"
            style={{ animationDelay: "0ms" }}
            aria-label={title}
        >
            {title}
        </h1>
    );
}
