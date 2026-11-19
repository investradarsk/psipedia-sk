import Link from "next/link";
import { PartnerShell } from "@/components/partner-shell";
import { requirePartnerPageIdentity } from "@/lib/partner-page-auth";
import { listPartnerResources, type PartnerManagedResource } from "@/lib/partner-platform";
import { listPartnerClaims } from "@/lib/partner-claims";
import { listPartnerNewProfiles } from "@/lib/partner-new-profile";
import { listPartnerEventSubmissions } from "@/lib/partner-events";
import { listPartnerHelpCreateSubmissions } from "@/lib/partner-help-create";
import { listPartnerProfileChanges } from "@/lib/partner-profile-changes";
import { buildPartnerDashboardSummary } from "@/lib/partner-dashboard";
import { partnerResourceStatusLabel } from "@/lib/partner-ui-labels";

export const dynamic = "force-dynamic";

function resourceTypeLabel(type: PartnerManagedResource["entityType"]) {
  if (type === "MANAGED_EVENT") return "Podujatie";
  if (type === "HELP_ORGANIZATION") return "Organizácia na pomoc psom";
  if (type === "ADOPTION_DOG") return "Adopcia";
  if (type === "LOST_FOUND_DOG") return "Stratený alebo nájdený pes";
  if (type === "HELP_CASE") return "Pomoc psom";
  return "Služby pre psov";
}

function resourceEditHref(resource: PartnerManagedResource) {
  const id = encodeURIComponent(resource.resourceId);
  return resource.entityType === "MANAGED_EVENT"
    ? `/partner/podujatia/${id}/upravit`
    : `/partner/profily/${id}/upravit`;
}

export default async function PartnerHomePage() {
  const identity = await requirePartnerPageIdentity();
  const [resources, claims, newProfiles, eventSubmissions, profileChanges, helpSubmissions] = await Promise.all([
    listPartnerResources(identity.accountId),
    listPartnerClaims(identity.accountId),
    listPartnerNewProfiles(identity.accountId),
    listPartnerEventSubmissions(identity.accountId),
    listPartnerProfileChanges(identity.accountId),
    listPartnerHelpCreateSubmissions(identity.accountId),
  ]);
  const summary = buildPartnerDashboardSummary({
    resources, claims, newProfiles, eventSubmissions, profileChanges, helpSubmissions,
  });

  return (
    <PartnerShell title="Prehľad" description="Všetky vaše profily, podujatia a žiadosti na jednom mieste.">
      <section className="partner-dashboard-welcome" aria-labelledby="partner-welcome-title">
        <div className="partner-dashboard-welcome-copy">
          <span className="eyebrow">Váš priestor na Psipedii</span>
          <h2 id="partner-welcome-title">{resources.length ? "Vaše záznamy máte pod kontrolou." : "Začnite so svojím prvým profilom."}</h2>
          <p>{resources.length
            ? "Tu môžete otvoriť a upravovať pridelené záznamy. Nový profil alebo podujatie môžete kedykoľvek navrhnúť."
            : "Vytvorte nový profil alebo požiadajte o správu už existujúceho. Po schválení sa vám zobrazí v tomto prehľade."}</p>
          <div className="partner-dashboard-welcome-actions">
            <Link className="button button--dark" href="/partner/profily/novy">Pridať nový profil</Link>
            <Link className="button" href="/partner/podujatia/nove">Pridať podujatie</Link>
            <Link className="button" href="/partner/pomoc/nova">Pridať pomoc psom</Link>
          </div>
        </div>
        <div className="partner-dashboard-welcome-aside" aria-hidden="true">
          <span>PSIPEDIA</span>
          <strong>Partner</strong>
          <span>Váš profil. Vaša správa.</span>
        </div>
      </section>

      <section className="partner-dashboard-stats" aria-label="Stav môjho účtu">
        <Link href="/partner/profily" className="partner-dashboard-stat">
          <span>Moje profily</span><strong>{summary.profiles}</strong><small>Spravované profily</small>
        </Link>
        <Link href="/partner/podujatia" className="partner-dashboard-stat">
          <span>Moje podujatia</span><strong>{summary.events}</strong><small>Spravované podujatia</small>
        </Link>
        <Link href="/partner/ziadosti" className="partner-dashboard-stat">
          <span>Čakajúce žiadosti</span><strong>{summary.pendingRequests}</strong><small>Na vybavenie administrátorom</small>
        </Link>
      </section>

      <section className="partner-dashboard-section" aria-labelledby="partner-managed-heading">
        <div className="partner-dashboard-section-heading">
          <div><span className="eyebrow">Moje záznamy</span><h2 id="partner-managed-heading">Čo spravujete</h2></div>
          {summary.profiles > 0 ? <Link href="/partner/profily">Všetky profily</Link> : null}
        </div>
        {resources.length ? (
          <div className="partner-dashboard-record-grid">
            {resources.slice(0, 6).map((item) => (
              <article key={item.resourceId} className="partner-dashboard-record">
                <span className="partner-dashboard-type">{resourceTypeLabel(item.entityType)}</span>
                <h3>{item.name}</h3>
                <p>{partnerResourceStatusLabel(item.status)}</p>
                <div className="partner-dashboard-record-actions">
{["DIRECTORY_PROFILE","HELP_ORGANIZATION","MANAGED_EVENT"].includes(item.entityType) ? <Link className="button button--dark" href={resourceEditHref(item)}>
                    {item.entityType === "MANAGED_EVENT" ? "Upraviť podujatie" : "Upraviť profil"}
                  </Link> : <span>Správa schválená · editor sa pripravuje</span>}
                  {item.publicHref ? <Link href={item.publicHref} target="_blank" rel="noopener noreferrer">Verejný záznam ↗</Link> : null}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="partner-dashboard-empty">
            <h3>Zatiaľ nemáte pridelený žiadny záznam</h3>
            <p>Keď schválime vašu žiadosť, profil alebo podujatie sa zobrazí tu.</p>
            <Link href="/partner/ziadosti">Skontrolovať moje žiadosti</Link>
          </div>
        )}
        {summary.events > 0 && <Link className="partner-dashboard-more" href="/partner/podujatia">Zobraziť všetky podujatia</Link>}
      </section>

      <div className="partner-dashboard-columns">
        <section className="partner-dashboard-section" aria-labelledby="partner-add-heading">
          <div className="partner-dashboard-section-heading">
            <div><span className="eyebrow">Nový záznam</span><h2 id="partner-add-heading">Čo chcete urobiť?</h2></div>
          </div>
          <div className="partner-dashboard-quick-actions">
            <Link href="/partner/profily/novy">
              <strong>Vytvoriť profil</strong>
              <span>Služba pre psov alebo organizácia na pomoc psom</span>
            </Link>
            <Link href="/partner/podujatia/nove">
              <strong>Pridať podujatie</strong>
              <span>Výstava, preteky, seminár či iné podujatie</span>
            </Link>
          </div>
          <div className="partner-dashboard-quick-actions"><Link href="/partner/pomoc/nova"><strong>Pridať pomoc psom</strong><span>Adopcia, stratené alebo nájdené psy, zbierky a ďalšia pomoc</span></Link></div>
          <div className="partner-dashboard-claim">
            <h3>Profil už na Psipedii existuje?</h3>
            <p>Vyhľadajte záznam podľa názvu alebo mesta a požiadajte o jeho správu.</p>
            <div className="partner-dashboard-claim-links">
              <Link href="/partner/prevziat">Vyhľadať a prevziať záznam</Link>
            </div>
          </div>
        </section>

        <section className="partner-dashboard-section" aria-labelledby="partner-requests-heading">
          <div className="partner-dashboard-section-heading">
            <div><span className="eyebrow">Stav vybavovania</span><h2 id="partner-requests-heading">Moje žiadosti</h2></div>
            <Link href="/partner/ziadosti">Zobraziť všetky</Link>
          </div>
          {summary.recentRequests.length > 0 ? (
            <ul className="partner-dashboard-requests">
              {summary.recentRequests.map((item) => (
                <li key={`${item.type}:${item.id}`}>
                  <div>
                    <span>{item.category}</span>
                    <strong>{item.title}</strong>
                  </div>
                  <span className={item.pending ? "partner-dashboard-request-status is-pending" : "partner-dashboard-request-status"}>{item.statusLabel}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="partner-dashboard-empty partner-dashboard-empty--compact">
              <h3>Zatiaľ nemáte žiadne žiadosti</h3>
              <p>Nové žiadosti o správu alebo vytvorenie profilu tu budete vidieť spolu s ich stavom.</p>
            </div>
          )}
        </section>
      </div>
      <p className="partner-dashboard-footer-note">
        Nastavenia účtu a možnosti propagácie nájdete v partnerskej navigácii.
      </p>
    </PartnerShell>
  );
}
