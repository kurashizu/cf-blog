import { AdminLayout as Layout } from "@/components/layout/AdminLayout";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <Layout>{children}</Layout>;
}
