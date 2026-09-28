import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin-shell";
import { AdminPartnerVerificationActions } from "@/components/admin-partner-verification-actions";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { getPartnerVerificationAdmin } from "@/lib/partner-claims-admin";
import "../../partners.css";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireAdminPageUser(`/admin/partners/verifications/${id}`);
  const verification = await getPartnerVerificationAdmin(id);
  if (!verification) notFound();
  const audit = verification.audit as Array<{ id: string; action: string; actorRef: string; createdAt: string }>;
  const claim = verification.claim as { id?: string; status?: string; createdAt?: string } | null;

  return (
    <AdminShell user={user} eyebrow="Partner verification" title={verification.resourceName} description={`${verification.status} · membership ${verification.membershipRole ?? "none"}`}>
      {verification.conflict ? <section className="admin-partner-conflict"><strong>⚠ Ownership konflikt</strong><p>Resource má ďalšie ownership signály. Overenie vyžaduje zvýšenú manuálnu kontrolu.</p></section> : null}
      <div className="admin-partner-detail">
        <section className="admin-form-card"><h2>Partner</h2><p>{verification.email}</p><Link href={`/admin/partners/accounts/${verification.accountId}`}>Partner účet →</Link></section>
        <section className="admin-form-card"><h2>Resource</h2><p>{verification.resourceName}</p><p>{verification.entityType} · {verification.resourceId}</p><Link href={verification.publicHref} target="_blank">Verejný profil ↗</Link></section>
        <section className="admin-form-card"><h2>Partner poznámka</h2><p className="admin-commercial-message">{verification.requestNote ?? "Bez poznámky."}</p></section>
        <section className="admin-form-card"><h2>Verejné kontakty</h2><p>Web: {verification.websiteUrl ?? "—"}</p>{verification.publicEmail ? <p>E-mail: {verification.publicEmail}</p> : null}{verification.publicPhone ? <p>Telefón: {verification.publicPhone}</p> : null}</section>
        <section className="admin-form-card"><h2>Súvisiaci claim</h2>{claim?.id ? <><p>{claim.status}</p><Link href={`/admin/partners/claims/${claim.id}`}>Claim detail →</Link></> : <p>Verification nepochádza z evidovaného claimu.</p>}</section>
        <section className="admin-form-card"><h2>Audit</h2>{audit.length ? audit.map((item) => <article key={item.id}><strong>{item.action}</strong><span>{item.actorRef} · {new Date(item.createdAt).toLocaleString("sk-SK")}</span></article>) : <p>Bez audit udalostí.</p>}</section>
      </div>
      {verification.status === "PENDING_VERIFICATION" ? <AdminPartnerVerificationActions verificationId={verification.id} /> : null}
    </AdminShell>
  );
}
