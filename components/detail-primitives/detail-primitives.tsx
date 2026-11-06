import { PublicHeading } from "@/components/public-heading";
import type { ReactNode } from "react";
import styles from "./detail-primitives.module.css";

export type DetailFact = { label: string; value: ReactNode };
export type DetailContact = { label: string; value: ReactNode; id?: string };

function hasContent(value: ReactNode) {
  return (
    value !== null &&
    value !== undefined &&
    value !== false &&
    (typeof value !== "string" || Boolean(value.trim()))
  );
}

export function DetailSection({
  title,
  children,
  compactHeading = false,
}: {
  eyebrow?: string;
  title: string;
  children: ReactNode;
  compactHeading?: boolean;
}) {
  return (
    <section className={styles.section}>
      {compactHeading ? (
        <PublicHeading role="panel" as="h2" className={styles.compactHeading}>
          {title}
        </PublicHeading>
      ) : (
        <PublicHeading role="panel" as="h2">
          {title}
        </PublicHeading>
      )}
      {children}
    </section>
  );
}

export function DetailParagraphs({ value }: { value: string | null | undefined }) {
  const paragraphs =
    value
      ?.split(/\n{2,}/)
      .map((part) => part.trim())
      .filter(Boolean) ?? [];
  return (
    <>
      {paragraphs.map((paragraph, index) => (
        <p key={`${index}-${paragraph.slice(0, 32)}`}>{paragraph}</p>
      ))}
    </>
  );
}

export function DetailFactsCard({
  title,
  facts,
}: {
  title: string;
  facts: Array<DetailFact | null | false | undefined>;
}) {
  const visible = facts.filter((fact): fact is DetailFact =>
    Boolean(fact && hasContent(fact.value)),
  );
  if (!visible.length) return null;
  return (
    <section className={styles.card}>
      <PublicHeading role="panel" as="h2">
        {title}
      </PublicHeading>
      <DetailFactList facts={visible} />
    </section>
  );
}

export function DetailContactsCard({
  title,
  contacts,
  note,
  noteTone = "highlight",
  emptyMessage = "Priamy kontakt zatiaľ nie je uvedený.",
  id,
}: {
  title: string;
  contacts: DetailContact[];
  note?: ReactNode;
  noteTone?: "highlight" | "neutral";
  emptyMessage?: string;
  id?: string;
}) {
  const visible = contacts.filter((contact) => hasContent(contact.value));

  return (
    <section className={styles.card} id={id} data-public-contact-panel>
      <PublicHeading role="panel" as="h2">
        {title}
      </PublicHeading>
      {visible.length ? (
        <DetailFactList
          facts={visible.map((contact) => ({ label: contact.label, value: contact.value }))}
        />
      ) : (
        <p data-public-contact-empty>{emptyMessage}</p>
      )}
      {hasContent(note) && <p className={noteTone === "neutral" ? styles.noteNeutral : styles.note}>{note}</p>}
    </section>
  );
}

export function DetailOptionGrid({
  options,
}: {
  options: Array<{ label: string; value: ReactNode }>;
}) {
  if (!options.length) return null;
  return (
    <ul className={styles.optionGrid}>
      {options.map((option) => (
        <li key={option.label}>
          <strong>{option.label}</strong>
          <span>{option.value}</span>
        </li>
      ))}
    </ul>
  );
}

export function DetailActions({ children }: { children: ReactNode }) {
  return <div className={styles.actions}>{children}</div>;
}

export function DetailContentLayout({
  children,
  aside,
}: {
  children: ReactNode;
  aside?: ReactNode;
}) {
  const className = aside
    ? `${styles.contentLayout} ${styles.contentLayoutWithAside}`
    : styles.contentLayout;
  return (
    <div className={className}>
      <div className={styles.contentMain}>{children}</div>
      {aside ? <aside className={styles.contentAside}>{aside}</aside> : null}
    </div>
  );
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
  children,
  aside,
  asideLabel = "Praktické informácie",
  mode = "split",
  element = "div",
  className,
  contentClassName,
  asideClassName,
  ...attrs
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
    mode === "inline"
      ? styles.publicDetailInline
      : hasAside
        ? styles.publicDetailSplit
        : styles.publicDetailSingle,
    className,
  ]
    .filter(Boolean)
    .join(" ");
  const content =
    mode === "inline" ? (
      children
    ) : (
      <>
        <div
          className={[styles.publicDetailMain, contentClassName].filter(Boolean).join(" ")}
          data-public-detail-main
        >
          {children}
        </div>
        {hasAside ? (
          <aside
            className={[styles.publicDetailAside, asideClassName].filter(Boolean).join(" ")}
            aria-label={asideLabel}
            data-public-detail-aside
          >
            {aside}
          </aside>
        ) : null}
      </>
    );
  if (element === "section") {
    return (
      <section {...attrs} className={classes} data-public-detail-layout>
        {content}
      </section>
    );
  }
  return (
    <div {...attrs} className={classes} data-public-detail-layout>
      {content}
    </div>
  );
}

/** One visual frame; callers retain ownership of their data, actions and states. */
export function DetailHero({
  breadcrumbs,
  copy,
  media,
  kind,
  mediaPresentation = "standard",
}: {
  breadcrumbs: ReactNode;
  copy: ReactNode;
  media?: ReactNode;
  mediaPresentation?: "standard" | "compact";
  kind: "directory" | "event" | "adoption" | "help" | "lost-found" | "organization" | "breed";
}) {
  return (
    <header
      className={styles.hero}
      data-public-detail-hero={kind}
      data-public-profile-hero={kind === "directory" || kind === "organization" ? "" : undefined}
      data-directory-profile-hero={kind === "directory" ? "" : undefined}
      data-event-detail-header={kind === "event" ? "" : undefined}
    >
      <div className={styles.shell}>
        <div className={styles.breadcrumbs}>{breadcrumbs}</div>
        <div
          className={styles.heroFrame}
          data-has-media={media ? "true" : "false"}
          data-media-presentation={mediaPresentation}
        >
          <div className={styles.heroCopy}>{copy}</div>
          {media ? (
            <div
              className={styles.heroMedia}
              data-public-profile-media
              data-event-image={kind === "event" ? "" : undefined}
            >
              {media}
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}

/**
 * The same semantic action row for event and service heroes.
 * The owning detail controls which links to show and their destinations.
 */
export function DetailHeroActions({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <nav
      className={[styles.heroActions, className].filter(Boolean).join(" ")}
      aria-label={label}
      data-public-detail-actions
    >
      {children}
    </nav>
  );
}

/** Independent desktop stacks with the original ordered blocks on narrow screens. */
export function PublicDetailFlow({
  blocks,
  className,
}: {
  blocks: Array<{ key: string; column: "main" | "aside"; content: ReactNode }>;
  className?: string;
}) {
  return (
    <PublicDetailLayout mode="inline" className={className}>
      <div className={styles.flowGrid} data-public-detail-flow>
        {(["main", "aside"] as const).map((column) => (
          <div key={column} className={styles.flowColumn}>
            {blocks.map((block, index) =>
              block.column === column && hasContent(block.content) ? (
                <div
                  key={block.key}
                  className={styles.flowItem}
                  style={{ "--detail-mobile-order": index } as import("react").CSSProperties}
                  data-detail-block={block.key}
                >
                  {block.content}
                </div>
              ) : null,
            )}
          </div>
        ))}
      </div>
    </PublicDetailLayout>
  );
}

export function DetailFactList({ facts }: { facts: DetailFact[] }) {
  return (
    <dl className={styles.facts} data-public-fact-list>
      {facts
        .filter((fact) => hasContent(fact.value))
        .map((fact) => (
          <div key={fact.label}>
            <dt>{fact.label}</dt>
            <dd>{fact.value}</dd>
          </div>
        ))}
    </dl>
  );
}
