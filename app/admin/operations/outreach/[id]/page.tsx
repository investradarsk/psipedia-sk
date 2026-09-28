import Link from "next/link";
import { AdminOutreachCampaign } from "@/components/admin-outreach-campaign";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { getOutreachAdminData } from "@/lib/outreach-store";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };

export default async function AdminOutreachCampaignPage({ params }: Props) {
  const id = (await params).id;
  const user = await requireAdminPageUser("/admin/operations/outreach/" + id);
  const data = await getOutreachAdminData(id);
  if (!data.campaign) {
    return (
      <AdminShell user={user} eyebrow="Admin Operations" title="Kampaň sa nenašla">
        <section className="admin-panel"><Link href="/admin/operations/outreach">Späť na outreach</Link></section>
      </AdminShell>
    );
  }
  return (
    <AdminShell
      user={user}
      eyebrow="Admin Operations · Outreach"
      title={data.campaign.name}
      description="Recipient selection, preview, bounded send, delivery state a human-review odpovede."
      actions={<Link href="/admin/operations/outreach">Všetky kampane</Link>}
    >
      <AdminOutreachCampaign
        campaign={data.campaign as never}
        recipients={data.recipients as never[]}
        responses={data.responses as never[]}
        provider={data.provider}
      />
    </AdminShell>
  );
}
