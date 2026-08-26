import { LinksManager } from "@/components/admin/links/LinksManager";

/**
 * About-page link manager. The list is fetched client-side from
 * `/admin/api/links` (which is the force-dynamic, D1-touching half), so this
 * page itself stays a plain server shell.
 */
export default function AdminLinksPage() {
    return <LinksManager />;
}
