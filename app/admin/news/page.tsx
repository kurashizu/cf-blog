import { PageHeader } from "@/components/admin/ui";
import { NewsManager } from "@/components/admin/news/NewsManager";

export const metadata = {
    title: "News · Admin",
};

export default function AdminNewsPage() {
    return (
        <div>
            <PageHeader
                title="News"
                description="The Hacker News archive and the two cron queues that fill it: an AI summary rewrite, then semantic search indexing."
            />
            <NewsManager />
        </div>
    );
}
