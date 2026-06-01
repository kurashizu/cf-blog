import { Card, CardHeader, CardContent } from '@/components/ui/Card';

function BlogPostCardSkeleton() {
  return (
    <Card className="animate-pulse">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="h-6 w-2/3 rounded bg-bg-secondary" />
          <div className="h-4 w-20 rounded bg-bg-secondary" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="h-4 w-full rounded bg-bg-secondary" />
          <div className="h-4 w-3/4 rounded bg-bg-secondary" />
        </div>
        <div className="mt-4 flex gap-2">
          <div className="h-6 w-16 rounded-full bg-bg-secondary" />
          <div className="h-6 w-20 rounded-full bg-bg-secondary" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function Loading() {
  return (
    <div>
      <div className="mb-8 h-8 w-24 rounded bg-bg-secondary animate-pulse" />
      <div className="space-y-4">
        <BlogPostCardSkeleton />
        <BlogPostCardSkeleton />
        <BlogPostCardSkeleton />
      </div>
    </div>
  );
}