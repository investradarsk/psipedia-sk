import type { Metadata } from "next";
import Link from "next/link";
import { BreedBrowser } from "@/components/breed-browser";
import { ArrowIcon } from "@/components/icons";
import { fciGroups } from "@/lib/content";
import { portalSubpageHref } from "@/lib/portal";
import { listPublishedBreedIndex } from "@/lib/breed-store";
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
  const [portalSection, breeds] = await Promise.all([getManagedPortalSection("plemena"), listPublishedBreedIndex()]);
  return (
    <main id="obsah">
      <header className="page-hero page-hero--breed-atlas shell">
        <div className="page-hero-inner">
          <span className="eyebrow">{portalSection?.eyebrow ?? "Atlas plemien"}</span>
          <h1>{portalSection?.label ?? "Plemená"}</h1>
          <p>Nájdite plemeno podľa názvu, pôvodu alebo jednej z 10 skupín FCI.</p>
        </div>
      </header>
      <section className="page-body shell">
        <BreedBrowser breeds={breeds} groups={fciGroups} />
        <div className="breed-atlas-footer">
          <nav className="breed-utility-links" aria-label="Ďalšie možnosti v sekcii Plemená">
            <Link href="/porovnat-plemena">Porovnať plemená <ArrowIcon size={17} /></Link>
            {portalSection?.subpages.filter((subpage) => subpage.slug !== "atlas").map((subpage) => (
              <Link href={portalSubpageHref(portalSection, subpage)} key={subpage.slug}>{subpage.label} <ArrowIcon size={17} /></Link>
            ))}
          </nav>
        <aside className="fci-source-note">
          <strong>Čo znamená FCI skupina?</strong>
          <p>Medzinárodná kynologická federácia zaraďuje uznané plemená do 10 skupín podľa pôvodu a pracovného využitia. V atlase používame toto oficiálne členenie; obrazové portréty sú ilustračné.</p>
          <a href="https://www.fci.be/nomenclature/" target="_blank" rel="noreferrer">Oficiálna nomenklatúra FCI <ArrowIcon size={17} /></a>
        </aside>
        </div>
      </section>
    </main>
  );
}
