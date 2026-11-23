import { AdminShell } from "@/components/admin-shell";
import { AdminNotionWorkspace } from "@/components/admin-notion-sync-overview";
import { requireAdminPageUser } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export default async function NotionFieldSettingsPage() {
  const user = await requireAdminPageUser("/admin/nastavenia/notion");
  return <AdminShell user={user} eyebrow="Nastavenia / Integrácie"
    title="Notion – synchronizácia a nastavenia"
    description="Jedno pracovisko pre stav synchronizácie, konflikty, pravidlá polí a bezpečný ručný prenos.">
    <div data-admin-content-module="notion-settings"><AdminNotionWorkspace initialTab="fields" /></div>
  </AdminShell>;
}
