import type { ReactNode } from "react";
import styles from "./detail-primitives.module.css";

export type DetailFact = { label: string; value: ReactNode };
export type DetailContact = { label: string; value: ReactNode; id?: string };

function hasContent(value: ReactNode) {
  return value !== null && value !== undefined && value !== false && (typeof value !== "string" || Boolean(value.trim()));
}

export function DetailSection({ eyebrow, title, children }: { eyebrow?: string; title: string; children: ReactNode }) {
  return <section className={styles.section}>{eyebrow && <span className={styles.eyebrow}>{eyebrow}</span>}<h2>{title}</h2>{children}</section>;
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

/** One visual frame; callers retain ownership of their data, actions and states. */
export function DetailHero({ breadcrumbs, copy, media, kind }: {
  breadcrumbs: ReactNode;
  copy: ReactNode;
  media?: ReactNode;
  kind: "directory" | "event" | "adoption" | "help" | "lost-found" | "organization";
}) {
  return <header className={styles.hero} data-public-detail-hero={kind}
    data-public-profile-hero={kind === "directory" || kind === "organization" ? "" : undefined}
    data-directory-profile-hero={kind === "directory" ? "" : undefined}
    data-event-detail-header={kind === "event" ? "" : undefined}>
    <div className={styles.shell}>
      <div className={styles.breadcrumbs}>{breadcrumbs}</div>
      <div className={styles.heroFrame} data-has-media={media ? "true" : "false"}>
        <div className={styles.heroCopy}>{copy}</div>
        {media ? <div className={styles.heroMedia} data-public-profile-media data-event-image={kind === "event" ? "" : undefined}>{media}</div> : null}
      </div>
    </div>
  </header>;
}
