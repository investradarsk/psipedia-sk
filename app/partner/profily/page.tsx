import Link from "next/link";
import { PartnerShell } from "@/components/partner-shell";
import { requirePartnerPageIdentity } from "@/lib/partner-page-auth";
import { listPartnerResources, partnerRoleHasPermission } from "@/lib/partner-platform";

export const dynamic = "force-dynamic";

export default async function Page() {
  const identity = await requirePartnerPageIdentity();
  const items = (await listPartnerResources(identity.accountId)).filter((item) => item.entityType !== "MANAGED_EVENT");
  return (
    <PartnerShell title="Moje profily" description="Profily, ku ktorým máte aktívne Partner členstvo.">
      <section className="partner-new-profile-cta">
        <div><span className="eyebrow">Chýba váš profil?</span><h2>Pridať nový profil</h2><p>Ak profil už na Psipedii existuje, použite „Spravujete tento profil?“ namiesto vytvárania duplikátu.</p></div>
        <Link className="button button--dark" href="/partner/profily/novy">Pridať nový profil</Link>
      </section>
      {items.length ? (
        <div className="partner-resource-grid">
          {items.map((item) => (
            <article key={item.resourceId} className="partner-resource-card">
              <span>{item.entityType === "DIRECTORY_PROFILE" ? "Adresár" : "Organizácia"}</span>
              <h2>{item.name}</h2>
              <dl>
                <div><dt>Rola</dt><dd>{item.role}</dd></div>
                <div><dt>Stav</dt><dd>{item.status}</dd></div>
                <div>
                  <dt>Overenie správcu</dt>
                  <dd>{item.verificationStatus === "UNVERIFIED" ? "Neoverené" : item.verificationStatus === "PENDING_VERIFICATION" ? "Čaká na overenie" : item.verificationStatus === "VERIFIED" ? "Overené" : "Overenie zamietnuté"}</dd>
                </div>
              </dl>
              <div className="partner-request-links">
                {partnerRoleHasPermission(item.role, "PROFILE_SUBMIT_CHANGE") ? (
                  <Link className="button button--dark" href={`/partner/profily/${encodeURIComponent(item.resourceId)}/upravit`}>Upraviť údaje</Link>
                ) : null}
                {partnerRoleHasPermission(item.role, "COMMERCIAL_INTEREST_CREATE") ? <Link href={`/partner/propagacia?resource=${encodeURIComponent(item.resourceId)}`}>Možnosti propagácie</Link> : null}\n                {item.publicHref ? <Link href={item.publicHref} target="_blank">Verejný profil ↗</Link> : null}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <section className="partner-empty">
          <h2>Žiadne priradené profily</h2>
          <p>Nemáte aktívne členstvo k žiadnemu profilu. Profil môžete prevziať cez odkaz „Spravujete tento profil?“ na jeho verejnej stránke.</p>
        </section>
      )}
    </PartnerShell>
  );
}
