import type { ReactNode } from "react";
import Link from "next/link";
import { Breadcrumbs } from "@/components/page-system";
import { formatHelpAmount, formatHelpDate, getHelpCategory, helpProgress, type HelpCase } from "@/lib/help";
import { getHelpPresentation, type HelpContact } from "@/lib/help-detail-presentation";
import styles from "./help-detail.module.css";

export type HelpFact = { label: string; value: ReactNode };

function externalAction(item: HelpCase) {
  return Boolean(item.actionUrl && (item.category !== "zbierky" || item.verified) && !item.resolved);
}

function safetyCopy(item: HelpCase) {
  switch (item.category) {
    case "zbierky":
      return "Finančnú pomoc posielajte iba cez uvedený dôveryhodný odkaz a pred platbou si skontrolujte organizátora aj účel zbierky.";
    case "adopcia":
    case "docasna-opatera":
      return "Pred prevzatím psa si overte organizáciu alebo kontaktnú osobu, podmienky odovzdania a všetky dôležité informácie o psovi.";
    case "stratene-a-najdene":
      return "Pri osobnom stretnutí dbajte na vlastnú bezpečnosť. Citlivé údaje alebo presnú súkromnú adresu nezverejňujte verejne.";
    default:
      return "Pred odoslaním peňazí, materiálnej pomoci alebo osobným stretnutím si overte organizáciu, účel pomoci a aktuálnosť uvedených údajov.";
  }
}

function FallbackVisual() {
  return <div className={styles.fallback} aria-hidden="true"><span className={styles.fallbackMark} /></div>;
}

export function HelpDetailShell({
  item,
  title,
  contextTitle,
  children,
  sidebar,
}: {
  item: HelpCase;
  title?: string;
  contextTitle?: string | null;
  children: ReactNode;
  sidebar: ReactNode;
}) {
  const category = getHelpCategory(item.category);
  const presentation = getHelpPresentation(item);
  const showTrust = item.verified || presentation.sources.length > 0 || Boolean(presentation.lastChecked);
  const heroTitle = title?.trim() || item.title;
  const imageAlt = item.dogName ? `${item.dogName} – ${item.title}` : item.title;

  return <main id="obsah" tabIndex={-1} className={styles.detail}>
    <header className={styles.hero}>
      <div className={styles.shell}>
        <Breadcrumbs>
          <Link href="/">Domov</Link><span>/</span>
          <Link href="/pomoc-psom">Pomoc psom</Link><span>/</span>
          <Link href={`/pomoc-psom/${item.category}`}>{category?.label ?? "Pomoc psom"}</Link><span>/</span>
          <span>{heroTitle}</span>
        </Breadcrumbs>
        <div className={styles.heroGrid}>
          <div className={styles.heroCopy}>
            <div className={styles.tags}>
              <span className={styles.tag}>{category?.singular ?? "Pomoc psom"}</span>
              {item.verified && <span className={styles.verified}>Overené Psipediou</span>}
              {item.urgent && !item.resolved && <span className={styles.urgent}>Urgentné</span>}
              {item.resolved && <span className={styles.resolved}>Ukončené / vyriešené</span>}
            </div>
            <h1>{heroTitle}</h1>
            {contextTitle && contextTitle !== heroTitle && <p className={styles.contextTitle}>{contextTitle}</p>}
            {item.excerpt && <p className={styles.excerpt}>{item.excerpt}</p>}
            <div className={styles.heroMeta}>
              <span><strong>Lokalita</strong> {item.city}{item.region ? ` · ${item.region}` : ""}</span>
              {item.reportedDate && <span><strong>Dátum</strong> {formatHelpDate(item.reportedDate)}</span>}
            </div>
            <div className={styles.heroActions}>
              {externalAction(item) && <a className={styles.primaryAction} href={item.actionUrl ?? undefined} target="_blank" rel="noreferrer">{item.actionLabel || "Zistiť viac"} ↗</a>}
              <Link className={styles.secondaryAction} href={`/pomoc-psom/${item.category}`}>Späť na {category?.label?.toLocaleLowerCase("sk") ?? "prehľad"}</Link>
            </div>
          </div>
          <div className={styles.visual}>
            {item.imageUrl ? <img src={item.imageUrl} alt={imageAlt} /> : <FallbackVisual />}
          </div>
        </div>
      </div>
    </header>

    <section className={styles.content}>
      <div className={`${styles.shell} ${styles.layout}`}>
        <article className={styles.copy}>{children}</article>
        <aside className={styles.aside} aria-label="Praktické informácie">{sidebar}</aside>
      </div>
      {showTrust && <div className={styles.shell}>
        <section className={styles.trust} aria-labelledby={`help-trust-${item.id}`}>
          <span className={styles.trustIcon} aria-hidden="true">✓</span>
          <div>
            <h2 id={`help-trust-${item.id}`}>Overenie a zdroje</h2>
            <p>{item.verified ? "Psipedia označila tento záznam ako overený na základe dostupných zdrojov. Údaje sa môžu časom meniť." : "Pri tomto zázname uvádzame len zdrojové údaje, ktoré sú uložené v databáze."}</p>
            <div className={styles.trustMeta}>
              {presentation.lastChecked && <span>Posledná kontrola: <strong>{presentation.lastChecked}</strong></span>}
              {presentation.sources.map((source) => source.href
                ? <a key={`${source.label}-${source.value}`} href={source.href} target="_blank" rel="noreferrer nofollow">{source.label} ↗</a>
                : <span key={`${source.label}-${source.value}`}>{source.label}: {source.value}</span>)}
            </div>
          </div>
        </section>
      </div>}
    </section>

    <section className={styles.safety} aria-labelledby={`help-safety-${item.id}`}>
      <div className={`${styles.shell} ${styles.safetyInner}`}>
        <span className={styles.safetyIcon} aria-hidden="true">!</span>
        <div><h2 id={`help-safety-${item.id}`}>Pomáhajte bezpečne</h2><p>{safetyCopy(item)}</p></div>
        <Link href="/zasady-obsahu">Ako overujeme obsah →</Link>
      </div>
    </section>
  </main>;
}

export function HelpSection({ eyebrow, title, children }: { eyebrow?: string; title: string; children: ReactNode }) {
  return <section className={styles.section}>{eyebrow && <span className={styles.eyebrow}>{eyebrow}</span>}<h2>{title}</h2>{children}</section>;
}

export function HelpParagraphs({ value }: { value: string | null | undefined }) {
  const paragraphs = value?.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean) ?? [];
  return <>{paragraphs.map((paragraph, index) => <p key={`${index}-${paragraph.slice(0, 32)}`}>{paragraph}</p>)}</>;
}

export function HelpFactsCard({ title = "Základné informácie", facts }: { title?: string; facts: Array<HelpFact | null | false | undefined> }) {
  const visible = facts.filter((fact): fact is HelpFact => Boolean(fact));
  if (!visible.length) return null;
  return <section className={styles.card}><h2>{title}</h2><dl className={styles.facts}>{visible.map((fact) => <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}</dl></section>;
}

export function HelpContactsCard({ contacts, note }: { contacts: HelpContact[]; note?: string | null }) {
  if (!contacts.length && !note) return null;
  return <section className={styles.card}><h2>Kontakty</h2>{contacts.length > 0 && <div className={styles.contacts}>{contacts.map((contact) => <div className={styles.contact} key={`${contact.label}-${contact.value}`}><span>{contact.label}</span>{contact.href ? <a href={contact.href} target={contact.external ? "_blank" : undefined} rel={contact.external ? "noreferrer" : undefined}>{contact.external ? `${contact.value} ↗` : contact.value}</a> : <strong>{contact.value}</strong>}</div>)}</div>}{note && <p className={styles.note}>{note}</p>}</section>;
}

export function HelpOptions({ options }: { options: Array<{ label: string; value: string }> }) {
  if (!options.length) return null;
  return <ul className={styles.optionGrid}>{options.map((option) => <li key={option.label}><strong>{option.label}</strong><span>{option.value}</span></li>)}</ul>;
}

export function HelpProgressCard({ item }: { item: HelpCase }) {
  const progress = helpProgress(item);
  if (progress === null) return null;
  return <section className={`${styles.card} ${styles.progress}`}><h2>Stav zbierky</h2><div className={styles.progressNumbers}><span>Vyzbierané<strong>{formatHelpAmount(item.raisedAmount ?? 0)}</strong></span><span>Cieľ<strong>{formatHelpAmount(item.goalAmount)}</strong></span></div><div className={styles.progressTrack} role="progressbar" aria-label="Priebeh zbierky" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{ width: `${progress}%` }} /></div><small>{progress} % cieľa</small></section>;
}
