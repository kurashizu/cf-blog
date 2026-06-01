export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <main className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-[#ff6b35] mb-2">cf-agent</h1>
        <p className="text-[#e8e8ed]/60">Agent worker is running</p>
      </div>
    </main>
  );
}
