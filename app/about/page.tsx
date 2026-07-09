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

const techStack = [
    { category: "OS", items: ["MacOS", "Arch Linux"] },
    { category: "Desktop", items: ["KDE Plasma"] },
    { category: "FileSystem", items: ["Btrfs"] },
    { category: "Shell", items: ["Zsh", "Bash"] },
    { category: "Editor", items: ["Zed", "Vim"] },
    { category: "Agent", items: ["ClaudeCode", "OpenCode"] },
];

// Map of icon name (stored in D1) -> lucide component.
// Falls back to LinkIcon for any unknown name so missing icons don't crash the page.
const ICON_MAP: Record<string, LucideIcon> = {
    link: LinkIcon,
    // Add more as needed: share-2, bot, home, newspaper, message-square, etc.
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

            <section className="mb-12">
                <h2 className="text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-text-muted mb-4">
                    What I Do
                </h2>
                <div className="space-y-4 text-text-secondary">
                    <p>
                        I build systems and tools that push the boundaries of
                        automation and human-computer interaction. My focus
                        areas include cloud infrastructure, AI/ML systems, and
                        developer tooling.
                    </p>
                    <p>
                        Currently pursuing an IT Master&apos;s degree while
                        building agentic workflows and exploring HPC. I believe
                        in learning in public and sharing discoveries along the
                        way.
                    </p>
                </div>
            </section>

            <section className="mb-12">
                <h2 className="text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-text-muted mb-4">
                    Technical Interests
                </h2>
                <ul className="space-y-3">
                    {[
                        "Cloud infrastructure and serverless architectures",
                        "AI/ML systems and agentic workflows",
                        "High-performance computing and optimization",
                        "Developer tools and productivity automation",
                        "Programming languages and runtime environments",
                        "Web performance and accessibility",
                    ].map((interest) => (
                        <li
                            key={interest}
                            className="flex items-center gap-3 text-text-secondary"
                        >
                            <span className="w-1.5 h-1.5 bg-accent rounded-full" />
                            {interest}
                        </li>
                    ))}
                </ul>
            </section>

            <section className="mb-12">
                <h2 className="text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-text-muted mb-4">
                    Current Stack
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {techStack.map((group) => (
                        <div key={group.category}>
                            <Card>
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
                                </CardContent>
                            </Card>
                        </div>
                    ))}
                </div>
            </section>

            <section className="mb-12">
                <h2 className="text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-text-muted mb-4">
                    Connect
                </h2>
                <p className="text-text-secondary mb-6">
                    Interested in collaborating, or just want to say hello —
                    feel free to reach out.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {SOCIAL_LINKS.map((link) => (
                        <Link
                            key={link.name}
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            <Card className="text-center h-full transition-all hover:-translate-y-1 hover:shadow-[0_8px_30px_rgba(0,0,0,0.4)]">
                                <CardContent className="flex flex-col items-center py-6">
                                    <span className="text-accent mb-3">
                                        <link.icon size={24} />
                                    </span>
                                    <span className="font-medium text-text-primary">
                                        {link.name}
                                    </span>
                                </CardContent>
                            </Card>
                        </Link>
                    ))}
                </div>
            </section>

            {links.length > 0 && (
                <section>
                    <h2 className="text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-text-muted mb-4">
                        Quick Links
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        {links.map((link: AboutLink) => {
                            const Icon = resolveIcon(link.icon);
                            return (
                                <Link
                                    key={link.id}
                                    href={link.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    <Card className="group h-full transition-all hover:-translate-y-1 hover:shadow-[0_8px_30px_rgba(0,0,0,0.4)]">
                                        <CardContent className="flex flex-col items-center py-6 text-center">
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
        </div>
    );
}
