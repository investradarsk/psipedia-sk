import Link from "next/link";
import { Suspense } from "react";
import { AdminDashboard } from "@/components/admin-dashboard";
import { AdminDataLoading } from "@/components/admin-data-loading";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { parseArticleAdminListFilters } from "@/lib/article-admin-query";
import { listManagedArticleSummaries } from "@/lib/article-store";
import { listArticleTopics } from "@/lib/article-topics";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;
type ArticleFilters = ReturnType<typeof parseArticleAdminListFilters>;

async function ArticleList({
  dataPromise,
  filters,
}: {
  dataPromise: Promise<[
    Awaited<ReturnType<typeof listManagedArticleSummaries>>,
    Awaited<ReturnType<typeof listArticleTopics>>,
  ]>;
  filters: ArticleFilters;
}) {
  const [result, topicOptions] = await dataPromise;
  return (
    <AdminDashboard
      key={JSON.stringify(filters)}
      initialArticles={result.articles}
      initialCounts={result.counts}
      initialResultCount={result.resultCount}
      pagination={result.pagination}
      filters={filters}
      listPath="/admin/clanky"
      topicOptions={topicOptions}
    />
  );
}

export default async function AdminArticlesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireAdminPageUser("/admin/clanky");
  const params = await searchParams;
  const filters = parseArticleAdminListFilters({
    get: (key) => typeof params[key] === "string" ? params[key] as string : null,
  });

  // Start independent reads concurrently and stream the shell before either resolves.
  const dataPromise = Promise.all([
    listManagedArticleSummaries({
      ...filters,
      portalSection: filters.portalSection === "all" ? undefined : filters.portalSection,
    }),
    listArticleTopics({ includeInactive: true }),
  ]);

  return (
    <AdminShell
      user={user}
      eyebrow="Obsah"
      title="Články a novinky"
      description="Hľadaj, filtruj, upravuj a publikuj redakčný obsah. Pracovný prehľad zostáva na /admin."
      actions={<><Link className="admin-secondary-action" href="/admin/clanky/kalendar">Redakčný kalendár</Link><Link className="admin-secondary-action" href="/admin/clanky/temy">Témy článkov</Link><Link className="admin-primary-action" href="/admin/novy">+ Nový obsah</Link></>}
    >
      <Suspense fallback={<AdminDataLoading label="Články a novinky" />}>
        <ArticleList dataPromise={dataPromise} filters={filters} />
      </Suspense>
    </AdminShell>
  );
}
