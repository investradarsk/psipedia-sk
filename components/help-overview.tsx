import { PublicHelpProfileCard } from "@/components/public-visual-system/public-help-profile-card";
import { PublicMediaFallback } from "@/components/public-visual-system/public-media-fallback";
import { PublicHelpCategoryNav } from "@/components/public-visual-system/public-help-category-nav";
import Link from "next/link";
import {
  PublicHelpClosingBanner,
  PublicHelpPhotoBanner,
  lostFoundSubmitPromo,
  type PublicHelpPhotoBannerData,
} from "@/components/public-visual-system/public-help-banner";
import { ImageDisplay } from "@/components/image-display";
import { helpOverviewPromos } from "@/lib/help-banner-presets";
import { HELP_LOST_FOUND_BANNER_ANCHOR, helpOverviewBannerAnchor } from "@/lib/visual-library-anchors";
import type { ImageDisplayConfig } from "@/lib/image-display";
import { ArrowIcon } from "@/components/icons";
import { Breadcrumbs, PageContainer } from "@/components/page-system";
import {
  PublicActionLink,
  PublicContentShell,
  PublicFoundation,
  PublicLandingSectionHeading,
  UnifiedSectionHero,
  UnifiedSectionHeroShell,
} from "@/components/public-visual-system";
import { HomePortalSearch } from "@/components/home-portal-search";
import type { HelpCategorySlug } from "@/lib/help";
import { getSectionHeroVisual } from "@/lib/section-visual-store";
import { getPublishedDesktopBannerColorsBatch } from "@/lib/visual-library-edit-store";
import type { BannerDraft } from "@/lib/visual-library-drafts";
import styles from "./help-public.module.css";

export type HelpOverviewItem = {
  id: string;
  href: string;
  title: string;
  imageUrl: string | null;
  thumbnailImageDisplay?: ImageDisplayConfig | null;
  eyebrow: string;
  meta: string;
  excerpt: string;
  badge?: string | null;
  urgent?: boolean;
};

export type HelpOverviewSection = {
  slug: HelpCategorySlug;
  label: string;
  description: string;
  href: string;
  count: number;
  items: HelpOverviewItem[];
};

type PromoBanner = PublicHelpPhotoBannerData;


function OverviewCard({ item }: { item: HelpOverviewItem }) {
  return (
    <PublicHelpProfileCard
      data-help-overview-card
      href={item.href}
      title={item.title}
      category={item.eyebrow}
      meta={item.meta}
      badge={item.badge
        ? <span className={[styles.overviewBadge, item.urgent ? styles.overviewBadgeUrgent : ""].filter(Boolean).join(" ")}>{item.badge}</span>
        : null}
      media={<Link href={item.href} aria-label={`Otvoriť: ${item.title}`}>
        {item.imageUrl ? (
          <ImageDisplay
            roleHint="generic"
            context="thumbnail"
            fallbackOnError
            config={item.thumbnailImageDisplay}
            src={item.imageUrl}
            alt=""
            loading="lazy"
            decoding="async"
          />
        ) : (
          <PublicMediaFallback
            appearance="context"
            className={styles.overviewMediaFallback}
            iconSize={34}
            decorative
          />
        )}
      </Link>}
    />
  );
}

function Promo({ promo, anchorId, published }: { promo: PromoBanner; anchorId: string; published?: BannerDraft | null }) {
  return <PublicHelpPhotoBanner promo={promo} anchorId={anchorId} desktopColors={published} desktopCopy={published} />;
}

export async function HelpOverview({
  sections,
}: {
  sections: HelpOverviewSection[];
  totalActive: number;
}) {
  // Each individually anchored Help banner has a separate publication.
  // Fetch the section HERO and all banner colors concurrently on a cold SSR.
  const helpBannerIds = ["help:lost-found", "help:overview:0", "help:overview:2", "help:overview:4", "help:closing"] as const;
  const [heroVisual, publishedHelp]: [
    Awaited<ReturnType<typeof getSectionHeroVisual>>,
    Record<string, BannerDraft | null>,
  ] = await Promise.all([
    getSectionHeroVisual("section.pomoc-psom"),
    getPublishedDesktopBannerColorsBatch(helpBannerIds),
  ]);
  return (
    <main id="obsah" tabIndex={-1}>
      <PublicFoundation className={styles.foundation}>
        <UnifiedSectionHeroShell>
          <UnifiedSectionHero
            breadcrumbs={
              <Breadcrumbs label="Drobečková navigácia">
                <Link href="/">Domov</Link>
                <span>/</span>
                <span>Pomoc psom</span>
              </Breadcrumbs>
            }
            eyebrow="Praktická pomoc"
            title="Pomoc psom"
            intro="Adopcie, útulky, dočasná opatera, zbierky a stratené psy. Vyberte si kategóriu alebo hľadajte priamo."
            visual={heroVisual}
            portalSearchSlot={
              <HomePortalSearch
                action="/hladat"
                id="help-root-hero-query"
                label="Hľadať v Pomoci psom"
                panelLabel="Vyhľadávanie Pomoci psom"
                eyebrow="ČO POTREBUJEŠ VYRIEŠIŤ?"
                title="Nájdi pomoc pre psa"
                placeholder="Hľadať psa, organizáciu alebo mesto…"
                buttonLabel="Hľadať"
                allowEmpty
                hidden={[{ name: "sekcia", value: "pomoc-psom" }]}
                shortcuts={[]}
                searchScope="help"
              />
            }
          />
        </UnifiedSectionHeroShell>

        <section className={styles.overviewCategoryBlock} aria-labelledby="help-categories-heading">
          <PublicContentShell variant="landing">
            <PublicLandingSectionHeading
              eyebrow="Kategórie pomoci"
              title="Vyberte, čo chcete riešiť"
              description="Vyberte typ pomoci a prejdite na úplný prehľad."
              id="help-categories-heading"
            />

            <PublicHelpCategoryNav items={sections.map((section) => ({
              slug: section.slug,
              label: section.label,
              count: section.count,
              href: section.href,
            }))} />
          </PublicContentShell>
        </section>

        <Promo promo={lostFoundSubmitPromo} anchorId={HELP_LOST_FOUND_BANNER_ANCHOR} published={publishedHelp["help:lost-found"]} />

        <div className={styles.overviewFlow}>
          {sections.map((section, index) => {
            const promo = helpOverviewPromos[index];
            return (
              <div key={section.slug}>
                <section
                  className={styles.overviewSection}
                  aria-labelledby={`help-overview-${section.slug}`}
                  data-help-overview-section={section.slug}
                >
                  <PageContainer className={styles.overviewSectionInner}>
                    <PublicLandingSectionHeading
                      eyebrow="Pomoc psom"
                      title={section.label}
                      description={section.description}
                      id={`help-overview-${section.slug}`}
                    />

                    {section.items.length ? (
                      <div className={styles.overviewGrid}>
                        {section.items.slice(0, 5).map((item) => (
                          <OverviewCard item={item} key={item.id} />
                        ))}
                      </div>
                    ) : (
                      <div className={styles.overviewEmpty}>
                        <p>Ďalšie prípady a organizácie nájdeš v prehľade kategórie.</p>
                        <Link href={section.href}>
                          Otvoriť kategóriu <ArrowIcon size={15} />
                        </Link>
                      </div>
                    )}
                    {section.slug === "utulky" ? (
                      <div className={styles.overviewSectionFooter}>
                        <PublicActionLink href="/organizacie" variant="tertiary" icon={<ArrowIcon size={16} />}>
                          Všetky organizácie
                        </PublicActionLink>
                      </div>
                    ) : null}
                    {section.items.length > 0 && (
                      <div className={styles.overviewSectionFooter}>
                        <PublicActionLink href={section.href} variant="tertiary" icon={<ArrowIcon size={16} />}>
                          Zobraziť všetky
                        </PublicActionLink>
                      </div>
                    )}
                  </PageContainer>
                </section>
                {promo ? <Promo promo={promo} anchorId={helpOverviewBannerAnchor(index)} published={publishedHelp[`help:overview:${index}`]} /> : null}
              </div>
            );
          })}
        </div>

        <PublicHelpClosingBanner desktopColors={publishedHelp["help:closing"]} desktopCopy={publishedHelp["help:closing"]} />
      </PublicFoundation>
    </main>
  );
}
