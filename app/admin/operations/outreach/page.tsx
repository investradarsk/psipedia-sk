import Link from "next/link";
import { AdminOutreachDashboard } from "@/components/admin-outreach-dashboard";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { getOutreachAdminData } from "@/lib/outreach-store";

export const dynamic = "force-dynamic";

export default async function AdminOutreachPage() {
  const user = await requireAdminPageUser("/admin/operations/outreach");
  const data = await getOutreachAdminData().catch(() => ({
    campaigns: [],
    provider: { configured: false, providerKey: "", reason: "outreach_schema_unavailable" },
  }));
  return (
    <AdminShell
      user={user}
      eyebrow="Admin Operations"
      title="Profilový outreach"
      description="Kontrolované oslovenia na overenie verejných profilov. Dry run je povinný, send je bounded a návrhy recipientov nikdy automaticky neprepisujú canonical dáta."
      actions={<><Link href="/admin/operations">Centrum pozornosti</Link><Link href="/admin/operations/automation">Automatický research</Link></>}
    >
      <AdminOutreachDashboard initialCampaigns={data.campaigns as never[]} provider={data.provider} />
    </AdminShell>
  );
}
