import type { Metadata } from "next";
import Link from "next/link";
import { BreedBrowser } from "@/components/breed-browser";
import { ArrowIcon } from "@/components/icons";
import { breeds, fciGroups } from "@/lib/content";
import { getPortalSection, portalSubpageHref } from "@/lib/portal";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Atlas plemien psov",
  description: "Atlas plemien rozdelený podľa 10 medzinárodných skupín FCI: fotografie, povaha, energia, starostlivosť a vhodnosť do rodiny.",
  path: "/plemena",
});

export default function BreedsPage() {
  const portalSection = getPortalSection("plemena");
  return (
    <main id="obsah">
      <header className="page-hero shell">
        <div className="page-hero-inner">
          <span className="eyebrow">Atlas plemien</span>
          <h1>Nie najkrajší pes. Ten správny pre tvoj život.</h1>
          <p>Porovnaj povahu, energiu a potreby plemien skôr, než sa rozhodneš. Každý pes je jedinečný, no pôvodné vlohy stále zohrávajú veľkú úlohu.</p>
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
