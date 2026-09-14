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
