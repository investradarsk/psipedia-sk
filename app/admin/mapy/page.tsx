import Link from "next/link";
import { AdminGeoOperatorDashboard } from "@/components/admin-geo-operator-dashboard";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { loadGeoAdminOperatorProfiles } from "@/lib/geo-admin-operator";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function firstParam(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

export default async function AdminMapsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireAdminPageUser("/admin/mapy");
  const params = await searchParams;
  let operatorData = null;
  let unavailable = "";
  try {
    operatorData = await loadGeoAdminOperatorProfiles({
      group: firstParam(params.group),
      category: firstParam(params.category),
      operator: firstParam(params.operator),
      google: firstParam(params.google),
      query: firstParam(params.q),
      page: firstParam(params.page),
      pageSize: firstParam(params.pageSize),
    });
  } catch (error) {
    unavailable = error instanceof Error ? error.message : "Geo foundation zatiaľ nie je dostupný.";
  }

  return (
    <AdminShell
      user={user}
      eyebrow="Admin · Mapy"
      title="Mapy"
      description="Rýchly pracovný priestor pre mapy služieb, organizácií Pomoci psom a podujatí. Filtre, počty a stránkovanie sa vyhodnocujú na serveri; Google Maps sa načíta až po explicitnom kliknutí."
      actions={<Link href="/admin/operations?source=GEO_LOCATION_ISSUE">Geo lokality na kontrolu</Link>}
    >
      {unavailable || !operatorData
        ? <section className="admin-form-card"><p className="admin-message admin-message--error">{unavailable || "Geo operator view sa nepodarilo načítať."}</p></section>
        : <AdminGeoOperatorDashboard data={operatorData} />}
    </AdminShell>
  );
}
