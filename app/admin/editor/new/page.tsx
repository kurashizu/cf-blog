import PostEditor from '@/components/editor/PostEditor';

// Force dynamic rendering - PostEditor is a client component
export const dynamic = "force-dynamic";

export default function NewPostPage() {
  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      <PostEditor isNewPost={true} />
    </div>
  );
}
