import Link from "next/link";
import { PartnerShell } from "@/components/partner-shell";
import { PartnerClaimSearchForm } from "@/components/partner-claim-search-form";
import { requirePartnerPageIdentity } from "@/lib/partner-page-auth";
import { searchPartnerClaimableRecords } from "@/lib/partner-claim-search";
import {
  isPartnerClaimableResourceType,
  type PartnerClaimableResourceType,
} from "@/lib/partner-claims";

export const dynamic = "force-dynamic";

const typeChoices: Array<{ value: PartnerClaimableResourceType; label: string }> = [
  { value: "DIRECTORY_PROFILE", label: "Služby pre psov" },
  { value: "HELP_ORGANIZATION", label: "Organizácie – Pomoc psom" },
  { value: "MANAGED_EVENT", label: "Podujatia" },
  { value: "ADOPTION_DOG", label: "Adopcie" },
  { value: "LOST_FOUND_DOG", label: "Stratené a nájdené psy" },
  { value: "HELP_CASE", label: "Ostatná pomoc psom" },
];

type Search = { type?: string | string[]; q?: string | string[] };

export default async function PartnerFindExistingPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requirePartnerPageIdentity({ returnTo: "/partner/prevziat" });
  const raw = await searchParams;
  const type = typeof raw.type === "string" && isPartnerClaimableResourceType(raw.type) ? raw.type : "DIRECTORY_PROFILE";
  const q = typeof raw.q === "string" ? raw.q.trim().slice(0, 80) : "";
  const records = await searchPartnerClaimableRecords({ entityType: type, query: q });
  const searched = q.length >= 2;

  return <PartnerShell
    title="Požiadať o správu"
    description="Vyhľadajte už existujúci záznam na Psipedii. Po schválení žiadosti ho budete môcť spravovať vo svojom účte."
  >
    <section className="partner-requests-section partner-claim-discovery">
      <div className="partner-section-heading">
        <div><span className="eyebrow">Existujúci záznam</span><h2>Čo chcete spravovať?</h2></div>
      </div>
      <PartnerClaimSearchForm choices={typeChoices} initialType={type} initialQuery={q} />
      {!searched ? <p className="partner-claim-discovery-note">Začnite písať názov alebo mesto. Návrhy sa zobrazia priebežne, aj po prvom písmene.</p> : records.length ? (
        <div className="partner-claim-search-results" aria-live="polite">
          <p role="status">Nájdených: {records.length}{records.length === 15 ? " (zobrazujeme prvých 15)" : ""}</p>
          <ul>
            {records.map((item) => <li key={`${item.entityType}:${item.canonicalId}`}>
              <div><strong>{item.name}</strong><span>{item.details}</span></div>
              <div className="partner-claim-search-actions">
                <Link href={item.publicHref} target="_blank" rel="noopener noreferrer">Verejný záznam</Link>
                <Link href={item.claimHref} className="button button--dark">Požiadať o správu</Link>
              </div>
            </li>)}
          </ul>
        </div>
      ) : <div className="partner-empty">
        <h2>Nenašli sme zhodný záznam</h2>
        <p>Skúste kratší názov alebo iné mesto. Ak záznam na Psipedii ešte nie je, môžete ho vytvoriť.</p>
        <div className="partner-hero-actions">
          <Link href="/partner/profily/novy" className="button button--dark">Vytvoriť nový profil</Link>
          <Link href="/partner/podujatia/nove" className="button">Vytvoriť podujatie</Link>
        </div>
      </div>}
    </section>
    <p className="partner-claim-discovery-note">Jeden záznam môže mať len jedného schváleného externého správcu. Posúdenie žiadosti samo osebe nemení verejné údaje.</p>
  </PartnerShell>;
}
