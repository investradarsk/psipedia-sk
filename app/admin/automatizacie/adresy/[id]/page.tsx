import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminAutomationAddressReview } from "@/components/admin-automation-address-review";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { getAutomationAddressReviewCase } from "@/lib/data-automation-address-review-store";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };

export default async function AutomationAddressReviewDetailPage({ params }: Props) {
  const id = Number.parseInt((await params).id, 10);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  const user = await requireAdminPageUser(`/admin/automatizacie/adresy/${id}`);
  const review = await getAutomationAddressReviewCase(id).catch(() => null);
  if (!review) notFound();

  return (
    <AdminShell
      user={user}
      eyebrow="Automatizácie · Adresa na kontrolu"
      title={review.canonicalName || "Kontrola adresy"}
      description="Automatizácia potrebuje potvrdiť správnu adresu. Výber sa pred zápisom znovu overí."
      actions={<Link href="/admin/automatizacie/adresy">← Adresy na kontrolu</Link>}
    >
      <AdminAutomationAddressReview review={review} />
    </AdminShell>
  );
}
