import Link from "next/link";
import { AdminDashboard } from "@/components/admin-dashboard";
import { AdminShell } from "@/components/admin-shell";
import { AdminPuppyAreaEditor } from "@/components/admin-puppy-area-editor";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { listManagedArticleSummaries } from "@/lib/article-store";
import { listManagedPortalSections } from "@/lib/section-store";

export const dynamic = "force-dynamic";

export default async function AdminPuppiesPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await requireAdminPageUser("/admin/steniatka");
  const { page: rawPage } = await searchParams;
  const page = Math.max(1, Number.parseInt(rawPage ?? "1", 10) || 1);
  const [result, sections] = await Promise.all([
    listManagedArticleSummaries({ page, portalSection: "steniatka" }),
    listManagedPortalSections(),
  ]);
  return (
    <AdminShell
      user={user}
      eyebrow="Obsah pre nových majiteľov"
      title="Šteniatka"
      description="Pridávaj články priamo do konkrétnych oblastí a spravuj celý obsah sekcie Šteniatka."
      actions={<Link className="admin-primary-action" href="/admin/novy?sekcia=steniatka">+ Nový článok o šteniatkach</Link>}
    >
      <AdminPuppyAreaEditor initialSections={sections} />
      <AdminDashboard initialArticles={result.articles} initialCounts={result.counts} pagination={result.pagination} fixedPortalSection="steniatka" />
    </AdminShell>
  );
}
