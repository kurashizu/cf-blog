import { MediaManager } from "@/components/admin/media/MediaManager";

/**
 * Media manager. All of it is interactive (upload progress, inline delete
 * confirmation, clipboard), so the page is a thin server shell around the
 * client view — the same split `/admin/audit` uses.
 */
export default function AdminMediaPage() {
    return <MediaManager />;
}
