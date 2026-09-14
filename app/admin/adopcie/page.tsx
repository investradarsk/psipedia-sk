import { AdminAdoptionDashboard } from "@/components/admin-adoption-dashboard";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { adoptionRegions, adoptionStatuses, type AdoptionStatus } from "@/lib/adoption";
import {
  adoptionAdminSorts,
  listAdoptionAdminDashboard,
  type AdoptionAdminListFilters,
  type AdoptionAdminSort,
} from "@/lib/adoption-admin-store";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;
const one = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] || "" : value || "";

export default async function AdoptionAdminPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireAdminPageUser("/admin/adopcie");
  const raw = await searchParams;
  const rawStatus = one(raw.status);
  const rawFreshness = one(raw.freshness);
  const rawRegion = one(raw.region);
  const rawSort = one(raw.sort);

  const filters: AdoptionAdminListFilters = {
    q: one(raw.q).trim().slice(0, 120),
    status: (adoptionStatuses as readonly string[]).includes(rawStatus) ? rawStatus as AdoptionStatus : "",
    freshness: rawFreshness === "stale" || rawFreshness === "fresh" ? rawFreshness : "all",
    breed: one(raw.breed).trim().slice(0, 120),
    region: (adoptionRegions as readonly string[]).includes(rawRegion) ? rawRegion : "",
    locality: one(raw.locality).trim().slice(0, 120),
    sort: (adoptionAdminSorts as readonly string[]).includes(rawSort) ? rawSort as AdoptionAdminSort : "updated-desc",
    page: Math.max(1, parseInt(one(raw.page) || "1", 10) || 1),
  };

  const result = await listAdoptionAdminDashboard(filters);

  return <AdminShell
    user={user}
    eyebrow="Pomoc psom"
    title="Adopcie"
    description="Read-only prehľad adopčných profilov, lifecycle stavov a potreby opätovného overenia."
  >
    <AdminAdoptionDashboard result={result} filters={filters} />
  </AdminShell>;
}
