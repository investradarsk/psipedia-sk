import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin-shell";
import { AdminPartnerClaimActions } from "@/components/admin-partner-claim-actions";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { getPartnerClaimAdmin } from "@/lib/partner-claims-admin";
import "../../partners.css";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireAdminPageUser(`/admin/partners/claims/${id}`);
  const claim = await getPartnerClaimAdmin(id);
  if (!claim) notFound();
  const memberships = claim.memberships as Array<{ id: string; accountId: string; role: string; accountStatus: string; createdAt: string }>;
  const pending = claim.otherPendingClaims as Array<{ id: string; accountId: string; status: string; createdAt: string }>;
  const audit = claim.audit as Array<{ id: string; action: string; actorRef: string; createdAt: string }>;

  return (
    <AdminShell user={user} eyebrow="Partner claim" title={claim.resourceName} description={`${claim.status} · ${claim.entityType}`}>
      {claim.conflict ? <section className="admin-partner-conflict"><strong>⚠ Ownership konflikt</strong><p>Na resource existuje iný aktívny OWNER alebo iný pending claim. Schválenie nesmie automaticky odobrať existujúce vlastníctvo.</p></section> : null}
      <div className="admin-partner-detail">
        <section className="admin-form-card"><h2>Partner</h2><p>{claim.email}</p><Link href={`/admin/partners/accounts/${claim.accountId}`}>Partner účet →</Link></section>
        <section className="admin-form-card"><h2>Profil</h2><p>{claim.resourceName}</p><p>{claim.entityType} · resource {claim.resourceId}</p><Link href={claim.publicHref} target="_blank">Verejný profil ↗</Link></section>
        <section className="admin-form-card"><h2>Žiadosť</h2><p className="admin-commercial-message">{claim.requestMessage ?? "Bez správy."}</p><small>Odoslané {new Date(claim.createdAt).toLocaleString("sk-SK")}</small></section>
        <section className="admin-form-card"><h2>Verification state</h2><p>{String((claim.verification as { status?: string }).status ?? "UNVERIFIED")}</p></section>
        <section className="admin-form-card"><h2>Aktívne memberships</h2>{memberships.length ? memberships.map((m) => <article key={m.id}><strong>{m.role}</strong><span>{m.accountId} · {m.accountStatus}</span></article>) : <p>Žiadne aktívne membership.</p>}</section>
        <section className="admin-form-card"><h2>Iné pending claims</h2>{pending.length ? pending.map((item) => <article key={item.id}><Link href={`/admin/partners/claims/${item.id}`}>{item.accountId}</Link><span>{new Date(item.createdAt).toLocaleString("sk-SK")}</span></article>) : <p>Žiadne.</p>}</section>
        <section className="admin-form-card"><h2>Audit</h2>{audit.length ? audit.map((item) => <article key={item.id}><strong>{item.action}</strong><span>{item.actorRef} · {new Date(item.createdAt).toLocaleString("sk-SK")}</span></article>) : <p>Bez audit udalostí.</p>}</section>
      </div>
      {claim.status === "PENDING" ? <AdminPartnerClaimActions claimId={claim.id} /> : null}
    </AdminShell>
  );
}
