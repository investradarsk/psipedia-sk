import { AdminShell } from "@/components/admin-shell";
import { AdminNotionDataQualityAudit } from "@/components/admin-notion-data-quality-audit";
import { AdminNotionSyncOverview } from "@/components/admin-notion-sync-overview";
import { requireAdminPageUser } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export default async function NotionDataQualityAuditPage() {
  const user = await requireAdminPageUser("/admin/nastroje/notion-audit");
  return (
    <AdminShell
      user={user}
      eyebrow="Admin · Nástroje · Notion"
      title="Kontrola údajov v Notione"
      description="Jednotný read-only prehľad synchronizácie všetkých oblastí a kontrola kvality údajov. Nezapisuje do Notionu ani do produkčnej databázy."
    >
      <div style={{ display: "grid", gap: 20 }}>
        <AdminNotionSyncOverview />
        <AdminNotionDataQualityAudit />
      </div>
    </AdminShell>
  );
}
