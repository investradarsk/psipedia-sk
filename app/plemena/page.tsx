import type { Metadata } from "next";
import Link from "next/link";
import { BreedBrowser } from "@/components/breed-browser";
import { BreedCrawlIndex } from "@/components/breed-crawl-index";
import { ArrowIcon } from "@/components/icons";
import { Breadcrumbs } from "@/components/page-system";
import {
  PublicContentShell,
  PublicFoundation,
  PublicLandingSectionHeading,
  UnifiedSectionHero,
  UnifiedSectionHeroShell,
} from "@/components/public-visual-system";
import { StructuredData } from "@/components/structured-data";
import { fciGroups } from "@/lib/content";
import { parseBreedAtlasFilters } from "@/lib/breed-atlas";
import { portalSections, portalSubpageHref } from "@/lib/portal";
import { listPublishedCanonicalBreedIndex } from "@/lib/breed-store";
import { getManagedPortalSection } from "@/lib/section-store";
import { getSectionHeroVisual } from "@/lib/section-visual-store";
import { buildCollectionPageJsonLd, buildListingPageMetadata, coreLandingSeoFallback, resolveListingIndexPolicy } from "@/lib/listing-seo";
import styles from "./breed-atlas.module.css";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const landingSeo = coreLandingSeoFallback("breeds");
  return buildListingPageMetadata({
    title: landingSeo.title,
    description: landingSeo.description,
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
  const breedSection = portalSection ?? portalSections.find((section) => section.slug === "plemena") ?? null;
  const initialFilters = parseBreedAtlasFilters(rawSearchParams);
  const policy = resolveListingIndexPolicy("/plemena", rawSearchParams);
  const schema = policy.kind === "clean" ? buildCollectionPageJsonLd({
    name: breedSection?.label ?? "Plemená",
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
              eyebrow={breedSection?.eyebrow ?? "Atlas plemien"}
              title={breedSection?.label ?? "Plemená"}
              intro="Nájdi plemeno podľa názvu, pôvodu, FCI skupiny alebo sekcie."
              visual={heroVisual}
            />
          </UnifiedSectionHeroShell>
          {breedSection ? (
            <section aria-labelledby="breed-actions-heading" data-breed-primary-actions>
              <PublicContentShell variant="landing">
                <PublicLandingSectionHeading
                  eyebrow="Plemená podľa cieľa"
                  title="Čo chceš urobiť?"
                  description="Atlas zostáva hlavný pracovný nástroj nižšie. Tu si vyber inú cestu, ak chceš plemeno nájsť podľa potrieb, porovnať alebo otvoriť kluby."
                  id="breed-actions-heading"
                />
                <nav aria-label="Hlavné možnosti v sekcii Plemená" className={styles.quickActions}>
                  {breedSection.subpages
                    .filter((subpage) => subpage.slug !== "atlas")
                    .map((subpage) => (
                      <Link key={subpage.slug} href={portalSubpageHref(breedSection, subpage)} className={styles.quickAction}>
                        <strong>{subpage.label}</strong>
                        <span aria-hidden="true">→</span>
                      </Link>
                    ))}
                </nav>
              </PublicContentShell>
            </section>
          ) : null}
          <section className="page-body">
            <PublicContentShell variant="listing">
            <BreedBrowser breeds={breeds} groups={fciGroups} initialFilters={initialFilters} />
            {policy.kind === "clean" && <BreedCrawlIndex breeds={breeds} groups={fciGroups} />}
            <div className="breed-atlas-footer">
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
