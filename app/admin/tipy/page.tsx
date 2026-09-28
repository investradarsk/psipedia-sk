import { AdminNewsTipDashboard } from "@/components/admin-news-tip-dashboard";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { listNewsTips } from "@/lib/news-tip-store";

export const dynamic = "force-dynamic";

export default async function AdminNewsTipsPage() {
  const user = await requireAdminPageUser("/admin/tipy");
  return (
    <AdminShell user={user} eyebrow="Námety od komunity" title="Tipy pre redakciu" description="Over námet, pridaj internú poznámku a spracuj zaujímavý príbeh na novinku.">
      <AdminNewsTipDashboard initialTips={await listNewsTips()} />
    </AdminShell>
  );
}
