import Link from "next/link";
import { AdminDashboard } from "@/components/admin-dashboard";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { getAdminModuleCounts } from "@/lib/admin-dashboard-store";
import { parseArticleAdminListFilters } from "@/lib/article-admin-query";
import { listManagedArticleSummaries } from "@/lib/article-store";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function AdminPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireAdminPageUser("/admin");
  const params = await searchParams;
  const filters = parseArticleAdminListFilters({
    get: (key) => typeof params[key] === "string" ? params[key] as string : null,
  });
  const [result, moduleCounts] = await Promise.all([
    listManagedArticleSummaries(filters),
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
      <AdminDashboard
        key={JSON.stringify(filters)}
        initialArticles={result.articles}
        initialCounts={result.counts}
        initialResultCount={result.resultCount}
        moduleCounts={moduleCounts}
        pagination={result.pagination}
        filters={filters}
      />
    </AdminShell>
  );
}
