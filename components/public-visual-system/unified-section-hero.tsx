import type { CSSProperties, ReactNode } from "react";
import {
  sectionVisualPositionPercent,
  type ResolvedSectionVisual,
} from "@/lib/section-visual-contract";
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

export function UnifiedSectionHero({
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
  return (
    <section
      className={[styles.hero, className].filter(Boolean).join(" ")}
      style={visualStyle(visual)}
      data-unified-section-hero
      data-section-visual-source={visual.source}
    >
      <img className={styles.image} src={visual.imageUrl} alt={visual.altText} decoding="async" />
      <div className={styles.shade} />
      <div className={styles.content}>
        {breadcrumbs ? <div className={styles.breadcrumbs}>{breadcrumbs}</div> : null}
        {eyebrow ? <div className={styles.eyebrow}>{eyebrow}</div> : null}
        <h1>{title}</h1>
        {intro ? <div className={styles.intro}>{intro}</div> : null}
        {metaSlot ? <div className={styles.meta}>{metaSlot}</div> : null}
        {ctaSlot ? <div className={styles.cta}>{ctaSlot}</div> : null}
        {searchSlot ? <div className={styles.search}>{searchSlot}</div> : null}
      </div>
    </section>
  );
}
