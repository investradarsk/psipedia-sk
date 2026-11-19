import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin-shell";
import { AdminPartnerAccountActions } from "@/components/admin-partner-account-actions";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { getPartnerAccountAdmin } from "@/lib/partner-admin-store";
import "../../partners.css";
import { partnerAdminStatusLabel, partnerAdminResourceLabel, partnerAdminRoleLabel } from "@/lib/admin-partner-labels";

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
      description={`${partnerAdminStatusLabel(account.status)} · vytvorený ${new Date(account.createdAt).toLocaleDateString("sk-SK")}`}
    >
      {memberships.every(m => Boolean(m.revokedAt)) && <p className="admin-partner-explainer" role="status">Tento účet zatiaľ nemá priradený aktívny prístup k žiadnemu profilu ani podujatiu. Samotná registrácia prístup nevytvára.</p>}
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
          <h2>Prihlasovacie metódy</h2>
          <p><strong>Magic link:</strong> dostupný</p>
          <p><strong>Heslo:</strong> {account.authMethods.passwordSet ? "nastavené" : "nenastavené"}</p>
          <p><strong>Google:</strong> {account.authMethods.googleLinked ? "prepojené" : "neprepojené"}</p>
          {account.authMethods.googleLinkedAt ? (
            <p><strong>Google prepojené:</strong> {new Date(account.authMethods.googleLinkedAt).toLocaleString("sk-SK")}</p>
          ) : null}
        </section>

        <section className="admin-form-card">
          <h2>História prístupov</h2>
          {memberships.length ? memberships.map((membership) => (
            <article key={membership.id}>
              <strong>{membership.resourceName}</strong>
              <span>{partnerAdminResourceLabel(membership.entityType)} · {partnerAdminRoleLabel(membership.role)} · {membership.revokedAt ? "odvolaný prístup" : "aktívny prístup"}</span>
            </article>
          )) : <p>Žiadny prístup zatiaľ nebol pridelený.</p>}
        </section>

        <section className="admin-form-card">
          <h2>História účtu</h2>
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
