import { redirect } from "next/navigation";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { articleAdminListHref, parseArticleAdminListFilters } from "@/lib/article-admin-query";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

// Legacy Admin entrypoint: editing lives in Articles and Sections, not a second workspace.
export default async function AdminPuppiesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireAdminPageUser("/admin/steniatka");
  const params = await searchParams;
  if (params.tab === "oblasti") {
    redirect("/admin/sekcie?sekcia=steniatka");
  }
  const filters = parseArticleAdminListFilters({
    get: (key) => typeof params[key] === "string" ? params[key] as string : null,
  });
  redirect(articleAdminListHref("/admin/clanky", { ...filters, portalSection: "steniatka" }));
}
