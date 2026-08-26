import { PostEditor } from "@/components/editor/PostEditor";
import { getKnownTaxonomy } from "@/lib/admin-stats";

// Force dynamic rendering - PostEditor is a client component
export const dynamic = "force-dynamic";

// The admin layout already applies `max-w-6xl px-4` — re-applying it here
// doubled the horizontal padding.
export default async function NewPostPage() {
    const { tags, categories } = await getKnownTaxonomy();
    return (
        <PostEditor isNewPost knownTags={tags} knownCategories={categories} />
    );
}
