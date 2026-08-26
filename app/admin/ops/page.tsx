import { PageHeader } from "@/components/admin/ui";
import { OpsView } from "@/components/admin/ops/OpsView";

export const metadata = {
    title: "Ops · Admin",
};

export default function AdminOpsPage() {
    return (
        <div>
            <PageHeader
                title="Ops"
                description="Cache freshness, search-index backlog and cron liveness — read from D1. cf-blog cannot invoke the cache worker, so the actions here change what its next scheduled tick picks up."
            />
            <OpsView />
        </div>
    );
}
