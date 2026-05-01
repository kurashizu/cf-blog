export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-bg-primary">
      <header className="admin-header">
        <div className="mx-auto max-w-6xl px-4">
          <h1 className="admin-header-title">Admin Panel</h1>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
