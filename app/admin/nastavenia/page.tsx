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
      <section style={{padding:"1rem",background:"#fff",border:"1px solid #dce5df",borderRadius:12,marginBottom:16}}>
        <h2 style={{margin:"0 0 .4rem"}}>Integrácie a prepojenia</h2>
        <p>Notion – všetky agendy, mapovanie polí a priority Admin / Notion / najnovšia overená zmena.</p>
        <Link href="/admin/nastavenia/notion" style={{color:"#246044",fontWeight:700}}>
          Otvoriť nastavenia Notion →
        </Link>
      </section>
      <AdminPwaSettings />
    </AdminShell>
  );
}
