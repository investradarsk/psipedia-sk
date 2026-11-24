import { AdminShell } from "@/components/admin-shell";
import { AdminNotionWorkspace } from "@/components/admin-notion-sync-overview";
import { requireAdminPageUser } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export default async function NotionDataQualityAuditPage() {
  const user = await requireAdminPageUser("/admin/nastroje/notion-audit");
  return <AdminShell user={user} eyebrow="Admin · Nástroje · Notion"
    title="Notion – synchronizácia a diagnostika"
    description="Spoločné pracovisko pre prehľad D1, kontrolu konfliktov, pravidlá polí a manuálne prenosy.">
    <div data-admin-content-module="notion-audit"><AdminNotionWorkspace initialTab="issues" /></div>
  </AdminShell>;
}
