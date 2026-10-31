import { AdminShell } from "@/components/admin-shell";
import { AdminNotionFieldSettings } from "@/components/admin-notion-field-settings";
import { requireAdminPageUser } from "@/lib/admin-auth";
export const dynamic="force-dynamic";
export default async function NotionFieldSettingsPage(){
  const user=await requireAdminPageUser("/admin/nastavenia/notion");
  return <AdminShell user={user} eyebrow="Nastavenia / Integrácie"
    title="Notion – prepojenia a priority polí"
    description="Vyber oblasť, kategóriu a konkrétne pole. Identita, publikovanie, služby V3 a potvrdené údaje Google Maps ostávajú chránené.">
    <AdminNotionFieldSettings/>
  </AdminShell>;
}
