import Link from "next/link";
import {
    ArrowUpRight,
    Link as LinkIcon,
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
    items: TechItem[];
    sublabel?: string;
    subitems?: TechItem[];
};

const techStack: TechGroup[] = [
    {
        category: "Edge",
        items: ["Cloudflare Workers", "cloudflared"],
        sublabel: "Bindings",
        subitems: ["D1", "R2", "KV", "Vectorize"],
    },
    {
        category: "Local",
        items: ["Arch Linux", "MacOS", "KDE Plasma"],
        sublabel: "System",
        subitems: ["btrfs", "zram", "zstd"],
    },
    {
        category: "Inference",
        items: ["llama.cpp", "ROCm (AMD GPU)"],
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
        items: ["FFmpeg", "VAAPI"],
        sublabel: "Codecs",
        subitems: ["AV1", "AVIF", "Opus"],
    },
    {
        category: "Editor",
        items: ["Zed", "Vim", "tmux", "konsole", "Bash"],
    },
    {
        category: "Toolchain",
        items: ["uv", "cargo", "npm"],
    },
];

// Map of icon name (stored in D1) -> lucide component.
// Falls back to LinkIcon for any unknown name so missing icons don't crash the page.
const ICON_MAP: Record<string, LucideIcon> = {
    link: LinkIcon,
    "share-2": LinkIcon,
    bot: LinkIcon,
    home: LinkIcon,
    newspaper: LinkIcon,
    "message-square": LinkIcon,
};

function resolveIcon(name: string): LucideIcon {
    return ICON_MAP[name] ?? LinkIcon;
}

export default async function AboutPage() {
    const links = await createAboutLinksRepo().getVisible();

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
                    {techStack.map((group) => (
                        <div key={group.category} className="h-full">
                            <Card
                                className={`group h-full min-h-[180px] transition-all hover:border-accent ${
                                    group.sublabel
                                        ? "cursor-default"
                                        : ""
                                }`}
                            >
                                <CardContent className="pt-4">
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
                                            className="invisible max-h-0 overflow-hidden opacity-0
                                                       group-hover:visible group-hover:max-h-[500px] group-hover:opacity-100
                                                       group-hover:mt-3 group-hover:pt-3 group-hover:border-t group-hover:border-border
                                                       transition-all duration-200 ease-out"
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
                    ))}
                </div>
            </section>

            <section>
                <h2 className="text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-text-muted mb-4">
                    Links
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
                    {links.map((link: AboutLink) => {
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
        </div>
    );
}
