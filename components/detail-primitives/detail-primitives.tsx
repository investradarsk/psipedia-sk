import type { ReactNode } from "react";
import styles from "./detail-primitives.module.css";

export type DetailFact = { label: string; value: ReactNode };
export type DetailContact = { label: string; value: ReactNode; id?: string };

function hasContent(value: ReactNode) {
  return value !== null && value !== undefined && value !== false && (typeof value !== "string" || Boolean(value.trim()));
}

export function DetailSection({
  title, children, compactHeading = false,
}: {
  eyebrow?: string; title: string; children: ReactNode; compactHeading?: boolean;
}) {
  return (
    <section className={styles.section}>
      {compactHeading
        ? <h2 className={styles.compactHeading}>{title}</h2>
        : <h2>{title}</h2>}
      {children}
    </section>
  );
}

export function DetailParagraphs({ value }: { value: string | null | undefined }) {
  const paragraphs = value?.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean) ?? [];
  return <>{paragraphs.map((paragraph, index) => <p key={`${index}-${paragraph.slice(0, 32)}`}>{paragraph}</p>)}</>;
}

export function DetailFactsCard({ title, facts }: { title: string; facts: Array<DetailFact | null | false | undefined> }) {
  const visible = facts.filter((fact): fact is DetailFact => Boolean(fact && hasContent(fact.value)));
  if (!visible.length) return null;
  return <section className={styles.card}><h2>{title}</h2><dl className={styles.facts}>{visible.map((fact) => <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}</dl></section>;
}

export function DetailContactsCard({ title, contacts, note }: { title: string; contacts: DetailContact[]; note?: ReactNode }) {
  const visible = contacts.filter((contact) => hasContent(contact.value));
  if (!visible.length && !hasContent(note)) return null;
  return <section className={styles.card}><h2>{title}</h2>{visible.length > 0 && <div className={styles.contacts}>{visible.map((contact) => <div className={styles.contact} key={contact.id ?? contact.label}><span>{contact.label}</span>{contact.value}</div>)}</div>}{hasContent(note) && <p className={styles.note}>{note}</p>}</section>;
}

export function DetailOptionGrid({ options }: { options: Array<{ label: string; value: ReactNode }> }) {
  if (!options.length) return null;
  return <ul className={styles.optionGrid}>{options.map((option) => <li key={option.label}><strong>{option.label}</strong><span>{option.value}</span></li>)}</ul>;
}

export function DetailActions({ children }: { children: ReactNode }) {
  return <div className={styles.actions}>{children}</div>;
}

export function DetailContentLayout({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  const className = aside ? `${styles.contentLayout} ${styles.contentLayoutWithAside}` : styles.contentLayout;
  return <div className={className}><div className={styles.contentMain}>{children}</div>{aside ? <aside className={styles.contentAside}>{aside}</aside> : null}</div>;
}

/**
 * Canonical content shell for ALL public detail pages: services, events,
 * organizations, adoptions, rescue cases, lost/found.
 *
 * "split" wraps the content and optional sidebar in the same grid.
 * "inline" keeps existing semantic <article>/<aside> children in place, for
 * profile types with safety-specific DOM order and advanced side panels.
 * Both modes share exactly the same gutters, breakpoint and column ratio.
 */
export function PublicDetailLayout({
  children, aside, asideLabel = "Praktické informácie", mode = "split",
  element = "div", className, contentClassName, asideClassName, ...attrs
}: {
  children: ReactNode;
  aside?: ReactNode;
  asideLabel?: string;
  mode?: "split" | "inline";
  element?: "div" | "section";
  className?: string;
  contentClassName?: string;
  asideClassName?: string;
} & Omit<import("react").HTMLAttributes<HTMLDivElement>, "children">) {
  const hasAside = aside !== undefined && aside !== null && aside !== false;
  const classes = [
    styles.publicDetailShell,
    mode === "inline" ? styles.publicDetailInline :
      hasAside ? styles.publicDetailSplit : styles.publicDetailSingle,
    className,
  ].filter(Boolean).join(" ");
  const content = mode === "inline" ? children : (
    <>
      <div className={[styles.publicDetailMain, contentClassName].filter(Boolean).join(" ")}
        data-public-detail-main>{children}</div>
      {hasAside ? <aside
        className={[styles.publicDetailAside, asideClassName].filter(Boolean).join(" ")}
        aria-label={asideLabel} data-public-detail-aside>{aside}</aside> : null}
    </>
  );
  if (element === "section") {
    return <section {...attrs} className={classes} data-public-detail-layout>{content}</section>;
  }
  return <div {...attrs} className={classes} data-public-detail-layout>{content}</div>;
}

/** One visual frame; callers retain ownership of their data, actions and states. */
export function DetailHero({ breadcrumbs, copy, media, kind, mediaPresentation = "standard" }: {
  breadcrumbs: ReactNode;
  copy: ReactNode;
  media?: ReactNode;
  mediaPresentation?: "standard" | "compact";
  kind: "directory" | "event" | "adoption" | "help" | "lost-found" | "organization" | "breed";
}) {
  return <header className={styles.hero} data-public-detail-hero={kind}
    data-public-profile-hero={kind === "directory" || kind === "organization" ? "" : undefined}
    data-directory-profile-hero={kind === "directory" ? "" : undefined}
    data-event-detail-header={kind === "event" ? "" : undefined}>
    <div className={styles.shell}>
      <div className={styles.breadcrumbs}>{breadcrumbs}</div>
      <div className={styles.heroFrame} data-has-media={media ? "true" : "false"} data-media-presentation={mediaPresentation}>
        <div className={styles.heroCopy}>{copy}</div>
        {media ? <div className={styles.heroMedia} data-public-profile-media data-event-image={kind === "event" ? "" : undefined}>{media}</div> : null}
      </div>
    </div>
  </header>;
}
