import Link from "next/link";
import type { ReactNode } from "react";
import { ImageDisplay } from "@/components/image-display";
import type { ImageDisplayConfig } from "@/lib/image-display";
import type { SmartImageMode } from "@/lib/smart-image";
import { responsiveMediaSrcSet } from "@/lib/responsive-media";
import { PublicMediaFallback } from "./public-media-fallback";
import styles from "./public-visual-system.module.css";
import cardStyles from "./public-article-card.module.css";

export type PublicArticleCardVariant = "featured" | "grid" | "row";
export type PublicArticleCardProps = {
  href: string;
  title: ReactNode;
  topic: ReactNode;
  topicHref?: string;
  date?: ReactNode;
  dateTime?: string;
  image?: {
    src: string;
    alt: string;
    mode?: SmartImageMode;
    focusX?: number | null;
    focusY?: number | null;
    config?: ImageDisplayConfig | null;
  };
  excerpt?: ReactNode;
  variant?: PublicArticleCardVariant;
  desktopLayout?: "stacked";
  accent?: string;
  actionLabel?: string;
  headingLevel?: 2 | 3 | 4;
  imagePriority?: boolean;
  footer?: ReactNode;
  className?: string;
  listItem?: boolean;
  anchorId?: string;
  omitMissingImage?: boolean;
};

function ArticleMedia({
  image,
  variant,
  imagePriority,
  desktopLayout,
}: PublicArticleCardProps & { variant: PublicArticleCardVariant }) {
  return image ? (
    <ImageDisplay
      fallbackOnError
      context="thumbnail"
      config={image.config}
      legacyMode={image.mode}
      legacyFocusX={image.focusX}
      legacyFocusY={image.focusY}
      src={image.src}
      srcSet={responsiveMediaSrcSet(
        image.src,
        variant === "row" && !desktopLayout ? [160, 320, 480] : [320, 480, 640, 768, 960, 1280],
      )}
      sizes={
        variant === "row"
          ? desktopLayout === "stacked"
            ? "(min-width: 901px) 40vw, (max-width: 620px) 90px, 112px"
            : "(max-width: 620px) 90px, 112px"
          : variant === "featured"
            ? "(max-width: 980px) 100vw, 55vw"
            : "(max-width: 620px) 100vw, 33vw"
      }
      alt={image.alt}
      loading={imagePriority ? "eager" : "lazy"}
      fetchPriority={imagePriority ? "high" : "auto"}
      decoding="async"
    />
  ) : (
    <PublicMediaFallback label="Článok zatiaľ nemá fotografiu" />
  );
}

function ArticleMeta({
  topic,
  topicHref,
  date,
  dateTime,
  row,
}: Pick<PublicArticleCardProps, "topic" | "topicHref" | "date" | "dateTime"> & { row: boolean }) {
  const content = (
    <>
      {row || !topicHref ? (
        <span className={row ? styles.articleListTopic : "article-card-topic"} data-article-topic>
          {topic}
        </span>
      ) : (
        <Link href={topicHref} className="article-card-topic" data-article-topic>
          {topic}
        </Link>
      )}
      {row && date ? <span aria-hidden="true">·</span> : null}
      {date ? (
        dateTime ? (
          <time dateTime={dateTime} data-article-date>
            {date}
          </time>
        ) : (
          <span data-article-date>{date}</span>
        )
      ) : null}
    </>
  );
  return row ? (
    <span className={styles.articleListMeta} data-public-card-meta>
      {content}
    </span>
  ) : (
    <div className="article-card-meta" data-public-card-meta>
      {content}
    </div>
  );
}

/** One renderer family: the wrappers supply data, never their own media/metadata/fallback markup. */
export function PublicArticleCard(props: PublicArticleCardProps) {
  const {
    href,
    title,
    variant = "grid",
    accent = "forest",
    excerpt,
    footer,
    className,
    listItem = true,
    anchorId,
    omitMissingImage = false,
    headingLevel = 3,
    actionLabel = "Čítať článok",
  } = props;
  const Heading = `h${headingLevel}` as "h2" | "h3" | "h4";
  const media = <ArticleMedia {...props} variant={variant} />;
  if (variant === "row")
    return (
      <Link
        id={anchorId}
        href={href}
        className={[
          styles.articleListItem,
          styles.articleListItemWithImage,
          cardStyles.row,
          props.desktopLayout === "stacked" && cardStyles.stacked,
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        role={listItem ? "listitem" : undefined}
        data-article-list-item
        data-public-card="article"
        data-article-variant="row"
      >
        <span className={styles.articleListMedia} data-article-image>
          {media}
        </span>
        <span className={styles.articleListCopy}>
          <strong className={styles.articleListTitle} data-article-title data-public-card-title>
            {title}
          </strong>
          <ArticleMeta {...props} row />
        </span>
      </Link>
    );
  return (
    <article
      id={anchorId}
      className={[
        `article-card article-card--${accent} article-card--${variant}`,
        cardStyles.card,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      data-article-card
      data-public-card="article"
      data-article-variant={variant}
    >
      {props.image || !omitMissingImage ? (
        <Link
          href={href}
          className="article-card-media"
          aria-label={`${actionLabel}: ${typeof title === "string" ? title : ""}`}
        >
          {media}
        </Link>
      ) : null}
      <div className="article-card-body">
        <ArticleMeta {...props} row={false} />
        <Heading className="article-card-title" data-public-card-title>
          <Link href={href}>{title}</Link>
        </Heading>
        {excerpt ? <p className="article-card-excerpt">{excerpt}</p> : null}
        {footer ? <div className="article-card-footer">{footer}</div> : null}
      </div>
    </article>
  );
}
