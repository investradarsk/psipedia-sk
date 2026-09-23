import Link from "next/link";
import { PartnerClaimCancelButton, PartnerVerificationRequest } from "@/components/partner-request-actions";
import { PartnerProfileChangeWithdrawButton } from "@/components/partner-profile-change-actions";
import { PartnerShell } from "@/components/partner-shell";
import { requirePartnerPageIdentity } from "@/lib/partner-page-auth";
import { listPartnerClaims, listPartnerVerificationResources } from "@/lib/partner-claims";
import { listPartnerProfileChanges } from "@/lib/partner-profile-changes";

export const dynamic = "force-dynamic";

const claimLabels = {
  PENDING: "Čaká na kontrolu",
  APPROVED: "Schválené",
  REJECTED: "Zamietnuté",
  CANCELLED: "Zrušené",
} as const;
const verificationLabels = {
  UNVERIFIED: "Neoverené",
  PENDING_VERIFICATION: "Čaká na overenie",
  VERIFIED: "Overené",
  REJECTED: "Overenie zamietnuté",
} as const;

export default async function Page() {
  const identity = await requirePartnerPageIdentity();
  const [claims, resources, profileChanges] = await Promise.all([
    listPartnerClaims(identity.accountId),
    listPartnerVerificationResources(identity.accountId),
    listPartnerProfileChanges(identity.accountId),
  ]);

  return (
    <PartnerShell title="Žiadosti a overenia" description="Sledujte prevzatie existujúcich profilov a samostatný stav overenia správcu.">
      <section className="partner-requests-section">
        <div className="partner-section-heading">
          <div><span className="eyebrow">Prevzatie profilov</span><h2>Moje žiadosti</h2></div>
        </div>
        {claims.length ? <div className="partner-request-list">{claims.map((claim) => (
          <article key={claim.id}>
            <div className="partner-request-title">
              <div><span>{claim.entityType === "DIRECTORY_PROFILE" ? "Adresár" : "Organizácia"}</span><h3>{claim.name}</h3></div>
              <strong>{claimLabels[claim.status]}</strong>
            </div>
            <dl>
              <div><dt>Odoslané</dt><dd>{new Date(claim.createdAt).toLocaleString("sk-SK")}</dd></div>
              <div><dt>Overenie správcu</dt><dd>{verificationLabels[claim.verificationState]}</dd></div>
            </dl>
            {claim.requestMessage ? <p>{claim.requestMessage}</p> : null}
            <div className="partner-request-links">
              <Link href={claim.publicHref} target="_blank">Verejný profil ↗</Link>
              {claim.status === "PENDING" ? <PartnerClaimCancelButton claimId={claim.id} /> : null}
            </div>
          </article>
        ))}</div> : <div className="partner-empty"><h2>Zatiaľ nemáte žiadne žiadosti o prevzatie</h2><p>Žiadosť môžete začať priamo z verejného profilu cez odkaz „Spravujete tento profil?“.</p></div>}
      </section>


      <section className="partner-requests-section">
        <div className="partner-section-heading">
          <div><span className="eyebrow">Moderované zmeny</span><h2>Úpravy profilov</h2></div>
        </div>
        {profileChanges.length ? <div className="partner-request-list">{profileChanges.map((change) => (
          <article key={change.id}>
            <div className="partner-request-title">
              <div><span>{change.resourceType === "DIRECTORY_PROFILE" ? "Adresár" : "Organizácia"}</span><h3>{change.resourceName}</h3></div>
              <strong>{change.statusLabel}</strong>
            </div>
            <dl>
              <div><dt>Odoslané</dt><dd>{new Date(change.createdAt).toLocaleString("sk-SK")}</dd></div>
              <div><dt>Zmenené polia</dt><dd>{change.changedFields.length}</dd></div>
            </dl>
            <p>{change.changedFields.join(", ")}</p>
            {change.rejectionReason ? <p><strong>Dôvod:</strong> {change.rejectionReason}</p> : null}
            <div className="partner-request-links">
              <Link href={change.publicHref} target="_blank">Verejný profil ↗</Link>
              {change.canWithdraw ? <PartnerProfileChangeWithdrawButton id={change.id} /> : null}
            </div>
          </article>
        ))}</div> : <div className="partner-empty"><h2>Zatiaľ nemáte žiadne návrhy úprav</h2><p>Úpravu môžete odoslať zo sekcie Moje profily.</p></div>}
      </section>

      <section className="partner-requests-section">
        <div className="partner-section-heading"><div><span className="eyebrow">Overenie</span><h2>Overenie správcu</h2></div></div>
        {resources.length ? <div className="partner-request-list">{resources.map((resource) => (
          <article key={resource.resourceId}>
            <div className="partner-request-title">
              <div><span>{resource.entityType === "DIRECTORY_PROFILE" ? "Adresár" : "Organizácia"}</span><h3>{resource.name}</h3></div>
              <strong>{verificationLabels[resource.verificationState]}</strong>
            </div>
            <p>Overenie potvrdzuje iba oprávnenie Partnera spravovať profil. Nie je odporúčaním služby ani plateným zvýraznením.</p>
            <div className="partner-request-links">
              <Link href={resource.publicHref} target="_blank">Verejný profil ↗</Link>
              <PartnerVerificationRequest resourceId={resource.resourceId} state={resource.verificationState} />
            </div>
          </article>
        ))}</div> : <div className="partner-empty"><h2>Nemáte OWNER profil vhodný na overenie</h2><p>Po schválení prevzatia sa profil zobrazí medzi vašimi spravovanými profilmi.</p></div>}
      </section>
    </PartnerShell>
  );
}
