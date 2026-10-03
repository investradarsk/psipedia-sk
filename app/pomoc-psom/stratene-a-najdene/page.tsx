import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/page-system";
import { PublicContentShell, PublicFoundation, UnifiedSectionHero, UnifiedSectionHeroShell } from "@/components/public-visual-system";
import { StructuredData } from "@/components/structured-data";
import { listPublicDogReports } from "@/lib/lost-found-dog-store";
import { buildCollectionPageJsonLd } from "@/lib/listing-seo";
import { buildPageMetadata } from "@/lib/seo";
import { getSectionHeroVisual } from "@/lib/section-visual-store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildPageMetadata({
  title: "Stratené a nájdené psy",
  description: "Prehľad hlásení o stratených a nájdených psoch na Slovensku.",
  path: "/pomoc-psom/stratene-a-najdene",
});

export default async function LostFoundHubPage() {
  const [lost, found, sharedHeroVisual] = await Promise.all([
    listPublicDogReports("LOST", { page: 1, pageSize: 1 }),
    listPublicDogReports("FOUND", { page: 1, pageSize: 1 }),
    getSectionHeroVisual("help.stratene-a-najdene"),
  ]);
  const heroVisual = {
    ...sharedHeroVisual,
    heroContent: sharedHeroVisual.heroContent
      ? { config: sharedHeroVisual.heroContent.config }
      : undefined,
  };

  const schema = buildCollectionPageJsonLd({
    name: "Stratené a nájdené psy",
    description: "Prehľad hlásení o stratených a nájdených psoch na Slovensku.",
    path: "/pomoc-psom/stratene-a-najdene",
    breadcrumbs: [
      { name: "Domov", path: "/" },
      { name: "Pomoc psom", path: "/pomoc-psom" },
      { name: "Stratené a nájdené psy", path: "/pomoc-psom/stratene-a-najdene" },
    ],
    items: [
      { name: "Stratené psy", path: "/pomoc-psom/stratene-psy" },
      { name: "Nájdené psy", path: "/pomoc-psom/najdene-psy" },
    ],
  });

  return (
    <>
      <StructuredData value={schema} />
      <main id="obsah">
        <PublicFoundation>
          <UnifiedSectionHeroShell>
            <UnifiedSectionHero
              breadcrumbs={<Breadcrumbs>
                <Link href="/">Domov</Link><span>/</span><Link href="/pomoc-psom">Pomoc psom</Link><span>/</span><span>Stratené a nájdené psy</span>
              </Breadcrumbs>}
              eyebrow="Pomoc psom"
              title="Stratené a nájdené psy"
              intro="Vyberte správny prehľad podľa toho, či psa hľadáte alebo ste ho našli."
              visual={heroVisual}
              metaSlot={<span><strong>{lost.total + found.total}</strong> aktívnych hlásení</span>}
            />
          </UnifiedSectionHeroShell>

          <PublicContentShell variant="listing" className="page-body">
            <div className="article-grid">
              <article className="article-card article-card--large article-card--coral">
                <div className="article-card-body">
                  <span className="eyebrow">Aktuálne hlásenia</span>
                  <h2>Stratené psy</h2>
                  <p>{lost.total === 1 ? "1 aktívne hlásenie" : `${lost.total} aktívnych hlásení`} o psoch, ktorých majitelia hľadajú.</p>
                  <Link className="button button--dark" href="/pomoc-psom/stratene-psy">Zobraziť stratené psy</Link>
                </div>
              </article>

              <article className="article-card article-card--large article-card--forest">
                <div className="article-card-body">
                  <span className="eyebrow">Aktuálne hlásenia</span>
                  <h2>Nájdené psy</h2>
                  <p>{found.total === 1 ? "1 aktívne hlásenie" : `${found.total} aktívnych hlásení`} o nájdených psoch, pri ktorých sa hľadá majiteľ.</p>
                  <Link className="button button--dark" href="/pomoc-psom/najdene-psy">Zobraziť nájdené psy</Link>
                </div>
              </article>
            </div>

            <p><Link href="/pomoc-psom">← Späť na Pomoc psom</Link></p>
          </PublicContentShell>
        </PublicFoundation>
      </main>
    </>
  );
}
