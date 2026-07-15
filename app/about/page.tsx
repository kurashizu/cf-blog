import Link from "next/link";
import {
    ArrowUpRight,
    BookOpen,
    Bot,
    Cloud,
    Code,
    Cpu,
    Film,
    Globe,
    Home,
    Link as LinkIcon,
    Mail,
    MessageCircle,
    MessageSquare,
    Newspaper,
    Package,
    Rss,
    Server,
    Share2,
    Terminal,
    Tv,
    type LucideIcon,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/Card";
import { createAboutLinksRepo, type AboutLink } from "@/lib/about-links";
import { SOCIAL_LINKS } from "@/lib/social-links";

export const metadata = {
    title: "About",
    description: "About Kurashizu - software engineer and writer.",
};

// /about reads from D1 (via lib/about-links). Next.js would otherwise try
// to prerender it as static, which fails because getCloudflareContext
// isn't available at build time. Mark it dynamic so it renders at request time.
export const dynamic = "force-dynamic";

type TechItem = string;
type TechGroup = {
    category: string;
    icon: LucideIcon;
    items: TechItem[];
    sublabel?: string;
    subitems?: TechItem[];
};

const techStack: TechGroup[] = [
    {
        category: "Edge",
        icon: Cloud,
        items: ["Cloudflare Workers", "cloudflared", "OpenNext"],
        sublabel: "Bindings",
        subitems: ["D1", "R2", "KV", "Vectorize"],
    },
    {
        category: "Local",
        icon: Server,
        items: ["Arch Linux", "MacOS", "KDE Plasma"],
        sublabel: "System",
        subitems: ["btrfs", "zram", "zstd"],
    },
    {
        category: "Inference",
        icon: Cpu,
        items: ["llama.cpp", "ROCm (AMD GPU)", "gguf"],
        sublabel: "Models",
        subitems: [
            "gemma-4-31b-it",
            "Gemini Embedding 2",
            "Llama-3.2-1B",
            "Qwen3-1.7B",
        ],
    },
    {
        category: "Media",
        icon: Film,
        items: ["FFmpeg", "VAAPI", "yt-dlp"],
        sublabel: "Codecs",
        subitems: ["AV1", "AVIF", "Opus"],
    },
    {
        category: "Editor",
        icon: Terminal,
        items: ["Zed", "Vim", "OpenCode"],
        sublabel: "Shell",
        subitems: ["tmux", "konsole", "Bash"],
    },
    {
        category: "Toolchain",
        icon: Package,
        items: ["uv", "cargo", "npm"],
    },
];

// Map of icon name (stored in D1) -> lucide component.
// Falls back to LinkIcon for any unknown name so missing icons don't crash the page.
// NOTE: lucide-react 1.24 doesn't ship brand icons (Github / Twitter), so
// `github` and `twitter` key off generic semantic icons (Code / MessageCircle).
const ICON_MAP: Record<string, LucideIcon> = {
    // Default fallback
    link: LinkIcon,

    // Websites / blogs
    globe: Globe,
    home: Home,
    newspaper: Newspaper,
    book: BookOpen,

    // Code / projects
    github: Code,
    code: Code,
    bot: Bot,

    // Communication
    mail: Mail,
    twitter: MessageCircle,
    mastodon: MessageCircle,
    "message-square": MessageSquare,

    // Media
    tv: Tv,
    rss: Rss,
    "rss-feed": Rss,

    // Sharing
    "share-2": Share2,
};

function resolveIcon(name: string): LucideIcon {
    return ICON_MAP[name] ?? LinkIcon;
}

export default async function AboutPage() {
    const repo = createAboutLinksRepo();
    const [quickLinks, friends] = await Promise.all([
        repo.getVisibleByGroup("quick-links"),
        repo.getVisibleByGroup("friends"),
    ]);

    return (
        <div className="max-w-4xl mx-auto px-4 py-12">
            <div className="text-[1.75rem] font-bold text-text-primary mb-8">
                <h1>About Me</h1>
            </div>

            <section className="mb-12 text-text-secondary leading-relaxed space-y-4">
                <p>
                    Most of what I build is{" "}
                    <strong className="text-text-primary">plumbing</strong>{" "}
                    — turning &ldquo;I have to do this by hand&rdquo; into
                    &ldquo;I have a one-line command for that.&rdquo; I work
                    mostly at the edge, with side trips into local LLMs, media
                    pipelines, and the occasional PCB.
                </p>
                <p>
                    I&apos;m currently focused on{" "}
                    <strong className="text-text-primary">
                        AI agents at the edge
                    </strong>{" "}
                    and{" "}
                    <strong className="text-text-primary">
                        local LLM serving
                    </strong>{" "}
                    — learning in public as I go.
                </p>
                <p>
                    IT Master&apos;s student at UNSW. Based in Sydney. Writes
                    in TypeScript and Python, solders on weekends.
                </p>
            </section>

            <section className="mb-12">
                <h2 className="text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-text-muted mb-4">
                    Stack
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-start">
                    {techStack.map((group) => {
                        const Icon = group.icon;
                        return (
                            <div key={group.category} className="h-full">
                                <Card
                                    className="group h-full min-h-[210px] transition-all hover:border-accent"
                                >
                                    <CardContent className="pt-5 flex flex-col h-full">
                                        <div className="mb-3 text-text-muted group-hover:text-accent transition-colors">
                                            <Icon size={28} strokeWidth={1.5} />
                                        </div>
                                        <code className="text-xs text-text-muted uppercase tracking-wider mb-3 block">
                                            {group.category}
                                        </code>
                                        <div className="space-y-1">
                                            {group.items.map((item) => (
                                                <span
                                                    key={item}
                                                    className="block text-sm text-text-primary font-mono"
                                                >
                                                    {item}
                                                </span>
                                            ))}
                                        </div>
                                        {group.sublabel && group.subitems && (
                                            <div
                                                className="max-h-0 overflow-hidden opacity-0
                                                           group-hover:max-h-[300px] group-hover:opacity-100
                                                           group-hover:mt-3 group-hover:pt-3 group-hover:border-t group-hover:border-border
                                                           transition-all duration-300 ease-out"
                                            >
                                                <code className="text-[0.6rem] text-text-muted uppercase tracking-wider mb-2 block">
                                                    {group.sublabel}
                                                </code>
                                                <div className="flex flex-wrap gap-x-1.5 gap-y-1 text-xs font-mono text-text-muted">
                                                    {group.subitems.map(
                                                        (item, i) => (
                                                            <span
                                                                key={item}
                                                                className="inline-flex items-center"
                                                            >
                                                                {i > 0 && (
                                                                    <span className="text-text-muted/50 mr-1.5">
                                                                        ·
                                                                    </span>
                                                                )}
                                                                {item}
                                                            </span>
                                                        ),
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            </div>
                        );
                    })}
                </div>
            </section>

            {/* SOCIAL — hardcoded */}
            <section>
                <h2 className="text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-text-muted mb-4">
                    Social
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {SOCIAL_LINKS.map((link) => (
                        <Link
                            key={link.name}
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            <Card className="group text-center h-full transition-all hover:-translate-y-1 hover:shadow-[0_8px_30px_rgba(0,0,0,0.4)]">
                                <CardContent className="flex flex-col items-center py-6">
                                    <span className="text-accent mb-3">
                                        <link.icon size={24} />
                                    </span>
                                    <span className="font-medium text-text-primary">
                                        {link.name}
                                    </span>
                                    <span className="mt-3 text-text-muted inline-flex items-center gap-1 text-xs">
                                        Visit
                                        <ArrowUpRight
                                            size={12}
                                            className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                                        />
                                    </span>
                                </CardContent>
                            </Card>
                        </Link>
                    ))}
                </div>
            </section>

            {/* QUICK LINKS — group_name = 'quick-links' (medium cards) */}
            {quickLinks.length > 0 && (
                <section className="mt-12">
                    <h2 className="text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-text-muted mb-4">
                        Quick Links
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        {quickLinks.map((link: AboutLink) => {
                            const Icon = resolveIcon(link.icon);
                            return (
                                <Link
                                    key={link.id}
                                    href={link.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    <Card className="group text-center h-full transition-all hover:-translate-y-1 hover:shadow-[0_8px_30px_rgba(0,0,0,0.4)]">
                                        <CardContent className="flex flex-col items-center py-6">
                                            <span className="text-accent mb-3">
                                                <Icon size={24} />
                                            </span>
                                            <span className="font-medium text-text-primary">
                                                {link.name}
                                            </span>
                                            {link.description && (
                                                <span className="text-xs text-text-muted mt-1">
                                                    {link.description}
                                                </span>
                                            )}
                                            <span className="mt-3 text-text-muted inline-flex items-center gap-1 text-xs">
                                                Visit
                                                <ArrowUpRight
                                                    size={12}
                                                    className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                                                />
                                            </span>
                                        </CardContent>
                                    </Card>
                                </Link>
                            );
                        })}
                    </div>
                </section>
            )}

            {/* FRIENDS — group_name = 'friends' (mini rows) */}
            {friends.length > 0 && (
                <section className="mt-12">
                    <h2 className="text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-text-muted mb-4">
                        Friends
                    </h2>
                    <ul className="flex flex-wrap gap-x-4 gap-y-2">
                        {friends.map((link: AboutLink) => {
                            const Icon = resolveIcon(link.icon);
                            return (
                                <li key={link.id}>
                                    <Link
                                        href={link.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="group inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-accent transition-colors"
                                    >
                                        <Icon size={14} strokeWidth={1.75} />
                                        <span>{link.name}</span>
                                        <ArrowUpRight
                                            size={11}
                                            className="opacity-50 group-hover:opacity-100 transition-opacity"
                                        />
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                </section>
            )}
        </div>
    );
}
