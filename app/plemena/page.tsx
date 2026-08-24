import type { Metadata } from "next";
import Link from "next/link";
import { BreedBrowser } from "@/components/breed-browser";
import { ArrowIcon } from "@/components/icons";
import { fciGroups } from "@/lib/content";
import { portalSubpageHref } from "@/lib/portal";
import { listPublishedBreeds } from "@/lib/breed-store";
import { getManagedPortalSection } from "@/lib/section-store";
import { buildPageMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const section = await getManagedPortalSection("plemena");
  return buildPageMetadata({
    title: section?.label ?? "Atlas plemien psov",
    description: section?.description ?? "Atlas plemien rozdelený podľa 10 medzinárodných skupín FCI: fotografie, povaha, energia, starostlivosť a vhodnosť do rodiny.",
    path: "/plemena",
  });
}

export const dynamic = "force-dynamic";

export default async function BreedsPage() {
  const [portalSection, breeds] = await Promise.all([getManagedPortalSection("plemena"), listPublishedBreeds()]);
  return (
    <main id="obsah">
      <header className="page-hero shell">
        <div className="page-hero-inner">
          <span className="eyebrow">{portalSection?.eyebrow ?? "Atlas plemien"}</span>
          <h1>{portalSection?.label ?? "Plemená"}</h1>
          <p>{portalSection?.intro || portalSection?.description || "Porovnaj povahu, energiu a potreby plemien skôr, než sa rozhodneš."}</p>
          <Link href="/porovnat-plemena" className="button button--dark page-hero-button">Porovnať dve plemená <ArrowIcon /></Link>
        </div>
      </header>
      <section className="page-body shell">
        {portalSection && (
          <div className="portal-subpage-grid breed-portal-links" aria-label="Možnosti v sekcii Plemená">
            {portalSection.subpages.filter((subpage) => subpage.slug !== "atlas").map((subpage, index) => (
              <Link href={portalSubpageHref(portalSection, subpage)} className="portal-subpage-card" key={subpage.slug}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div><h3>{subpage.label}</h3><p>{subpage.description}</p></div>
                <ArrowIcon size={20} />
              </Link>
            ))}
          </div>
        )}
        <aside className="fci-source-note">
          <strong>Čo znamená FCI skupina?</strong>
          <p>Medzinárodná kynologická federácia zaraďuje uznané plemená do 10 skupín podľa pôvodu a pracovného využitia. V atlase používame toto oficiálne členenie; obrazové portréty sú ilustračné.</p>
          <a href="https://www.fci.be/nomenclature/" target="_blank" rel="noreferrer">Oficiálna nomenklatúra FCI <ArrowIcon size={17} /></a>
        </aside>
        <BreedBrowser breeds={breeds} groups={fciGroups} />
      </section>
    </main>
  );
}
