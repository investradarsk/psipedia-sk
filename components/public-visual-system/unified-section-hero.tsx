import {
  cloneElement,
  isValidElement,
  type CSSProperties,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  sectionVisualPositionPercent,
  type ResolvedSectionVisual,
} from "@/lib/section-visual-contract";
import type { SectionHeroConfig } from "@/lib/portal";
import { PageContainer } from "@/components/page-system";
import { responsiveMediaSrcSet } from "@/lib/responsive-media";
import styles from "./unified-section-hero.module.css";
import { PublicActionLink } from "./public-visual-system";

type VisualStyle = CSSProperties & Record<
  | "--section-visual-desktop-x"
  | "--section-visual-desktop-y"
  | "--section-visual-desktop-zoom"
  | "--section-visual-mobile-x"
  | "--section-visual-mobile-y"
  | "--section-visual-mobile-zoom",
  string | number
>;

export type UnifiedSectionHeroVariant = "homepage-style" | "compact" | "task";

type SearchElementProps = {
  placeholder?: string;
  buttonLabel?: string;
  shortcuts?: Array<{ href: string; label: string }>;
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


const STANDARD_HERO_SHORTCUTS = [
  { href: "/adresar", label: "Služby pre psov" },
  { href: "/plemena", label: "Plemená" },
  { href: "/podujatia", label: "Podujatia" },
  { href: "/pomoc-psom", label: "Pomoc psom" },
];
const SECTION_HERO_SHORTCUTS: Record<string, Array<{ href: string; label: string }>> = {
  "section.novinky": [
    { href: "/clanky", label: "Všetky články" },
    { href: "/starostlivost", label: "Zdravie psa" },
    { href: "/aktivity", label: "Výcvik" },
  ],
  "section.adresar": [
    { href: "/adresar/veterinari", label: "Veterinári" },
    { href: "/adresar/treneri", label: "Tréneri" },
    { href: "/mapa", label: "Zobraziť mapu" },
  ],
  "section.podujatia": [
    { href: "/podujatia", label: "Kalendár podujatí" },
    { href: "/mapa", label: "Na mape" },
    { href: "/adresar", label: "Služby" },
  ],
  "section.pomoc-psom": [
    { href: "/pomoc-psom/adopcia", label: "Adopcia" },
    { href: "/pomoc-psom/stratene-psy", label: "Stratené psy" },
    { href: "/mapa", label: "Mapa" },
  ],
  "section.mapa": [
    { href: "/adresar", label: "Služby pre psov" },
    { href: "/organizacie", label: "Organizácie" },
    { href: "/podujatia", label: "Podujatia" },
    { href: "/pomoc-psom", label: "Pomoc psom" },
  ],
};

function defaultHeroQuickLinks(key: string): Array<{ href: string; label: string }> {
  const sectionKey = key.startsWith("directory.") ? "section.adresar"
    : key.startsWith("events.") ? "section.podujatia"
    : key.startsWith("help.") ? "section.pomoc-psom"
    : key.startsWith("reviews.") ? "section.recenzie"
    : key.startsWith("subsection.") ? "section." + key.split(".")[1]
    : key;
  return SECTION_HERO_SHORTCUTS[sectionKey] ?? STANDARD_HERO_SHORTCUTS;
}

function managedSearch(searchSlot: ReactNode, config: SectionHeroConfig, fallbackShortcuts: Array<{ href: string; label: string }>) {
  if (!searchSlot || !isValidElement(searchSlot)) return searchSlot;
  const overrides: SearchElementProps = {};
  if (config.searchPlaceholder) overrides.placeholder = config.searchPlaceholder;
  if (config.searchButtonLabel) overrides.buttonLabel = config.searchButtonLabel;
  const configuredLinks = config.quickLinks?.filter((item) => item.visible !== false && item.label && item.href) ?? [];
  const existingLinks = (searchSlot as ReactElement<SearchElementProps>).props.shortcuts;
  if (configuredLinks.length) {
    overrides.shortcuts = configuredLinks.map(({ href, label }) => ({ href, label }));
  } else if (existingLinks === undefined) {
    // An explicit [] means a contextual editorial search does not want
    // unrelated generic destinations repeated under its form.
    overrides.shortcuts = fallbackShortcuts;
  }
  return Object.keys(overrides).length
    ? cloneElement(searchSlot as ReactElement<SearchElementProps>, overrides)
    : searchSlot;
}

function managedCta(config: SectionHeroConfig, fallback: ReactNode) {
  if (config.ctaEnabled === false) return null;
  if (config.ctaEnabled === true && config.ctaLabel && config.ctaHref) {
    const tone = config.ctaVariant ?? "primary";
    return (
      <PublicActionLink
        className={styles.managedCta}
        href={config.ctaHref}
        variant={tone === "secondary" ? "secondary" : "primary"}
        data-section-hero-cta
        data-variant={tone}
      >
        {config.ctaLabel}
      </PublicActionLink>
    );
  }
  return fallback;
}

export function UnifiedSectionHeroShell({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <PageContainer
      {...props}
      className={[styles.shell, className].filter(Boolean).join(" ")}
      data-unified-section-hero-shell
      data-section-public-header
    />
  );
}

export async function UnifiedSectionHero({
  breadcrumbs,
  eyebrow,
  title,
  intro,
  visual,
  searchSlot,
  portalSearchSlot,
  ctaSlot,
  metaSlot,
  className,
  variant = "homepage-style",
}: {
  breadcrumbs?: ReactNode;
  eyebrow?: ReactNode;
  title: ReactNode;
  intro?: ReactNode;
  visual: ResolvedSectionVisual;
  searchSlot?: ReactNode;
  /** Full homepage-style search panel; never combine with searchSlot. */
  portalSearchSlot?: ReactNode;
  ctaSlot?: ReactNode;
  metaSlot?: ReactNode;
  className?: string;
  variant?: UnifiedSectionHeroVariant;
}) {
  const managedTitle = visual.heroContent?.title || title;
  const managedEyebrow = visual.heroContent?.eyebrow || eyebrow;
  const managedIntro = visual.heroContent?.intro || intro;
  const config: SectionHeroConfig = visual.heroContent?.config ?? {};

  const configuredLinks = (config.quickLinks ?? []).filter((item) => item.visible !== false && item.label && item.href)
    .map(({ href, label }) => ({ href, label }));
  const activeShortcuts = configuredLinks.length ? configuredLinks : defaultHeroQuickLinks(visual.visualKey);
  const resolvedSearch = portalSearchSlot ? null : managedSearch(searchSlot, config, activeShortcuts);
  const resolvedPortalSearch = managedSearch(portalSearchSlot, config, activeShortcuts);
  const resolvedCta = managedCta(config, ctaSlot);
  const quickLinks = portalSearchSlot ? [] : activeShortcuts;
  const hasTools = Boolean(resolvedSearch || resolvedCta || metaSlot || config.metaLabel || quickLinks.length);

  return (
    <section
      className={[styles.hero, className].filter(Boolean).join(" ")}
      style={visualStyle(visual)}
      data-unified-section-hero
      data-hero-variant={variant}
      data-section-visual-key={visual.visualKey}
      data-section-visual-source={visual.source}
    >
      <div className={styles.visual} data-unified-section-hero-visual>
        <div className={styles.media} data-unified-section-hero-media>
          <img className={styles.image} src={visual.imageUrl} srcSet={responsiveMediaSrcSet(visual.imageUrl, [640, 960, 1280, 1600, 1920])} sizes="(max-width: 620px) 100vw, (max-width: 1228px) calc(100vw - 48px), 1180px" alt={visual.altText} decoding="async" fetchPriority={variant === "homepage-style" ? "high" : undefined} />
          <div className={styles.shade} aria-hidden="true" />
        </div>

        <div className={styles.copy} data-unified-section-hero-copy>
          {breadcrumbs ? <div className={styles.breadcrumbs} data-section-hero-breadcrumbs>{breadcrumbs}</div> : null}
          {managedEyebrow ? <div className={styles.eyebrow} data-section-hero-eyebrow>{managedEyebrow}</div> : null}
          <h1 data-section-hero-title>{managedTitle}</h1>
          {managedIntro ? <div className={styles.intro} data-section-hero-intro>{managedIntro}</div> : null}
        </div>
      </div>

      {portalSearchSlot ? (
        <div className={styles.portalSearch} data-unified-hero-portal-search>
          {resolvedPortalSearch}
        </div>
      ) : null}

      {hasTools ? (
        <div className={[styles.tools, portalSearchSlot ? styles.additionalTools : ""].filter(Boolean).join(" ")} data-unified-section-hero-tools data-section-hero-panel>
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
              <span className={styles.quickLinksLabel}>Rýchlo:</span>
              {quickLinks.map((item) => <a href={item.href} key={item.href + item.label}>{item.label}</a>)}
            </nav>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
