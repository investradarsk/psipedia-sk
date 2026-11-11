import Link from "next/link";
import { Suspense } from "react";
import { AdminDataLoading } from "@/components/admin-data-loading";
import { AdminLostFoundDashboard } from "@/components/admin-lost-found-dashboard";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { listReviewedAdminEntityIds } from "@/lib/admin-entity-review-store";
import { getAdminDogReportCounts, listAdminDogReports } from "@/lib/lost-found-dog-store";
import { dogReportTypes, type DogReportType } from "@/lib/lost-found-dogs";
import { LOST_FOUND_STATUSES, type LostFoundStatus } from "@/lib/lost-found-lifecycle.js";

export const dynamic = "force-dynamic";
type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => Array.isArray(v) ? v[0] || "" : v || "";

type Filters = {
  q: string;
  type: DogReportType | "";
  status: LostFoundStatus | "";
  region: string;
  locality: string;
  sort: "priority" | "name" | "city" | "status" | "date" | "updated";
  direction: "asc" | "desc";
};

async function LostFoundContent({ resultPromise, countsPromise, filters }: {
  resultPromise: ReturnType<typeof listAdminDogReports>;
  countsPromise: Promise<Awaited<ReturnType<typeof getAdminDogReportCounts>> | null>;
  filters: Filters;
}) {
  // A failed summary must not hide an otherwise valid primary result list.
  const [result, counts] = await Promise.all([
    resultPromise,
    countsPromise,
  ]);
  const reviewedIds = await listReviewedAdminEntityIds("LOST_FOUND", result.items.map((item) => item.id)).catch(() => null);
  return <>
    {counts === null && <p role="alert">Súhrnné počty hlásení sú dočasne nedostupné.</p>}
    {reviewedIds === null && <p role="alert">Stav redakčnej kontroly nie je dostupný; nie je označený ako neoverený.</p>}
    <AdminLostFoundDashboard result={result} counts={counts} filters={filters} reviewedIds={reviewedIds} />
  </>;
}

export default async function LostFoundAdminPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireAdminPageUser("/admin/stratene-najdene");
  const raw = await searchParams;
  const rawType = one(raw.type);
  const rawStatus = one(raw.status);
  const rawSort = one(raw.sort);
  const direction = one(raw.direction) === "asc" ? "asc" : "desc";
  const filters: Filters = {
    q: one(raw.q).slice(0, 120),
    type: (dogReportTypes as readonly string[]).includes(rawType) ? rawType as DogReportType : "",
    status: (LOST_FOUND_STATUSES as readonly string[]).includes(rawStatus) ? rawStatus as LostFoundStatus : "",
    region: one(raw.region).slice(0, 80),
    locality: one(raw.locality).slice(0, 120),
    sort: (["priority", "name", "city", "status", "date", "updated"].includes(rawSort) ? rawSort : "priority") as Filters["sort"],
    direction,
  };
  const page = Math.max(1, parseInt(one(raw.page) || "1", 10) || 1);
  const resultPromise = listAdminDogReports({ ...filters, page, pageSize: 50 });
  const countsPromise = getAdminDogReportCounts().catch(() => null);

  return <AdminShell user={user} eyebrow="Pomoc psom" title="Stratené a nájdené psy"
    description="Moderácia, publikovanie, životný cyklus a riešenie duplicít. Kontaktné osobné údaje zostávajú iba v administrácii."
    actions={<Link href="/admin/stratene-najdene/novy">+ Nové hlásenie</Link>}>
    <Suspense fallback={<AdminDataLoading label="Stratené a nájdené psy" />}>
      <LostFoundContent resultPromise={resultPromise} countsPromise={countsPromise} filters={filters} />
    </Suspense>
  </AdminShell>;
}
