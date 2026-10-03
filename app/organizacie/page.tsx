import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowIcon, PawMark } from "@/components/icons";
import { Breadcrumbs } from "@/components/page-system";
import {
  PublicContentShell,
  PublicFoundation,
  PublicLandingSectionHeading,
  UnifiedSectionHero,
  UnifiedSectionHeroShell,
} from "@/components/public-visual-system";
import { StructuredData } from "@/components/structured-data";
import type { AdoptionD1Database } from "@/lib/adoption-store";
import { listPublishedOrganizationsForHub } from "@/lib/help-organization-store";
import { buildCollectionPageJsonLd } from "@/lib/listing-seo";
import { isCanonicalOrganizationSlug } from "@/lib/organization-sitemap";
import { getSectionHeroVisual } from "@/lib/section-visual-store";
import { buildPageMetadata } from "@/lib/seo";
import styles from "./organization-hub.module.css";

const organizationHubDescription =
  "Útulky, občianske združenia, záchranné a neziskové organizácie pomáhajúce psom na Slovensku.";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildPageMetadata({
  title: "Organizácie pomáhajúce psom",
  description: organizationHubDescription,
  path: "/organizacie",
});

type RuntimeBindings = { DB?: AdoptionD1Database };

function requireDatabase() {
  const database = (env as unknown as RuntimeBindings).DB;
  if (!database || typeof database.prepare !== "function") {
    throw new Error("Databáza organizácií zatiaľ nie je pripojená.");
  }
  return database;
}

function placeLabel(city: string, region: string) {
  return [city, region].map((value) => value.trim()).filter(Boolean).join(" · ");
}

export default async function OrganizationsHubPage() {
  const database = requireDatabase();
  const [publishedOrganizations, heroVisual] = await Promise.all([
    listPublishedOrganizationsForHub(database),
    getSectionHeroVisual("section.pomoc-psom"),
  ]);
  const organizations = publishedOrganizations.filter((organization) =>
    isCanonicalOrganizationSlug(organization.slug),
  );

  const schema = buildCollectionPageJsonLd({
    name: "Organizácie pomáhajúce psom",
    description: organizationHubDescription,
    path: "/organizacie",
    breadcrumbs: [
      { name: "Domov", path: "/" },
      { name: "Pomoc psom", path: "/pomoc-psom" },
      { name: "Organizácie", path: "/organizacie" },
    ],
    items: organizations.map((organization) => ({
      name: organization.name,
      path: `/organizacie/${organization.slug}`,
    })),
  });

  return (
    <>
      <StructuredData value={schema} />
      <main id="obsah" tabIndex={-1}>
        <PublicFoundation className={styles.foundation}>
          <UnifiedSectionHeroShell>
            <UnifiedSectionHero
              breadcrumbs={
                <Breadcrumbs label="Drobečková navigácia">
                  <Link href="/">Domov</Link>
                  <span>/</span>
                  <Link href="/pomoc-psom">Pomoc psom</Link>
                  <span>/</span>
                  <span>Organizácie</span>
                </Breadcrumbs>
              }
              eyebrow="Pomoc psom"
              title="Organizácie pomáhajúce psom"
              intro="Verejný prehľad publikovaných útulkov, združení a ďalších organizácií. Každá karta vedie na samostatný canonical profil organizácie."
              visual={heroVisual}
              metaSlot={
                <div className={styles.heroMeta}>
                  <span><strong>{organizations.length}</strong> publikovaných organizácií</span>
                </div>
              }
            />
          </UnifiedSectionHeroShell>

          <section className="page-body" aria-labelledby="organization-list-heading">
            <PublicContentShell variant="listing">
              <PublicLandingSectionHeading
                eyebrow="Adresár organizácií"
                title="Publikované organizácie"
                description="Profily organizácií sú samostatné verejné entity. Prípady pomoci, adopcie a zbierky zostávajú vo svojich vlastných sekciách."
                id="organization-list-heading"
              />

              {organizations.length ? (
                <div className={styles.grid} data-organization-hub-list>
                  {organizations.map((organization) => {
                    const href = `/organizacie/${organization.slug}`;
                    const location = placeLabel(organization.city, organization.region);
                    const excerpt = organization.shortDescription || organization.description;
                    return (
                      <article className={styles.card} key={organization.id} data-organization-hub-card>
                        <Link className={styles.media} href={href} aria-label={`Otvoriť profil organizácie ${organization.name}`}>
                          {organization.imageUrl ? (
                            <img src={organization.imageUrl} alt="" loading="lazy" decoding="async" />
                          ) : (
                            <span className={styles.mediaFallback} aria-hidden="true"><PawMark size={36} /></span>
                          )}
                        </Link>
                        <div className={styles.cardBody}>
                          <span className={styles.eyebrow}>Organizácia</span>
                          <h2><Link href={href}>{organization.name}</Link></h2>
                          {location ? <p className={styles.location}>{location}</p> : null}
                          {excerpt ? <p className={styles.excerpt}>{excerpt}</p> : null}
                          <Link className={styles.action} href={href}>
                            Zobraziť profil <ArrowIcon size={16} />
                          </Link>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className={styles.empty}>
                  <h2>Momentálne nie sú publikované žiadne organizácie.</h2>
                  <p>Ďalšie možnosti pomoci nájdete v sekcii Pomoc psom.</p>
                  <Link href="/pomoc-psom">Prejsť na Pomoc psom <ArrowIcon size={16} /></Link>
                </div>
              )}
            </PublicContentShell>
          </section>
        </PublicFoundation>
      </main>
    </>
  );
}
