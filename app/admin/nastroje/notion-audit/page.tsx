import { AdminShell } from "@/components/admin-shell";
import { AdminNotionDataQualityAudit } from "@/components/admin-notion-data-quality-audit";
import { requireAdminPageUser } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export default async function NotionDataQualityAuditPage() {
  const user = await requireAdminPageUser("/admin/nastroje/notion-audit");
  return (
    <AdminShell
      user={user}
      eyebrow="Admin · Nástroje · Notion"
      title="Kontrola údajov v Notione"
      description="Bezpečná kontrola synchronizácie po 100 záznamoch. Nezapisuje nič do Notionu ani produkčnej databázy."
    >
      <AdminNotionDataQualityAudit />
    </AdminShell>
  );
}
