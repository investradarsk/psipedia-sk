import { AdminPwaSettings } from "@/components/admin-pwa-settings";
import Link from "next/link";
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
      description="Nastavenia tohto zariadenia: admin PWA, upozornenia a vylúčenie vlastnej návštevnosti z Cloudflare Web Analytics. Redakčné úpravy zostávajú vždy online-only."
    >
      <div data-admin-content-module="application-settings">
      <section className="admin-settings-integration-card" data-admin-settings-statistics>
        <h2>Štatistiky návštevnosti</h2>
        <p>Počty zobrazení celého webu, vývoj podľa dní a najnavštevovanejšie stránky.</p>
        <Link href="/admin/nastavenia/statistiky">
          Otvoriť štatistiky →
        </Link>
      </section>
      <section className="admin-settings-integration-card">
        <h2>Integrácie a prepojenia</h2>
        <p>Notion – všetky agendy, mapovanie polí a priority Admin / Notion / najnovšia overená zmena.</p>
        <Link href="/admin/nastavenia/notion">
          Otvoriť nastavenia Notion →
        </Link>
      </section>
      <AdminPwaSettings />
      </div>
    </AdminShell>
  );
}
