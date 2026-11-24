import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/page-system";
import {
  PublicActionLink,
  PublicContentShell,
  PublicFoundation,
  UnifiedSectionHero,
  UnifiedSectionHeroShell,
} from "@/components/public-visual-system";
import { StructuredData } from "@/components/structured-data";
import {
  PublicHelpPhotoBanner,
  lostFoundSubmitPromo,
} from "@/components/public-visual-system/public-help-banner";
import { listPublicDogReports } from "@/lib/lost-found-dog-store";
import { activeDogReportCountNoun } from "@/lib/lost-found-dogs";
import { buildCollectionPageJsonLd } from "@/lib/listing-seo";
import { buildPageMetadata } from "@/lib/seo";
import { getSectionHeroVisual } from "@/lib/section-visual-store";
import styles from "@/components/lost-found-dogs.module.css";

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
              breadcrumbs={
                <Breadcrumbs>
                  <Link href="/">Domov</Link>
                  <span>/</span>
                  <Link href="/pomoc-psom">Pomoc psom</Link>
                  <span>/</span>
                  <span>Stratené a nájdené psy</span>
                </Breadcrumbs>
              }
              eyebrow="Pomoc psom"
              title="Stratené a nájdené psy"
              intro="Vyberte správny prehľad podľa toho, či psa hľadáte alebo ste ho našli."
              visual={heroVisual}
              hideQuickLinks
            />
          </UnifiedSectionHeroShell>

          <PublicContentShell variant="listing">
            <div className={styles.hubChoices}>
              <section className={styles.hubChoice}>
                <h2>Stratené psy</h2>
                <p>
                  {lost.total} {activeDogReportCountNoun(lost.total)}
                </p>
                <PublicActionLink href="/pomoc-psom/stratene-psy" variant="secondary">
                  Zobraziť stratené psy
                </PublicActionLink>
              </section>
              <section className={styles.hubChoice}>
                <h2>Nájdené psy</h2>
                <p>
                  {found.total} {activeDogReportCountNoun(found.total)}
                </p>
                <PublicActionLink href="/pomoc-psom/najdene-psy" variant="secondary">
                  Zobraziť nájdené psy
                </PublicActionLink>
              </section>
            </div>
          </PublicContentShell>
          <PublicHelpPhotoBanner promo={lostFoundSubmitPromo} />
        </PublicFoundation>
      </main>
    </>
  );
}
