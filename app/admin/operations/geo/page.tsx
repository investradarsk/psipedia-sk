import { AdminGeoOperatorDashboard } from "@/components/admin-geo-operator-dashboard";
import { AdminGeoOperations } from "@/components/admin-geo-operations";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { loadGeoAdminOperatorProfiles } from "@/lib/geo-admin-operator";
import { previewGeoCandidates } from "@/lib/geo-operations";
import { geoapifyApiKey } from "@/lib/geoapify-geocoder";

export const dynamic = "force-dynamic";

export default async function AdminGeoOperationsPage() {
  const user = await requireAdminPageUser("/admin/operations/geo");
  let items = [];
  let operatorData = null;
  let unavailable = "";
  try {
    [operatorData, items] = await Promise.all([
      loadGeoAdminOperatorProfiles(),
      previewGeoCandidates({ limit: 50 }).then((result) => result.items),
    ]);
  } catch (error) {
    unavailable = error instanceof Error ? error.message : "Geo foundation zatiaľ nie je dostupný.";
  }

  return <AdminShell
    user={user}
    eyebrow="Admin Operations · GEO"
    title="Mapa — profily"
    description="Operator-first prehľad canonical adries a mapových stavov. Technické geo nástroje zostávajú dostupné v pokročilej sekcii."
  >
    {unavailable || !operatorData
      ? <section className="admin-form-card"><p className="admin-message admin-message--error">{unavailable || "Geo operator view sa nepodarilo načítať."}</p></section>
      : <>
        <AdminGeoOperatorDashboard items={operatorData.items} summary={operatorData.summary} />
        <details className="admin-form-card" style={{ marginTop: 16 }}>
          <summary style={{ cursor: "pointer", fontWeight: 800, fontSize: "1.05rem" }}>Pokročilé nástroje</summary>
          <p className="admin-help">
            Classifier, dry-run, canary, explicit onboarding, initialization a bounded backfill sú zámerne sekundárne.
            Používaj ich iba pri technickej geo údržbe.
          </p>
          <AdminGeoOperations initialItems={items} providerConfigured={Boolean(geoapifyApiKey())} />
        </details>
      </>}
  </AdminShell>;
}
