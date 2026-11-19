import Link from "next/link";
import { PartnerShell } from "@/components/partner-shell";
import { requirePartnerPageIdentity } from "@/lib/partner-page-auth";
import { listPartnerResources, partnerRoleHasPermission } from "@/lib/partner-platform";
import { partnerResourceStatusLabel, partnerRoleLabel } from "@/lib/partner-ui-labels";

export const dynamic = "force-dynamic";

export default async function Page() {
  const identity = await requirePartnerPageIdentity();
  const items = (await listPartnerResources(identity.accountId)).filter((item) => item.entityType !== "MANAGED_EVENT");
  return (
    <PartnerShell title="Moje profily" description="Profily, ktoré môžete spravovať cez Partner účet.">
      <section className="partner-new-profile-cta">
        <div><span className="eyebrow">Chýba váš profil?</span><h2>Pridať nový profil</h2><p>Ak profil už na Psipedii existuje, použite „Spravujete tento profil?“ namiesto vytvárania duplikátu.</p></div>
        <div className="partner-hero-actions"><Link className="button button--dark" href="/partner/profily/novy">Pridať nový profil</Link><Link className="button" href="/partner/prevziat">Požiadať o správu</Link></div>
      </section>
      {items.length ? (
        <div className="partner-resource-grid">
          {items.map((item) => (
            <article key={item.resourceId} className="partner-resource-card">
              <span>{item.entityType === "DIRECTORY_PROFILE" ? "Adresár" : item.entityType === "HELP_ORGANIZATION" ? "Organizácia" : item.entityType === "ADOPTION_DOG" ? "Adopcia" : item.entityType === "LOST_FOUND_DOG" ? "Stratený/nájdený pes" : "Pomoc psom"}</span>
              <h2>{item.name}</h2>
              <dl>
                <div><dt>Rola</dt><dd>{partnerRoleLabel(item.role)}</dd></div>
                <div><dt>Stav</dt><dd>{partnerResourceStatusLabel(item.status)}</dd></div>
                {(item.entityType === "DIRECTORY_PROFILE" || item.entityType === "HELP_ORGANIZATION") ? <div>
                  <dt>Overenie správcu</dt>
                  <dd>{item.verificationStatus === "UNVERIFIED" ? "Neoverené" : item.verificationStatus === "PENDING_VERIFICATION" ? "Čaká na overenie" : item.verificationStatus === "VERIFIED" ? "Overené" : "Overenie zamietnuté"}</dd>
                </div> : null}
              </dl>
              <div className="partner-request-links">
                {(item.entityType === "DIRECTORY_PROFILE" || item.entityType === "HELP_ORGANIZATION") && partnerRoleHasPermission(item.role, "PROFILE_SUBMIT_CHANGE") ? (
                  <Link className="button button--dark" href={`/partner/profily/${encodeURIComponent(item.resourceId)}/upravit`}>Upraviť údaje</Link>
                ) : null}
                {(item.entityType === "DIRECTORY_PROFILE" || item.entityType === "HELP_ORGANIZATION") && partnerRoleHasPermission(item.role, "COMMERCIAL_INTEREST_CREATE") ? <Link href={`/partner/propagacia?resource=${encodeURIComponent(item.resourceId)}`}>Možnosti propagácie</Link> : null}
                {item.publicHref ? <Link href={item.publicHref} target="_blank">Verejný profil ↗</Link> : null}
                {item.entityType !== "DIRECTORY_PROFILE" && item.entityType !== "HELP_ORGANIZATION" ? <span>Prístup schválený · editor pripravujeme</span> : null}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <section className="partner-empty">
          <h2>Žiadne priradené profily</h2>
          <p>Zatiaľ nemáte profil, ktorý môžete spravovať. <Link href="/partner/prevziat">Vyhľadať existujúci profil</Link>.</p>
        </section>
      )}
    </PartnerShell>
  );
}
