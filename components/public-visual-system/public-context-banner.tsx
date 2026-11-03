import { PublicBannerContent } from "./public-magazine-banner";
import type { ReactElement, ReactNode } from "react";
import { PublicIcon } from "./public-visual-system";
import styles from "./public-context-banner.module.css";
import { PublicBannerFrame } from "./public-banner-frame";

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
  inline = false,
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
  /** Compact row for contextual CTAs; the default/photo layout is unchanged. */
  inline?: boolean;
  className?: string;
}) {
  const hasCta = Boolean(ctaLabel && ctaHref);
  const hasImage = Boolean(image?.src.trim());

  return (
    <PublicBannerFrame
      className={cx(
        styles.banner,
        styles[`tone_${tone}`],
        hasImage && styles.hasImage,
        inline && styles.inline,
        className,
      )}
      data-public-context-banner
      data-public-context-banner-tone={tone}
      data-public-context-banner-layout={inline ? "inline" : "stacked"}
      data-public-context-banner-media={hasImage ? "image" : "text"}
    >
      <PublicBannerContent
        className={styles.copy}
        eyebrow={eyebrow}
        title={title}
        description={text}
        href={hasCta ? ctaHref : undefined}
        label={ctaLabel}
        actionVariant={tone === "forest" ? "secondary" : "primary"}
        icon={icon ? <PublicIcon icon={icon} size="lg" className={styles.icon} /> : null}
      />
      {hasImage && image ? (
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
    </PublicBannerFrame>
  );
}
