import type { Metadata } from "next";
import Link from "next/link";
import { BreedBrowser } from "@/components/breed-browser";
import { HomePortalSearch } from "@/components/home-portal-search";
import { ArrowIcon } from "@/components/icons";
import { PublicMagazineBanner } from "@/components/public-visual-system/public-magazine-banner";
import { BREED_CLUBS_BANNER_ANCHOR, HERO_BREEDS_ANCHOR } from "@/lib/visual-library-anchors";
import { getPublishedDesktopBannerColors } from "@/lib/visual-library-edit-store";
import { Breadcrumbs } from "@/components/page-system";
import {
  PublicContentShell,
  PublicFoundation,
  UnifiedSectionHero,
  UnifiedSectionHeroShell,
} from "@/components/public-visual-system";
import { StructuredData } from "@/components/structured-data";
import { fciGroups } from "@/lib/content";
import { breedAtlasHref, parseBreedAtlasFilters } from "@/lib/breed-atlas";
import { portalSections } from "@/lib/portal";
import { listPublishedCanonicalBreedAtlasCards } from "@/lib/breed-store";
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
  const [portalSection, breeds, heroVisual, breedClubBannerColors] = await Promise.all([
    getManagedPortalSection("plemena"),
    listPublishedCanonicalBreedAtlasCards(),
    getSectionHeroVisual("section.plemena"),
    getPublishedDesktopBannerColors("plemena:kluby"),
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
          <UnifiedSectionHeroShell id={HERO_BREEDS_ANCHOR}>
            <UnifiedSectionHero
              breadcrumbs={<Breadcrumbs><Link href="/">Domov</Link><span>/</span><span>Plemená</span></Breadcrumbs>}
              eyebrow={breedSection?.eyebrow ?? "Atlas plemien"}
              title={breedSection?.label ?? "Plemená"}
              intro="Nájdi plemeno podľa názvu, pôvodu, FCI skupiny alebo sekcie."
              visual={heroVisual}
              portalSearchSlot={
                <HomePortalSearch
                  action="/plemena"
                  id="breed-hero-search"
                  label="Hľadať plemeno"
                  panelLabel="Vyhľadávanie plemien"
                  eyebrow="AKÉ PLEMENO HĽADÁŠ?"
                  title="Objav plemená podľa svojich potrieb"
                  placeholder="Hľadať plemeno, krajinu alebo FCI skupinu"
                  buttonLabel="Hľadať"
                  defaultValue={initialFilters.query}
                  allowEmpty
                  hidden={[
                    ...(initialFilters.fciGroup ? [{ name: "fciGroup", value: initialFilters.fciGroup }] : []),
                    ...(initialFilters.fciSection ? [{ name: "fciSection", value: initialFilters.fciSection }] : []),
                    ...(initialFilters.origin ? [{ name: "origin", value: initialFilters.origin }] : []),
                  ]}
                  shortcuts={[]}
                  searchScope="breeds"
                />
              }
            />
          </UnifiedSectionHeroShell>
          <section className="page-body">
            <PublicContentShell variant="listing">
            <BreedBrowser key={breedAtlasHref(initialFilters)} breeds={breeds} groups={fciGroups} initialFilters={initialFilters} hidePrimarySearch actions={breedSection ? (
              <section className={styles.atlasActions} aria-label="Porovnanie plemien a kluby" data-breed-primary-actions>
                <Link href="/porovnat-plemena" className={styles.compareAction}>
                  Porovnať plemená <ArrowIcon size={17} />
                </Link>
                <PublicMagazineBanner
                  desktopColors={breedClubBannerColors}
                  anchorId={BREED_CLUBS_BANNER_ANCHOR}
                  eyebrow="Kluby plemien"
                  title="Nájdi klub svojho plemena"
                  description="Zisti, ktoré kluby zastrešujú jednotlivé plemená a kde ich môžeš kontaktovať."
                  label="Zobraziť kluby plemien"
                  href="/adresar/chovatelske-kluby"
                  testId="breed-clubs"
                  photoTone="volunteer"
                />
              </section>
            ) : null} />
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
