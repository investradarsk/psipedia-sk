import Link from "next/link";
import { AdminDashboard } from "@/components/admin-dashboard";
import { AdminShell } from "@/components/admin-shell";
import { AdminPuppyAreaEditor } from "@/components/admin-puppy-area-editor";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { parseArticleAdminListFilters } from "@/lib/article-admin-query";
import { listManagedArticleSummaries } from "@/lib/article-store";
import { listManagedPortalSections } from "@/lib/section-store";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function AdminPuppiesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireAdminPageUser("/admin/steniatka");
  const params = await searchParams;
  const filters = parseArticleAdminListFilters({
    get: (key) => typeof params[key] === "string" ? params[key] as string : null,
  });
  const [result, sections] = await Promise.all([
    listManagedArticleSummaries({ ...filters, portalSection: "steniatka" }),
    listManagedPortalSections(),
  ]);
  return (
    <AdminShell
      user={user}
      eyebrow="Obsah pre nových majiteľov"
      title="Šteniatka"
      description="Pridávaj články priamo do konkrétnych oblastí a spravuj celý obsah sekcie Šteniatka."
      actions={<><Link className="admin-primary-action" href="/admin/steniatka/pokrytie">Pokrytie tém</Link><Link className="admin-primary-action" href="/admin/novy?sekcia=steniatka">+ Nový článok o šteniatkach</Link></>}
    >
      <AdminPuppyAreaEditor initialSections={sections} />
      <AdminDashboard
        key={JSON.stringify(filters)}
        initialArticles={result.articles}
        initialCounts={result.counts}
        initialResultCount={result.resultCount}
        pagination={result.pagination}
        filters={{ ...filters, portalSection: "all" }}
        fixedPortalSection="steniatka"
      />
    </AdminShell>
  );
}
