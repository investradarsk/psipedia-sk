import Link from "next/link";
import { AdminDashboard } from "@/components/admin-dashboard";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { getAdminModuleCounts } from "@/lib/admin-dashboard-store";
import { listManagedArticleSummaries } from "@/lib/article-store";

export const dynamic = "force-dynamic";

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await requireAdminPageUser("/admin");
  const { page: rawPage } = await searchParams;
  const page = Math.max(1, Number.parseInt(rawPage ?? "1", 10) || 1);
  const [result, moduleCounts] = await Promise.all([
    listManagedArticleSummaries({ page }),
    getAdminModuleCounts(),
  ]);

  return (
    <AdminShell
      user={user}
      eyebrow="Redakčný prehľad"
      title="Články a novinky pod kontrolou"
      description="Napíš článok alebo aktuálnu správu, dokonči koncept a publikuj ho na správnej adrese."
      actions={<Link className="admin-primary-action" href="/admin/novy">+ Nový obsah</Link>}
    >
      <AdminDashboard initialArticles={result.articles} initialCounts={result.counts} moduleCounts={moduleCounts} pagination={result.pagination} />
    </AdminShell>
  );
}
