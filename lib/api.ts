// Admin API endpoints - all protected routes under /admin/*

export const adminApi = {
  posts: '/admin/api/posts',
  post: (slug: string) => `/admin/api/posts/${slug}`,
} as const;

// Type helper for post operations
export type PostOperation = 'create' | 'read' | 'update' | 'delete';
