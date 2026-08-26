import { PostEditor } from "@/components/editor/PostEditor";

// Force dynamic rendering - PostEditor is a client component
export const dynamic = "force-dynamic";

// The admin layout already applies `max-w-6xl px-4` — re-applying it here
// doubled the horizontal padding.
export default function NewPostPage() {
    return <PostEditor isNewPost={true} />;
}
