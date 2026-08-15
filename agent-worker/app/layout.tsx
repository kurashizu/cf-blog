export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-[#1a1714] text-[#e6dfd2] min-h-screen">
        {children}
      </body>
    </html>
  );
}
