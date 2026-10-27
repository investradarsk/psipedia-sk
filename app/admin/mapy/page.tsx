import { Suspense } from "react";
import { AdminDataLoading } from "@/components/admin-data-loading";
import { AdminGeoOperatorDashboard } from "@/components/admin-geo-operator-dashboard";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { loadGeoAdminOperatorProfiles } from "@/lib/geo-admin-operator";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function firstParam(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

function loadMapOverview(params: SearchParams) {
  return loadGeoAdminOperatorProfiles({
    group: firstParam(params.group),
    category: firstParam(params.category),
    query: firstParam(params.q),
    page: firstParam(params.page),
    pageSize: firstParam(params.pageSize),
  }).then((operatorData) => ({ operatorData, unavailable: "" }))
    .catch((error: unknown) => ({
      operatorData: null,
      unavailable: error instanceof Error ? error.message : "Geo foundation zatiaľ nie je dostupný.",
    }));
}

async function MapContent({ promise }: { promise: ReturnType<typeof loadMapOverview> }) {
  const { operatorData, unavailable } = await promise;
  const dashboardKey = operatorData
    ? [operatorData.filters.group, operatorData.filters.category, operatorData.filters.query].join("|")
    : "unavailable";

  return unavailable || !operatorData
    ? <section className="admin-form-card"><p className="admin-message admin-message--error">{unavailable || "Geo operator view sa nepodarilo načítať."}</p></section>
    : <AdminGeoOperatorDashboard key={dashboardKey} data={operatorData} />;
}

export default async function AdminMapsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireAdminPageUser("/admin/mapy");
  const params = await searchParams;
  const dataPromise = loadMapOverview(params);

  return (
    <AdminShell
      user={user}
      eyebrow="Admin · Mapy"
      title="Mapy"
      description="Pracovný inbox položiek, ktoré ešte treba vyriešiť cez Google Maps. Hotové položky sa tu nezobrazujú."
    >
      <Suspense fallback={<AdminDataLoading label="Mapy" />}>
        <MapContent promise={dataPromise} />
      </Suspense>
    </AdminShell>
  );
}
