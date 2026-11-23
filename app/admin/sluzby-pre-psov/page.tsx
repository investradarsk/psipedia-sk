import { redirect } from "next/navigation";
import { parseDirectoryAdminFilters, directoryAdminHref } from "@/lib/directory-admin-query";
import { isDirectoryCategory } from "@/lib/directory";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

/** Legacy bookmark: keep GET filters, but never render or load a second profile list. */
export default async function AdminDogServicesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const filters = parseDirectoryAdminFilters(
    { get: (key) => typeof params[key] === "string" ? params[key] : null },
    isDirectoryCategory,
  );
  redirect(directoryAdminHref(filters));
}
