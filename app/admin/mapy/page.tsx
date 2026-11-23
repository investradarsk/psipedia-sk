import Link from "next/link";
import styles from "@/components/admin-v5-technical-tools.module.css";
import { Suspense } from "react";
import { AdminDataLoading } from "@/components/admin-data-loading";
import { AdminGeoOperatorDashboard } from "@/components/admin-geo-operator-dashboard";
import { AdminGooglePlacesApiLink } from "@/components/admin-google-places-api-link";
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
      description="Profily s neúplnou alebo nejednoznačnou adresou či polohou. Tu môžeš overiť správne miesto v Google Maps; vyriešené záznamy zo zoznamu zmiznú."
      actions={<AdminGooglePlacesApiLink compact />}
    >
      <Suspense fallback={<AdminDataLoading label="Mapy" />}>
        <MapContent promise={dataPromise} />
      </Suspense>
      <details className={styles.advanced} data-admin-maps-advanced>
        <summary>Rozšírené technické nástroje</summary>
        <nav className={styles.toolList} aria-label="Technické nástroje pre mapy">
          <Link className={styles.toolLink} href="/admin/nastroje/geo">
            <span className={styles.toolLabel}>GEO operácie</span>
            <span className={styles.toolDescription}>Preview, diagnostika a riadené dávky</span>
          </Link>
          <Link className={styles.toolLink} href="/admin/nastroje/google-places">
            <span className={styles.toolLabel}>Google Places · Place ID canary</span>
            <span className={styles.toolDescription}>Ručné overovanie identít</span>
          </Link>
        </nav>
      </details>
    </AdminShell>
  );
}
