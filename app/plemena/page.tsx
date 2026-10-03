import type { Metadata } from "next";
import Link from "next/link";
import { BreedBrowser } from "@/components/breed-browser";
import { ArrowIcon } from "@/components/icons";
import { Breadcrumbs } from "@/components/page-system";
import {
  PublicActionLink,
  PublicContentShell,
  PublicFoundation,
  UnifiedSectionHero,
  UnifiedSectionHeroShell,
} from "@/components/public-visual-system";
import { SectionHeroSearch } from "@/components/section-hero-search";
import { StructuredData } from "@/components/structured-data";
import { fciGroups } from "@/lib/content";
import { parseBreedAtlasFilters } from "@/lib/breed-atlas";
import { portalSubpageHref } from "@/lib/portal";
import { listPublishedCanonicalBreedIndex } from "@/lib/breed-store";
import { getManagedPortalSection } from "@/lib/section-store";
import { getSectionHeroVisual } from "@/lib/section-visual-store";
import { buildCollectionPageJsonLd, buildListingPageMetadata, resolveListingIndexPolicy } from "@/lib/listing-seo";
import styles from "./breed-atlas.module.css";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const section = await getManagedPortalSection("plemena");
  return buildListingPageMetadata({
    title: section?.label ?? "Atlas plemien psov",
    description: section?.description ?? "Atlas plemien rozdelený podľa 10 medzinárodných skupín FCI: fotografie, povaha, starostlivosť a vhodnosť do rodiny.",
    path: "/plemena",
    searchParams: await searchParams,
  });
}

export const dynamic = "force-dynamic";

export default async function BreedsPage({ searchParams }: Props) {
  const [portalSection, breeds, heroVisual] = await Promise.all([
    getManagedPortalSection("plemena"),
    listPublishedCanonicalBreedIndex(),
    getSectionHeroVisual("section.plemena"),
  ]);
  const rawSearchParams = await searchParams;
  const initialFilters = parseBreedAtlasFilters(rawSearchParams);
  const policy = resolveListingIndexPolicy("/plemena", rawSearchParams);
  const schema = policy.kind === "clean" ? buildCollectionPageJsonLd({
    name: portalSection?.label ?? "Plemená",
    description: portalSection?.description ?? "Atlas plemien rozdelený podľa 10 medzinárodných skupín FCI: fotografie, povaha, starostlivosť a vhodnosť do rodiny.",
    path: "/plemena",
    breadcrumbs: [
      { name: "Domov", path: "/" },
      { name: "Plemená", path: "/plemena" },
    ],
    items: breeds.map((breed) => ({ name: breed.name, path: `/plemena/${breed.slug}` })),
  }) : null;
  return (
    <>
      {schema && <StructuredData value={schema} />}
      <main id="obsah">
        <PublicFoundation className={styles.foundation}>
          <UnifiedSectionHeroShell>
            <UnifiedSectionHero
              breadcrumbs={<Breadcrumbs><Link href="/">Domov</Link><span>/</span><span>Plemená</span></Breadcrumbs>}
              eyebrow={portalSection?.eyebrow ?? "Atlas plemien"}
              title={portalSection?.label ?? "Plemená"}
              intro="Nájdite plemeno podľa názvu, pôvodu, FCI skupiny alebo sekcie."
              visual={heroVisual}
              searchSlot={
                <SectionHeroSearch
                  action="/plemena"
                  id="breed-hero-query"
                  label="Hľadať plemeno"
                  placeholder="Hľadať plemeno…"
                  defaultValue={initialFilters.query}
                />
              }
              ctaSlot={
                <PublicActionLink href="/porovnat-plemena" icon={<ArrowIcon size={16} />}>
                  Porovnať plemená
                </PublicActionLink>
              }
            />
          </UnifiedSectionHeroShell>
          <section className="page-body">
            <PublicContentShell variant="listing">
            <BreedBrowser breeds={breeds} groups={fciGroups} initialFilters={initialFilters} />
            <div className="breed-atlas-footer">
              <nav className="breed-utility-links" aria-label="Ďalšie možnosti v sekcii Plemená">
                {portalSection?.subpages.filter((subpage) => subpage.slug !== "atlas" && subpage.slug !== "porovnanie").map((subpage) => (
                  <Link href={portalSubpageHref(portalSection, subpage)} key={subpage.slug}>{subpage.label} <ArrowIcon size={17} /></Link>
                ))}
              </nav>
            <aside className="fci-source-note">
              <strong>Čo znamená FCI skupina?</strong>
              <p>Medzinárodná kynologická federácia zaraďuje uznané plemená do 10 skupín podľa pôvodu a pracovného využitia. V atlase používame toto oficiálne členenie; obrazové portréty sú ilustračné.</p>
              <a href="https://www.fci.be/nomenclature/" target="_blank" rel="noreferrer">Oficiálna nomenklatúra FCI <ArrowIcon size={17} /></a>
            </aside>
            </div>
            </PublicContentShell>
          </section>
        </PublicFoundation>
      </main>
    </>
  );
}
