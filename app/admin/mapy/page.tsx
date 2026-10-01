import Link from "next/link";
import { AdminGeoOperatorDashboard } from "@/components/admin-geo-operator-dashboard";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { loadGeoAdminOperatorProfiles } from "@/lib/geo-admin-operator";

export const dynamic = "force-dynamic";

export default async function AdminMapsPage() {
  const user = await requireAdminPageUser("/admin/mapy");
  let operatorData = null;
  let unavailable = "";
  try {
    operatorData = await loadGeoAdminOperatorProfiles();
  } catch (error) {
    unavailable = error instanceof Error ? error.message : "Geo foundation zatiaľ nie je dostupný.";
  }

  return (
    <AdminShell
      user={user}
      eyebrow="Admin · Mapy"
      title="Mapy"
      description="Spoločný pracovný priestor pre mapy služieb, organizácií Pomoci psom a podujatí. Google Maps miesto môžeš nájsť a potvrdiť priamo v zozname."
      actions={<Link href="/admin/operations?source=GEO_LOCATION_ISSUE">Geo lokality na kontrolu</Link>}
    >
      {unavailable || !operatorData
        ? <section className="admin-form-card"><p className="admin-message admin-message--error">{unavailable || "Geo operator view sa nepodarilo načítať."}</p></section>
        : <AdminGeoOperatorDashboard items={operatorData.items} summary={operatorData.summary} />}
    </AdminShell>
  );
}
