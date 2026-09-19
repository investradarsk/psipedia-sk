import Link from "next/link";
import type { ButtonHTMLAttributes, HTMLAttributes, ReactElement, ReactNode } from "react";
import { ArrowIcon } from "@/components/icons";
import styles from "./public-visual-system.module.css";

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export type PublicHeaderVariant = "editorial" | "compact" | "image" | "data";
export type PublicActionVariant = "primary" | "secondary" | "tertiary";
export type PublicIconSize = "sm" | "md" | "lg";

const headerVariantClass: Record<PublicHeaderVariant, string> = {
  editorial: styles.headerEditorial,
  compact: styles.headerCompact,
  image: styles.headerImage,
  data: styles.headerData,
};

const actionVariantClass: Record<PublicActionVariant, string> = {
  primary: styles.actionPrimary,
  secondary: styles.actionSecondary,
  tertiary: styles.actionTertiary,
};

const iconSizeClass: Record<PublicIconSize, string> = {
  sm: styles.iconSm,
  md: styles.iconMd,
  lg: styles.iconLg,
};

/**
 * Opt-in public typography/token scope. It deliberately does not style global
 * elements, admin, or editor surfaces.
 */
export function PublicFoundation({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={cx(styles.foundation, className)} />;
}

/**
 * Consistent decorative icon frame for the public UI. Requiring a ReactElement
 * keeps icon slots component-driven instead of using emoji/text as UI chrome.
 */
export function PublicIcon({
  icon,
  size = "md",
  className,
}: {
  icon: ReactElement;
  size?: PublicIconSize;
  className?: string;
}) {
  return <span className={cx(styles.icon, iconSizeClass[size], className)} aria-hidden="true">{icon}</span>;
}

export function PublicSectionHeader({
  variant = "compact",
  eyebrow,
  title,
  intro,
  actions,
  meta,
  visual,
  image,
  className,
}: {
  variant?: PublicHeaderVariant;
  eyebrow?: ReactNode;
  title: ReactNode;
  intro?: ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
  visual?: ReactNode;
  image?: { src: string; alt: string };
  className?: string;
}) {
  const sideVisual = image ? (
    <div className={styles.headerVisual}>
      <img src={image.src} alt={image.alt} decoding="async" />
    </div>
  ) : visual ? (
    <div className={styles.headerVisual}>{visual}</div>
  ) : null;

  return (
    <header className={cx(styles.sectionHeader, headerVariantClass[variant], sideVisual && styles.hasVisual, className)}>
      <div className={styles.headerCopy}>
        {eyebrow ? <div className={styles.eyebrow}>{eyebrow}</div> : null}
        <h1>{title}</h1>
        {intro ? <div className={styles.headerIntro}>{intro}</div> : null}
        {meta ? <div className={styles.headerMeta}>{meta}</div> : null}
        {actions ? <div className={styles.headerActions}>{actions}</div> : null}
      </div>
      {sideVisual}
    </header>
  );
}

export function PublicActionLink({
  href,
  variant = "primary",
  children,
  icon,
  className,
  target,
  rel,
}: {
  href: string;
  variant?: PublicActionVariant;
  children: ReactNode;
  icon?: ReactElement;
  className?: string;
  target?: "_blank" | "_self";
  rel?: string;
}) {
  return (
    <Link className={cx(styles.action, actionVariantClass[variant], className)} href={href} target={target} rel={rel}>
      <span>{children}</span>
      {icon ? <PublicIcon icon={icon} size="sm" /> : null}
    </Link>
  );
}

export function PublicActionButton({
  variant = "primary",
  icon,
  className,
  children,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: PublicActionVariant;
  icon?: ReactElement;
}) {
  return (
    <button {...props} type={type} className={cx(styles.action, actionVariantClass[variant], className)}>
      <span>{children}</span>
      {icon ? <PublicIcon icon={icon} size="sm" /> : null}
    </button>
  );
}

export function PublicContentList({
  children,
  label,
  className,
}: {
  children: ReactNode;
  label?: string;
  className?: string;
}) {
  return <div className={cx(styles.contentList, className)} role="list" aria-label={label}>{children}</div>;
}

export function PublicArticleListItem({
  href,
  title,
  topic,
  date,
  dateTime,
  image,
  className,
  listItem = true,
}: {
  href: string;
  title: ReactNode;
  topic: ReactNode;
  date: ReactNode;
  dateTime?: string;
  image?: { src: string; alt: string };
  className?: string;
  listItem?: boolean;
}) {
  return (
    <Link className={cx(styles.articleListItem, image && styles.articleListItemWithImage, className)} href={href} role={listItem ? "listitem" : undefined} data-article-list-item>
      {image ? (
        <span className={styles.articleListMedia} data-article-image>
          <img src={image.src} alt={image.alt} loading="lazy" decoding="async" />
        </span>
      ) : null}
      <span className={styles.articleListCopy}>
        <strong className={styles.articleListTitle} data-article-title>{title}</strong>
        <span className={styles.articleListMeta}>
          <span className={styles.articleListTopic} data-article-topic>{topic}</span>
          <span aria-hidden="true">·</span>
          {dateTime ? <time dateTime={dateTime} data-article-date>{date}</time> : <span data-article-date>{date}</span>}
        </span>
      </span>
    </Link>
  );
}

export function PublicContentListItem({
  href,
  title,
  eyebrow,
  excerpt,
  meta,
  image,
  actionLabel = "Otvoriť",
  className,
}: {
  href: string;
  title: ReactNode;
  eyebrow?: ReactNode;
  excerpt?: ReactNode;
  meta?: ReactNode;
  image?: { src: string; alt: string };
  actionLabel?: string;
  className?: string;
}) {
  return (
    <Link className={cx(styles.contentItem, image && styles.contentItemWithImage, className)} href={href} role="listitem">
      {image ? <span className={styles.contentMedia}><img src={image.src} alt={image.alt} loading="lazy" decoding="async" /></span> : null}
      <span className={styles.contentCopy}>
        {eyebrow ? <span className={styles.itemEyebrow}>{eyebrow}</span> : null}
        <strong className={styles.contentTitle}>{title}</strong>
        {excerpt ? <span className={styles.contentExcerpt}>{excerpt}</span> : null}
        <span className={styles.contentFooter}>
          {meta ? <span className={styles.contentMeta}>{meta}</span> : <span />}
          <span className={styles.actionCue}>{actionLabel}<ArrowIcon size={16} /></span>
        </span>
      </span>
    </Link>
  );
}

export function PublicDataCard({
  href,
  title,
  description,
  eyebrow,
  meta,
  icon,
  actionLabel = "Zobraziť profil",
  className,
}: {
  href: string;
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  meta?: ReactNode;
  icon?: ReactElement;
  actionLabel?: string;
  className?: string;
}) {
  return (
    <Link className={cx(styles.dataCard, className)} href={href}>
      {icon ? <PublicIcon icon={icon} size="lg" className={styles.dataCardIcon} /> : null}
      <span className={styles.dataCardBody}>
        {eyebrow ? <span className={styles.itemEyebrow}>{eyebrow}</span> : null}
        <strong className={styles.dataCardTitle}>{title}</strong>
        {description ? <span className={styles.dataCardDescription}>{description}</span> : null}
        {meta ? <span className={styles.dataCardMeta}>{meta}</span> : null}
      </span>
      <span className={styles.dataCardAction}>{actionLabel}<ArrowIcon size={17} /></span>
    </Link>
  );
}
