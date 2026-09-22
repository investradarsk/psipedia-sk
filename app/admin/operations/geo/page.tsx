import { AdminGeoOperations } from "@/components/admin-geo-operations";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { previewGeoCandidates } from "@/lib/geo-operations";
import { geoapifyApiKey } from "@/lib/geoapify-geocoder";

export const dynamic = "force-dynamic";

export default async function AdminGeoOperationsPage() {
  const user = await requireAdminPageUser("/admin/operations/geo");
  let items = [];
  let unavailable = "";
  try {
    items = (await previewGeoCandidates({ limit: 50 })).items;
  } catch (error) {
    unavailable = error instanceof Error ? error.message : "Geo foundation zatiaľ nie je dostupný.";
  }

  return <AdminShell
    user={user}
    eyebrow="Admin Operations · GEO"
    title="Geo foundation"
    description="Dry-run, kontrolovaná inicializácia a canary tooling. Verejná mapa ani full production backfill tu nie sú dostupné."
  >
    {unavailable
      ? <section className="admin-form-card"><p className="admin-message admin-message--error">{unavailable}</p></section>
      : <AdminGeoOperations initialItems={items} providerConfigured={Boolean(geoapifyApiKey())} />}
  </AdminShell>;
}
