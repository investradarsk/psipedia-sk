import Link from "next/link";
import { AdminDashboard } from "@/components/admin-dashboard";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { parseArticleAdminListFilters } from "@/lib/article-admin-query";
import { listManagedArticleSummaries } from "@/lib/article-store";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function AdminArticlesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireAdminPageUser("/admin/clanky");
  const params = await searchParams;
  const filters = parseArticleAdminListFilters({
    get: (key) => typeof params[key] === "string" ? params[key] as string : null,
  });
  const result = await listManagedArticleSummaries({
    ...filters,
    portalSection: filters.portalSection === "all" ? undefined : filters.portalSection,
  });

  return (
    <AdminShell
      user={user}
      eyebrow="Obsah"
      title="Články a novinky"
      description="Hľadaj, filtruj, upravuj a publikuj redakčný obsah. Pracovný prehľad zostáva na /admin."
      actions={<Link className="admin-primary-action" href="/admin/novy">+ Nový obsah</Link>}
    >
      <AdminDashboard
        key={JSON.stringify(filters)}
        initialArticles={result.articles}
        initialCounts={result.counts}
        initialResultCount={result.resultCount}
        pagination={result.pagination}
        filters={filters}
        listPath="/admin/clanky"
      />
    </AdminShell>
  );
}
