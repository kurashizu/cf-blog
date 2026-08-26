import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import "@/components/theme/tokens.css";
import "@/components/theme/base.css";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { PageTransition } from "@/components/layout/PageTransition";
import { ChatWidget } from "@/components/chat/ChatWidget";
import { GuestbookWidget } from "@/components/guestbook/GuestbookWidget";
import { ParticleBackground } from "@/components/effects/ParticleBackground";
import { MouseTrail } from "@/components/effects/MouseTrail";
import { ConsoleEasterEgg } from "@/components/effects/ConsoleEasterEgg";
import { StayEasterEgg } from "@/components/effects/StayEasterEgg";
import { PublicChrome } from "@/components/layout/PublicChrome";
import { BLOG_URL } from "@/shared/site-config";

const inter = Inter({ subsets: ["latin"] });
const playfair = Playfair_Display({ subsets: ["latin"] });

export const metadata: Metadata = {
    metadataBase: new URL(BLOG_URL),
    title: {
        default: "Kurashizu's Blog",
        template: "%s | Kurashizu's Blog",
    },
    description: "Personal blog about technology, programming, and more.",
    authors: [{ name: "Kurashizu" }],
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en" className="dark" suppressHydrationWarning>
            <body
                className={`${inter.className} flex min-h-screen flex-col bg-bg-primary text-text-primary`}
            >
                <ThemeProvider>
                    {/* Public-site-only chrome. The admin panel brings its
                        own header and must not inherit the widgets or the
                        animated canvases. */}
                    <PublicChrome>
                        <ParticleBackground />
                        <MouseTrail />
                        <ConsoleEasterEgg />
                        <StayEasterEgg />
                        <Header />
                    </PublicChrome>
                    <main className="flex-1">
                        <PageTransition>{children}</PageTransition>
                    </main>
                    <PublicChrome>
                        <Footer />
                        <ChatWidget />
                        <GuestbookWidget />
                    </PublicChrome>
                </ThemeProvider>
            </body>
        </html>
    );
}
