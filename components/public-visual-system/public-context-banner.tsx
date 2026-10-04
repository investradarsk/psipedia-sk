import type { ReactElement, ReactNode } from "react";
import { PublicActionLink, PublicIcon } from "./public-visual-system";
import styles from "./public-context-banner.module.css";

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export type PublicContextBannerTone = "forest" | "sage" | "coral" | "sand";

export type PublicContextBannerImage = {
  src: string;
  alt?: string;
  width?: number;
  height?: number;
  loading?: "eager" | "lazy";
};

export function PublicContextBanner({
  eyebrow,
  title,
  text,
  ctaLabel,
  ctaHref,
  image,
  icon,
  tone = "forest",
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  text?: ReactNode;
  ctaLabel?: string;
  ctaHref?: string;
  image?: PublicContextBannerImage;
  icon?: ReactElement;
  tone?: PublicContextBannerTone;
  className?: string;
}) {
  const hasCta = Boolean(ctaLabel && ctaHref);

  return (
    <aside
      className={cx(styles.banner, styles[`tone_${tone}`], image && styles.hasImage, className)}
      data-public-context-banner
      data-public-context-banner-tone={tone}
    >
      <div className={styles.copy}>
        {icon ? <PublicIcon icon={icon} size="lg" className={styles.icon} /> : null}
        {eyebrow ? <span className={styles.eyebrow}>{eyebrow}</span> : null}
        <h2>{title}</h2>
        {text ? <div className={styles.text}>{text}</div> : null}
        {hasCta ? <PublicActionLink href={ctaHref!} variant={tone === "forest" ? "secondary" : "primary"}>{ctaLabel}</PublicActionLink> : null}
      </div>
      {image ? (
        <div className={styles.media}>
          <img
            src={image.src}
            alt={image.alt ?? ""}
            width={image.width ?? 720}
            height={image.height ?? 480}
            loading={image.loading ?? "lazy"}
            decoding="async"
          />
        </div>
      ) : null}
    </aside>
  );
}
