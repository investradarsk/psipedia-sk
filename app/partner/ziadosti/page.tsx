import Link from "next/link";
import { PartnerClaimCancelButton, PartnerVerificationRequest } from "@/components/partner-request-actions";
import { PartnerProfileChangeWithdrawButton } from "@/components/partner-profile-change-actions";
import { PartnerNewProfileWithdrawButton } from "@/components/partner-new-profile-actions";
import { PartnerEventWithdrawButton } from "@/components/partner-event-actions";
import { PartnerHelpWithdrawButton } from "@/components/partner-help-create-form";
import { PartnerShell } from "@/components/partner-shell";
import { listPartnerLifecycleRequests } from "@/lib/partner-lifecycle";
import { getDirectoryCategory } from "@/lib/directory";
import { requirePartnerPageIdentity } from "@/lib/partner-page-auth";
import { listPartnerClaims, listPartnerVerificationResources } from "@/lib/partner-claims";
import { getPartnerEditableFields, listPartnerProfileChanges } from "@/lib/partner-profile-changes";
import { partnerEventOperationLabel, partnerOrganizationTypeLabel } from "@/lib/partner-ui-labels";
import { listPartnerNewProfiles } from "@/lib/partner-new-profile";
import { listPartnerEventSubmissions } from "@/lib/partner-events";
import { listPartnerHelpCreateSubmissions } from "@/lib/partner-help-create";

export const dynamic = "force-dynamic";

const claimLabels = {
  PENDING: "Čaká na kontrolu",
  APPROVED: "Schválené",
  REJECTED: "Zamietnuté",
  CANCELLED: "Zrušené",
  REVOKED: "Prístup odobratý",
} as const;
const verificationLabels = {
  UNVERIFIED: "Neoverené",
  PENDING_VERIFICATION: "Čaká na overenie",
  VERIFIED: "Overené",
  REJECTED: "Overenie zamietnuté",
} as const;

function profileFieldLabel(resourceType: Parameters<typeof getPartnerEditableFields>[0], key: string) {
  return getPartnerEditableFields(resourceType).find((field) => field.key === key)?.label ?? key;
}

function profileCategoryLabel(resourceType: "DIRECTORY_PROFILE" | "HELP_ORGANIZATION", value: string) {
  return resourceType === "DIRECTORY_PROFILE"
    ? getDirectoryCategory(value)?.label ?? value
    : partnerOrganizationTypeLabel(value);
}

export default async function Page() {
  const identity = await requirePartnerPageIdentity();
  const [claims, resources, profileChanges, newProfiles, eventSubmissions, helpSubmissions, lifecycle] = await Promise.all([
    listPartnerClaims(identity.accountId),
    listPartnerVerificationResources(identity.accountId),
    listPartnerProfileChanges(identity.accountId),
    listPartnerNewProfiles(identity.accountId),
    listPartnerEventSubmissions(identity.accountId),
    listPartnerHelpCreateSubmissions(identity.accountId),
    listPartnerLifecycleRequests({accountId:identity.accountId}),
  ]);

  return (
    <PartnerShell title="Žiadosti a overenia" description="Sledujte prevzatie existujúcich profilov a samostatný stav overenia správcu.">
      {lifecycle.length>0&&<section className="partner-requests-section">
        <div className="partner-section-heading">
          <div><span className="eyebrow">Správa a viditeľnosť</span><h2>Moje administratívne žiadosti</h2></div>
        </div>
        <div className="partner-request-list">{lifecycle.map(item=>(
          <article key={item.id}>
            <div className="partner-request-title">
              <div><span>{({DIRECTORY_PROFILE:"Služba pre psov",HELP_ORGANIZATION:"Organizácia",MANAGED_EVENT:"Podujatie",ADOPTION_DOG:"Adopcia",LOST_FOUND_DOG:"Stratený alebo nájdený pes",HELP_CASE:"Pomoc psom",PARTNER_ACCOUNT:"Partnerský účet"} as Record<string,string>)[item.resourceType]??"Záznam"}</span>
                <h3>{({
                  REQUEST_HIDE:"Dočasne skryť profil",
                  REQUEST_ARCHIVE:"Odstrániť profil (archivovať)",
                  REQUEST_RELEASE:"Vzdať sa správy",
                  REQUEST_DELETE_ACCOUNT:"Zrušiť účet",
                } as Record<string,string>)[item.action]}</h3>
              </div>
              <strong>{({
                SUBMITTED:"Čaká na rozhodnutie",PENDING_REVIEW:"Kontroluje sa",
                APPROVED:"Schválené",REJECTED:"Zamietnuté",
              } as Record<string,string>)[item.status]??"Stav žiadosti"}</strong>
            </div>
            <p>Odoslané {new Date(item.createdAt).toLocaleString("sk-SK")}</p>
            {item.reason&&<p>Dôvod: {item.reason}</p>}
          </article>
        ))}</div>
      </section>}
      <section className="partner-requests-section">
        <div className="partner-section-heading">
          <div><span className="eyebrow">Prevzatie profilov</span><h2>Moje žiadosti</h2></div>
        </div>
        {claims.length ? <div className="partner-request-list">{claims.map((claim) => (
          <article key={claim.id}>
            <div className="partner-request-title">
              <div><span>{claim.entityType === "DIRECTORY_PROFILE" ? "Služba pre psov" : claim.entityType === "HELP_ORGANIZATION" ? "Organizácia" : claim.entityType === "MANAGED_EVENT" ? "Podujatie" : claim.entityType === "ADOPTION_DOG" ? "Adopcia" : claim.entityType === "LOST_FOUND_DOG" ? "Stratený/nájdený pes" : "Pomoc psom"}</span><h3>{claim.name}</h3></div>
              <strong>{claimLabels[claim.status]}</strong>
            </div>
            <dl>
              <div><dt>Odoslané</dt><dd>{new Date(claim.createdAt).toLocaleString("sk-SK")}</dd></div>
              {(claim.entityType === "DIRECTORY_PROFILE" || claim.entityType === "HELP_ORGANIZATION") ? <div><dt>Overenie správcu</dt><dd>{verificationLabels[claim.verificationState]}</dd></div> : null}
            </dl>
            {claim.requestMessage ? <p>{claim.requestMessage}</p> : null}
            <div className="partner-request-links">
              <Link href={claim.publicHref} target="_blank">Verejný profil ↗</Link>
              {claim.status === "PENDING" ? <PartnerClaimCancelButton claimId={claim.id} /> : null}
            </div>
          </article>
        ))}</div> : <div className="partner-empty"><h2>Zatiaľ nemáte žiadne žiadosti o prevzatie</h2><p><Link href="/partner/prevziat">Vyhľadať existujúci záznam a požiadať o jeho správu</Link>.</p></div>}
      </section>



      <section className="partner-requests-section">
        <div className="partner-section-heading">
          <div><span className="eyebrow">Nové profily</span><h2>Moje návrhy nových profilov</h2></div>
          <Link href="/partner/profily/novy">Pridať nový profil</Link>
        </div>
        {newProfiles.length ? <div className="partner-request-list">{newProfiles.map((submission) => (
          <article key={submission.id}>
            <div className="partner-request-title">
              <div><span>{submission.resourceType === "DIRECTORY_PROFILE" ? "Služba pre psov" : "Organizácia na pomoc psom"}</span><h3>{submission.displayName}</h3></div>
              <strong>{submission.statusLabel}</strong>
            </div>
            <dl>
              <div><dt>Odoslané</dt><dd>{new Date(submission.createdAt).toLocaleString("sk-SK")}</dd></div>
              <div><dt>Typ / kategória</dt><dd>{profileCategoryLabel(submission.resourceType, submission.categoryOrType)}</dd></div>
            </dl>
            {submission.duplicateWarning ? <p><strong>Kontrola duplicít:</strong> {submission.duplicateWarning}</p> : null}
            {submission.resolutionType === "CREATED_NEW" ? <p>{submission.subjectId ? "Profil bol schválený a zverejnený." : "Profil bol vytvorený a pripravuje sa na zverejnenie."}</p> : null}
            {submission.resolutionType === "LINKED_EXISTING" ? <p>Návrh bol prepojený s existujúcim profilom.</p> : null}
            {submission.rejectionReason ? <p><strong>Dôvod:</strong> {submission.rejectionReason}</p> : null}
            <div className="partner-request-links">
              {submission.canonicalHref ? <Link href={submission.canonicalHref}>Verejný profil →</Link> : null}
              {submission.subjectId ? <Link href={`/partner/koncepty/${encodeURIComponent(submission.id)}`}>Zobraziť podanie a rozhodnutie →</Link> : null}
              {submission.canWithdraw ? <PartnerNewProfileWithdrawButton id={submission.id} /> : null}
            </div>
          </article>
        ))}</div> : <div className="partner-empty"><h2>Zatiaľ nemáte návrh nového profilu</h2><p>Ak svoj profil na Psipedii nenájdete, môžete navrhnúť nový na schválenie.</p></div>}
      </section>


      <section className="partner-requests-section">
        <div className="partner-section-heading">
          <div><span className="eyebrow">Pomoc psom</span><h2>Návrhy nových záznamov</h2></div>
          <Link href="/partner/pomoc/nova">Pridať pomoc psom</Link>
        </div>
        {helpSubmissions.length ? <div className="partner-request-list">{helpSubmissions.map((submission) => (
          <article key={submission.id}>
            <div className="partner-request-title">
              <div><span>{submission.resourceType==="ADOPTION_DOG"?"Adopcia":submission.resourceType==="LOST_FOUND_DOG"?"Stratený/nájdený pes":"Pomoc psom"}</span><h3>{submission.title}</h3></div>
              <strong>{submission.statusLabel}</strong>
            </div>
            <dl><div><dt>Odoslané</dt><dd>{new Date(submission.createdAt).toLocaleString("sk-SK")}</dd></div></dl>
            {submission.risks.includes("POSSIBLE_DUPLICATE") ? <p>Možná zhoda s existujúcim záznamom – administrátor ju preverí.</p> : null}
            <div className="partner-request-links">
              {submission.canWithdraw ? <PartnerHelpWithdrawButton id={submission.id}/> : null}
              {submission.status==="APPROVED" ? <span>{submission.subjectId ? "Profil bol schválený a zverejnený." : "Návrh bol schválený na ďalšie spracovanie."}</span> : null}
              {submission.subjectId ? <Link href={`/partner/koncepty/${encodeURIComponent(submission.id)}`}>Zobraziť podanie a rozhodnutie →</Link> : null}
            </div>
          </article>
        ))}</div> : <div className="partner-empty"><h2>Nemáte žiadne návrhy Pomoci psom</h2><p>Pridajte adopciu, strateného psa alebo ďalší prípad pomoci.</p></div>}
      </section>

      <section className="partner-requests-section">
        <div className="partner-section-heading">
          <div><span className="eyebrow">Podujatia</span><h2>Návrhy podujatí</h2></div>
          <Link href="/partner/podujatia/nove">Pridať podujatie</Link>
        </div>
        {eventSubmissions.length ? <div className="partner-request-list">{eventSubmissions.map((submission) => (
          <article key={submission.id}>
            <div className="partner-request-title">
              <div><span>{submission.operation === "CREATE" ? "Nové podujatie" : "Úprava podujatia"}</span><h3>{submission.title}</h3></div>
              <strong>{submission.statusLabel}</strong>
            </div>
            <dl>
              <div><dt>Odoslané</dt><dd>{new Date(submission.createdAt).toLocaleString("sk-SK")}</dd></div>
              <div><dt>Typ návrhu</dt><dd>{partnerEventOperationLabel(submission.operation)}</dd></div>
            </dl>
            {submission.resolutionType === "CREATED_NEW" ? <p>{submission.subjectId ? "Podujatie bolo schválené a zverejnené." : "Podujatie bolo vytvorené a pripravuje sa na zverejnenie."}</p> : null}
            {submission.resolutionType === "LINKED_EXISTING" ? <p>Návrh bol prepojený s existujúcim podujatím.</p> : null}
            {submission.rejectionReason ? <p><strong>Dôvod:</strong> {submission.rejectionReason}</p> : null}
            <div className="partner-request-links">
              {submission.canonicalHref ? <Link href={submission.canonicalHref} target="_blank">Verejné podujatie ↗</Link> : null}
              {submission.subjectId && submission.operation === "CREATE" ? <Link href={`/partner/koncepty/${encodeURIComponent(submission.id)}`}>Zobraziť podanie a rozhodnutie →</Link> : null}
              {submission.canWithdraw ? <PartnerEventWithdrawButton id={submission.id} /> : null}
            </div>
          </article>
        ))}</div> : <div className="partner-empty"><h2>Zatiaľ nemáte návrh podujatia</h2><p>Nové podujatie alebo úpravu vlastného podujatia môžete odoslať zo sekcie Moje podujatia.</p></div>}
      </section>

      <section className="partner-requests-section">
        <div className="partner-section-heading">
          <div><span className="eyebrow">Zmeny profilov</span><h2>Úpravy profilov</h2></div>
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
            <p>{change.changedFields.map((key) => profileFieldLabel(change.resourceType, key)).join(", ")}</p>
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
        ))}</div> : <div className="partner-empty"><h2>Nemáte profil vhodný na overenie</h2><p>Po schválení prevzatia sa profil zobrazí medzi vašimi spravovanými profilmi.</p></div>}
      </section>
    </PartnerShell>
  );
}
