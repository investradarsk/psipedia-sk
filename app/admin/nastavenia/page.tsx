import { AdminPwaSettings } from "@/components/admin-pwa-settings";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const user = await requireAdminPageUser("/admin/nastavenia");

  return (
    <AdminShell
      user={user}
      eyebrow="Admin aplikácia"
      title="Nastavenia aplikácie"
      description="Inštalácia admin PWA a upozornenia pre toto zariadenie. Redakčné úpravy zostávajú vždy online-only."
    >
      <AdminPwaSettings />
    </AdminShell>
  );
}
