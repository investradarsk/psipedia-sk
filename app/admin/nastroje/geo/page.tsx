import Link from "next/link";
import { AdminGeoOperations } from "@/components/admin-geo-operations";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { previewGeoCandidates } from "@/lib/geo-operations";
import { geoapifyApiKey } from "@/lib/geoapify-geocoder";

export const dynamic = "force-dynamic";

export default async function AdminGeoToolsPage() {
  const user = await requireAdminPageUser("/admin/nastroje/geo");
  let items = [];
  let unavailable = "";
  try {
    items = await previewGeoCandidates({ limit: 50 }).then((result) => result.items);
  } catch (error) {
    unavailable = error instanceof Error ? error.message : "Geo foundation zatiaľ nie je dostupný.";
  }

  return (
    <AdminShell
      user={user}
      eyebrow="Admin · Nástroje"
      title="GEO nástroje"
      description="Technické utility pre preview, canary, bounded backfill, diagnostiku a údržbu GEO pipeline."
      actions={<Link href="/admin/mapy">Späť na Mapy</Link>}
    >
      {unavailable
        ? <section className="admin-form-card"><p className="admin-message admin-message--error">{unavailable}</p></section>
        : <AdminGeoOperations initialItems={items} providerConfigured={Boolean(geoapifyApiKey())} />}
    </AdminShell>
  );
}
