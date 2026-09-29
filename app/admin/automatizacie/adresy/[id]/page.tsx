import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminAutomationAddressReview } from "@/components/admin-automation-address-review";
import { AdminShell } from "@/components/admin-shell";
import { AdminAutomationAvailabilityState } from "@/app/admin/automatizacie/_components/automation-availability-state";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { getAutomationAddressReviewCase } from "@/lib/data-automation-address-review-store";
import { readAdminAutomationData, summarizeAdminAutomationReads } from "@/lib/admin-automation-reliability";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };

export default async function AutomationAddressReviewDetailPage({ params }: Props) {
  const id = Number.parseInt((await params).id, 10);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  const user = await requireAdminPageUser(`/admin/automatizacie/adresy/${id}`);
  const reviewRead = await readAdminAutomationData({
    key: `address-review-detail:${id}`,
    load: () => getAutomationAddressReviewCase(id),
    fallback: null,
    empty: (value) => value === null,
  });
  const reliability = summarizeAdminAutomationReads([reviewRead]);
  if (reviewRead.status === "UNAVAILABLE") {
    return (
      <AdminShell
        user={user}
        eyebrow="Automatizácie · Adresa na kontrolu"
        title="Kontrola adresy"
        description="Detail sa momentálne nepodarilo bezpečne načítať."
        actions={<Link href="/admin/automatizacie/adresy">← Adresy na kontrolu</Link>}
      >
        <AdminAutomationAvailabilityState summary={reliability} refreshHref={`/admin/automatizacie/adresy/${id}`} />
      </AdminShell>
    );
  }
  const review = reviewRead.data;
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
