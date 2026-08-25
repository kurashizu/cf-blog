/**
 * Root-level loading state — covers every force-dynamic route that has no
 * loading.tsx of its own (home, /news, /search, /about), so navigation
 * paints a skeleton instead of hanging on a blank screen while D1 queries
 * run.
 */
export default function Loading() {
    return (
        <div className="max-w-4xl mx-auto px-4 py-6 md:py-12 animate-pulse">
            <div className="mx-auto mb-8 h-8 w-64 rounded bg-bg-secondary" />
            <div className="space-y-4">
                <div className="h-32 rounded-xl bg-bg-secondary" />
                <div className="h-32 rounded-xl bg-bg-secondary" />
                <div className="h-32 rounded-xl bg-bg-secondary" />
            </div>
        </div>
    );
}
