import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "@/components/theme/global.css";
import "@/components/theme/layout.css";
import "@/components/theme/article.css";
import "@/components/theme/admin.css";
import "@/components/theme/form.css";
import "@/components/theme/editor.css";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";

const inter = Inter({ subsets: ["latin"] });

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
    <html lang="en" className="dark">
      <body className={`${inter.className} flex min-h-screen flex-col bg-bg-primary text-text-primary`}>
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
