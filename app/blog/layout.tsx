export default async function BlogLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="mx-auto max-w-4xl px-4 pb-[60px] pt-8 md:pt-12">
            {children}
        </div>
    );
}
