import type { Metadata } from "next";
import {
    Inter,
    Playfair_Display,
    Pacifico,
    IBM_Plex_Mono,
} from "next/font/google";
import "@/components/theme/global.css";
import "@/components/theme/background.css";
import "@/components/theme/chat.css";
import "@/components/theme/layout.css";
import "@/components/theme/article.css";
import "@/components/theme/admin.css";
import "@/components/theme/form.css";
import "@/components/theme/editor.css";
import "@/components/theme/activity.css";
import "@/components/theme/nes.css";
import "katex/dist/katex.min.css";
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

const inter = Inter({ subsets: ["latin"] });
const playfair = Playfair_Display({ subsets: ["latin"] });
const ibmPlexMono = IBM_Plex_Mono({
    weight: ["400", "500", "600"],
    subsets: ["latin"],
    variable: "--font-mono",
});

export const metadata: Metadata = {
    metadataBase: new URL("https://blog.022025.xyz"),
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
                className={`${inter.className} ${ibmPlexMono.variable} flex min-h-screen flex-col bg-bg-primary text-text-primary`}
            >
                <ThemeProvider>
                    <ParticleBackground />
                    <MouseTrail />
                    <ConsoleEasterEgg />
                    <StayEasterEgg />
                    <Header />
                    <main className="flex-1">
                        <PageTransition>{children}</PageTransition>
                    </main>
                    <Footer />
                    <ChatWidget />
                    <GuestbookWidget />
                </ThemeProvider>
            </body>
        </html>
    );
}
