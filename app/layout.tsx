import type { Metadata } from "next";
import { Inter, Playfair_Display, Pacifico } from "next/font/google";
import "@/components/theme/global.css";
import "@/components/theme/background.css";
import "@/components/theme/chat.css";
import "@/components/theme/layout.css";
import "@/components/theme/article.css";
import "@/components/theme/admin.css";
import "@/components/theme/form.css";
import "@/components/theme/editor.css";
import "@/components/theme/activity.css";
import "katex/dist/katex.min.css";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { ChatWidget } from "@/components/ui/ChatWidget";
import { GuestbookWidget } from "@/components/guestbook/GuestbookWidget";
import { ParticleBackground } from "@/components/ui/ParticleBackground";
import { MouseTrail } from "@/components/ui/MouseTrail";

const inter = Inter({ subsets: ["latin"] });
const playfair = Playfair_Display({ subsets: ["latin"] });

export const metadata: Metadata = {
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
                    <ParticleBackground />
                    <MouseTrail />
                    <Header />
                    <main className="flex-1">{children}</main>
                    <Footer />
                    <ChatWidget />
                    <GuestbookWidget />
                </ThemeProvider>
            </body>
        </html>
    );
}
