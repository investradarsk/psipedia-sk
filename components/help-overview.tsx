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
import type { ImageDisplayConfig } from "@/lib/image-display";
import { ShieldCheckIcon } from "@/components/help-public-icons";
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


const promos: Record<number, PromoBanner> = {
  0: {
    eyebrow: "Praktické rady",
    title: "Dobrý nový domov začína prípravou",
    text: "Starostlivosť, zdravie, prvé dni aj každodenné fungovanie so psom nájdete v našich praktických témach.",
    href: "/starostlivost",
    action: "Prejsť na starostlivosť",
    tone: "care",
  },
  2: {
    eyebrow: "Rýchla pomoc",
    title: "Našli ste psa v núdzi?",
    text: "Pozrite si jednoduchý postup: čo urobiť na mieste, koho kontaktovať a ktoré informácie si hneď zaznamenať.",
    href: "/pomoc-psom/nahlasit-psa-v-nudzi",
    action: "Postup krok za krokom",
    tone: "rescue",
  },
  4: {
    eyebrow: "Zapojte sa",
    title: "Pomoc nemusí byť iba finančná",
    text: "Venčenie, prevoz, dočasná opatera, fotografovanie alebo zdieľanie môžu organizáciám výrazne pomôcť.",
    href: "/pomoc-psom/dobrovolnictvo",
    action: "Ako môžem pomôcť",
    tone: "volunteer",
  },
};

function OverviewCard({ item }: { item: HelpOverviewItem }) {
  return (
    <PublicHelpProfileCard
      data-help-overview-card
      href={item.href}
      title={item.title}
      category={item.eyebrow}
      meta={item.meta}
      excerpt={item.excerpt}
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

function Promo({ promo }: { promo: PromoBanner }) {
  return <PublicHelpPhotoBanner promo={promo} />;
}

export async function HelpOverview({
  sections,
}: {
  sections: HelpOverviewSection[];
  totalActive: number;
}) {
  const heroVisual = await getSectionHeroVisual("section.pomoc-psom");
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
            ctaSlot={
              <PublicActionLink
                href="/organizacie"
                variant="secondary"
                icon={<ArrowIcon size={16} />}
              >
                Zobraziť organizácie
              </PublicActionLink>
            }
            metaSlot={
              <div className={styles.headerMeta}>
                <span>
                  <ShieldCheckIcon size={17} /> Zobrazujeme iba publikované údaje
                </span>
              </div>
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

        <Promo promo={lostFoundSubmitPromo} />

        <div className={styles.overviewFlow}>
          {sections.map((section, index) => {
            const promo = promos[index];
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
                    {section.items.length > 0 && (
                      <div className={styles.overviewSectionFooter}>
                        <PublicActionLink href={section.href} variant="tertiary" icon={<ArrowIcon size={16} />}>
                          Zobraziť všetky
                        </PublicActionLink>
                      </div>
                    )}
                  </PageContainer>
                </section>
                {promo ? <Promo promo={promo} /> : null}
              </div>
            );
          })}
        </div>

        <PublicHelpClosingBanner />
      </PublicFoundation>
    </main>
  );
}
