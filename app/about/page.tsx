import Link from "next/link";
import { Card, CardContent } from "@/components/ui/Card";

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

const socialLinks = [
    {
        name: "GitHub",
        url: "https://github.com/kurashizu",
        icon: (
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
            </svg>
        ),
    },
    {
        name: "Gmail",
        url: "mailto:kurashizu123@gmail.com",
        icon: (
            <svg
                className="w-6 h-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
            >
                <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
            </svg>
        ),
    },
    {
        name: "Bilibili",
        url: "https://space.bilibili.com/17886260",
        icon: (
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M21.94 4.88a2.48 2.48 0 01-2.06 2.06C19.34 7 12 7 12 7s-7.34 0-7.88.47a2.48 2.48 0 01-2.06-2.06C2 7.34 2 12 2 12s0 4.66.5 7.12a2.48 2.48 0 002.06 2.06C4.66 21.34 12 21.34 12 21.34s7.34 0 7.88-.47a2.48 2.48 0 012.06-2.06C22 16.66 22 12 22 12s0-4.66-.5-7.12zM9.5 14.5V9.5l5.5 2.5-5.5 2.5z" />
            </svg>
        ),
    },
];

export default function AboutPage() {
    return (
        <div className="max-w-4xl mx-auto px-4 py-12">
            <div className="page-title">
                <h1>About Me</h1>
            </div>

            <section className="mb-12">
                <h2 className="section-title">What I Do</h2>
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
                <h2 className="section-title">Technical Interests</h2>
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
                <h2 className="section-title">Current Stack</h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {techStack.map((group) => (
                        <Card key={group.category}>
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
                    ))}
                </div>
            </section>

            <section>
                <h2 className="section-title">Connect</h2>
                <p className="text-text-secondary mb-6">
                    Interested in collaborating, or just want to say hello —
                    feel free to reach out.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {socialLinks.map((link) => (
                        <Link
                            key={link.name}
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            <Card className="text-center h-full transition-all hover:-translate-y-1 hover:shadow-[0_8px_30px_rgba(0,0,0,0.4)]">
                                <CardContent className="flex flex-col items-center py-6">
                                    <span className="text-accent mb-3">
                                        {link.icon}
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
        </div>
    );
}
