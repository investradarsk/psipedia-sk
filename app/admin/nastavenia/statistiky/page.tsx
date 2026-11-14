import Link from "next/link";
import { AdminShell } from "@/components/admin-shell";
import { AdminTrafficDashboard } from "@/components/admin-traffic-dashboard";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { loadAdminTrafficReport, parseTrafficWindow } from "@/lib/admin-traffic-analytics";
import { loadSiteTrafficReport } from "@/lib/site-analytics-report";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function AdminTrafficStatisticsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  // Authentication must happen before any aggregated traffic query.
  const user = await requireAdminPageUser("/admin/nastavenia/statistiky");
  const selected = parseTrafficWindow((await searchParams).obdobie);
  const [report, siteReport] = await Promise.all([
    loadAdminTrafficReport({ window: selected }),
    loadSiteTrafficReport({ window: selected }),
  ]);

  return (
    <AdminShell
      user={user}
      eyebrow="Nastavenia / Štatistiky"
      title="Štatistiky návštevnosti"
      description="Súhrnné počty zobrazení verejných stránok, ich vývoj a najnavštevovanejší obsah. Bez Google Analytics."
      actions={<Link href="/admin/nastavenia">Späť na nastavenia</Link>}
    >
      <AdminTrafficDashboard report={report} siteReport={siteReport} />
    </AdminShell>
  );
}
