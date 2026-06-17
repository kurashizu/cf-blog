import { getDB } from "@/lib/d1";
import { NewsArchiveView } from "@/components/news/NewsArchiveView";

export const dynamic = "force-dynamic";

const LIMIT = 10;

interface HNStory {
    id: number;
    title: string;
    url: string | null;
    score: number;
    by: string;
    time: number;
    descendants: number;
    domain: string | null;
    summary: string;
}

export default async function NewsPage({
    searchParams,
}: {
    searchParams: Promise<{ page?: string }>;
}) {
    const { page: pageStr } = await searchParams;
    const page = Math.max(1, parseInt(pageStr ?? "1", 10) || 1);

    const db = getDB();
    const offset = (page - 1) * LIMIT;

    const [rows, countRow] = await Promise.all([
        db
            .prepare(
                "SELECT * FROM news_items ORDER BY time DESC LIMIT ? OFFSET ?",
            )
            .bind(LIMIT, offset)
            .all(),
        db.prepare("SELECT COUNT(*) as total FROM news_items").first(),
    ]);

    const stories = (rows.results ?? []) as unknown as HNStory[];
    const total = (countRow?.total as number) ?? 0;
    const totalPages = Math.ceil(total / LIMIT);

    return (
        <div className="max-w-4xl mx-auto px-4 pb-12 pt-8 md:pt-12">
            <div className="text-[1.75rem] font-bold text-text-primary mb-8">
                <h1>News</h1>
                <p className="text-sm text-text-secondary">
                    Daily tech news with AI-generated summaries
                </p>
            </div>

            <NewsArchiveView
                stories={stories}
                page={page}
                totalPages={totalPages}
            />
        </div>
    );
}
