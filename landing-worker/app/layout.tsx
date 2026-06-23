import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], display: "swap" });
const playfair = Playfair_Display({
    subsets: ["latin"],
    display: "swap",
    weight: ["900"],
    style: ["italic"],
});

export const metadata: Metadata = {
    metadataBase: new URL("https://022025.xyz"),
    title: "Kurashizu",
    description: "where ideas flow",
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
                className={inter.className}
                style={
                    {
                        "--font-playfair": playfair.style.fontFamily,
                    } as React.CSSProperties
                }
            >
                {children}
            </body>
        </html>
    );
}