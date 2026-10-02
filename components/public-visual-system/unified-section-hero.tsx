import {
  cloneElement,
  isValidElement,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  sectionVisualPositionPercent,
  type ResolvedSectionVisual,
} from "@/lib/section-visual-contract";
import type { SectionHeroConfig } from "@/lib/portal";
import styles from "./unified-section-hero.module.css";

type VisualStyle = CSSProperties & Record<
  | "--section-visual-desktop-x"
  | "--section-visual-desktop-y"
  | "--section-visual-desktop-zoom"
  | "--section-visual-mobile-x"
  | "--section-visual-mobile-y"
  | "--section-visual-mobile-zoom",
  string | number
>;

type SearchElementProps = {
  placeholder?: string;
  buttonLabel?: string;
};

function visualStyle(visual: ResolvedSectionVisual): VisualStyle {
  return {
    "--section-visual-desktop-x": sectionVisualPositionPercent(visual.desktopCrop.x),
    "--section-visual-desktop-y": sectionVisualPositionPercent(visual.desktopCrop.y),
    "--section-visual-desktop-zoom": visual.desktopCrop.zoom,
    "--section-visual-mobile-x": sectionVisualPositionPercent(visual.mobileCrop.x),
    "--section-visual-mobile-y": sectionVisualPositionPercent(visual.mobileCrop.y),
    "--section-visual-mobile-zoom": visual.mobileCrop.zoom,
  };
}

function managedSearch(searchSlot: ReactNode, config: SectionHeroConfig) {
  if (!searchSlot || !isValidElement(searchSlot)) return searchSlot;
  const overrides: SearchElementProps = {};
  if (config.searchPlaceholder) overrides.placeholder = config.searchPlaceholder;
  if (config.searchButtonLabel) overrides.buttonLabel = config.searchButtonLabel;
  return Object.keys(overrides).length
    ? cloneElement(searchSlot as ReactElement<SearchElementProps>, overrides)
    : searchSlot;
}

function managedCta(config: SectionHeroConfig, fallback: ReactNode) {
  if (config.ctaEnabled === false) return null;
  if (config.ctaEnabled === true && config.ctaLabel && config.ctaHref) {
    return (
      <a
        className={styles.managedCta}
        href={config.ctaHref}
        data-section-hero-cta
        data-variant={config.ctaVariant ?? "primary"}
      >
        {config.ctaLabel}
      </a>
    );
  }
  return fallback;
}

export async function UnifiedSectionHero({
  breadcrumbs,
  eyebrow,
  title,
  intro,
  visual,
  searchSlot,
  ctaSlot,
  metaSlot,
  className,
}: {
  breadcrumbs?: ReactNode;
  eyebrow?: ReactNode;
  title: ReactNode;
  intro?: ReactNode;
  visual: ResolvedSectionVisual;
  searchSlot?: ReactNode;
  ctaSlot?: ReactNode;
  metaSlot?: ReactNode;
  className?: string;
}) {
  const managedTitle = visual.heroContent?.title || title;
  const managedEyebrow = visual.heroContent?.eyebrow || eyebrow;
  const managedIntro = visual.heroContent?.intro || intro;
  const config: SectionHeroConfig = visual.heroContent?.config ?? {};

  const resolvedSearch = managedSearch(searchSlot, config);
  const resolvedCta = managedCta(config, ctaSlot);
  const quickLinks = (config.quickLinks ?? []).filter((item) => item.visible !== false && item.label && item.href);
  const hasTools = Boolean(resolvedSearch || resolvedCta || metaSlot || config.metaLabel || quickLinks.length);

  return (
    <section
      className={[styles.hero, className].filter(Boolean).join(" ")}
      style={visualStyle(visual)}
      data-unified-section-hero
      data-section-visual-key={visual.visualKey}
      data-section-visual-source={visual.source}
    >
      <div className={styles.visual} data-unified-section-hero-visual>
        <div className={styles.media} data-unified-section-hero-media>
          <img className={styles.image} src={visual.imageUrl} alt={visual.altText} decoding="async" />
          <div className={styles.shade} aria-hidden="true" />
        </div>

        <div className={styles.copy} data-unified-section-hero-copy>
          {breadcrumbs ? <div className={styles.breadcrumbs}>{breadcrumbs}</div> : null}
          {managedEyebrow ? <div className={styles.eyebrow}>{managedEyebrow}</div> : null}
          <h1>{managedTitle}</h1>
          {managedIntro ? <div className={styles.intro}>{managedIntro}</div> : null}
        </div>
      </div>

      {hasTools ? (
        <div className={styles.tools} data-unified-section-hero-tools data-section-hero-panel>
          {resolvedSearch ? <div className={styles.search}>{resolvedSearch}</div> : null}
          {resolvedCta ? <div className={styles.cta}>{resolvedCta}</div> : null}
          {(config.metaLabel || metaSlot) ? (
            <div className={styles.meta}>
              {config.metaLabel ? <span>{config.metaLabel}</span> : null}
              {metaSlot ? <span>{metaSlot}</span> : null}
            </div>
          ) : null}
          {quickLinks.length ? (
            <nav className={styles.quickLinks} aria-label="Rýchle odkazy" data-section-hero-quick-links>
              {quickLinks.map((item) => <a href={item.href} key={item.href + item.label}>{item.label}</a>)}
            </nav>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
