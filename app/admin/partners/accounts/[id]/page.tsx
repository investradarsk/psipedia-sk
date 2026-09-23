import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin-shell";
import { AdminPartnerAccountActions } from "@/components/admin-partner-account-actions";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { getPartnerAccountAdmin } from "@/lib/partner-admin-store";
import "../../partners.css";

export const dynamic = "force-dynamic";

type Membership = {
  id: string;
  resourceId: string;
  role: string;
  createdAt: string;
  revokedAt: string | null;
  resourceName: string;
  entityType: string;
};

type AuditEvent = { id: string; action: string; createdAt: string };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireAdminPageUser(`/admin/partners/accounts/${id}`);
  const account = await getPartnerAccountAdmin(id);
  if (!account) notFound();

  const memberships = account.memberships as Membership[];
  const audit = account.audit as AuditEvent[];
  const profile = account.contactProfile;

  return (
    <AdminShell
      user={user}
      eyebrow="Partner účet"
      title={account.email}
      description={`${account.status} · vytvorený ${new Date(account.createdAt).toLocaleDateString("sk-SK")}`}
    >
      <div className="admin-partner-detail">
        <section className="admin-form-card">
          <h2>Kontakt</h2>
          {profile ? (
            <>
              <p><strong>Meno a priezvisko:</strong> {profile.contactName}</p>
              <p><strong>E-mail:</strong> {account.email}</p>
              {profile.phone ? <p><strong>Telefón:</strong> {profile.phone}</p> : null}
              {profile.relationship ? <p><strong>Úloha / vzťah:</strong> {profile.relationship}</p> : null}
              <p><strong>Kontaktné údaje dokončené:</strong> {new Date(profile.completedAt).toLocaleString("sk-SK")}</p>
            </>
          ) : (
            <>
              <p><strong>E-mail:</strong> {account.email}</p>
              <p>Partner ešte nedokončil kontaktné údaje.</p>
            </>
          )}
        </section>

        <section className="admin-form-card">
          <h2>Účet a sessions</h2>
          <p>Overený: {account.emailVerifiedAt ? new Date(account.emailVerifiedAt).toLocaleString("sk-SK") : "nie"}</p>
          <p>Sessions: {String((account.sessions as { active?: number }).active ?? 0)} aktívnych</p>
        </section>

        <section className="admin-form-card">
          <h2>Membership história</h2>
          {memberships.length ? memberships.map((membership) => (
            <article key={membership.id}>
              <strong>{membership.resourceName}</strong>
              <span>{membership.entityType} · {membership.role} · {membership.revokedAt ? "odvolaná" : "aktívna"}</span>
            </article>
          )) : <p>Bez memberships.</p>}
        </section>

        <section className="admin-form-card">
          <h2>Partner audit</h2>
          {audit.length ? audit.map((event) => (
            <article key={event.id}>
              <strong>{event.action}</strong>
              <span>{new Date(event.createdAt).toLocaleString("sk-SK")}</span>
            </article>
          )) : <p>Bez historických udalostí. Staré účty nemajú syntetický backfill.</p>}
        </section>
      </div>

      <AdminPartnerAccountActions accountId={account.id} status={account.status} memberships={memberships} />
    </AdminShell>
  );
}
