import Link from "next/link";
import {
  formatHelpAmount,
  formatHelpDate,
  getHelpCategory,
  helpCaseHref,
  helpProgress,
  type HelpCase,
} from "@/lib/help";

function paragraphs(value: string) {
  return value.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
}

export function HelpDetail({ item }: { item: HelpCase }) {
  const category = getHelpCategory(item.category);
  const progress = helpProgress(item);
  const actionAllowed = item.actionUrl && (item.category !== "zbierky" || item.verified);
  const schema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: item.title,
    description: item.excerpt,
    datePublished: item.publishedAt,
    dateModified: item.updatedAt,
    url: `https://psipedia.sk${helpCaseHref(item)}`,
    author: { "@type": "Organization", name: item.organization },
    image: item.imageUrl ? `https://psipedia.sk${item.imageUrl}` : undefined,
  };
  return (
    <main id="obsah">
      <header className={`help-detail-hero${item.urgent && !item.resolved ? " is-urgent" : ""}`}><div className="shell"><nav className="article-breadcrumbs" aria-label="Navigácia"><Link href="/">Domov</Link><span>/</span><Link href="/pomoc-psom">Pomoc psom</Link><span>/</span><Link href={`/pomoc-psom/${item.category}`}>{category?.label}</Link><span>/</span><span>{item.title}</span></nav><div className="help-detail-hero-grid"><div><div className="help-detail-tags"><span>{category?.singular}</span>{item.verified && <b>✓ Overené</b>}{item.urgent && !item.resolved && <b className="is-urgent">Urgentné</b>}{item.resolved && <b className="is-resolved">Prípad je vybavený</b>}</div><h1>{item.title}</h1><p>{item.excerpt}</p><div className="help-detail-location"><span aria-hidden="true">📍</span><strong>{item.city}</strong><span>{item.region}</span></div></div><div className="help-detail-visual">{item.imageUrl ? <img src={item.imageUrl} alt={item.dogName ? `${item.dogName} – ${item.title}` : item.title} /> : <span aria-hidden="true">{category?.icon ?? "🐾"}</span>}</div></div></div></header>

      <section className="section shell help-detail-layout">
        <article className="help-detail-copy"><span className="eyebrow">Overené informácie</span><h2>O prípade</h2>{paragraphs(item.description).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}{item.contactNote && <div className="help-contact-note"><strong>Dôležité pred kontaktovaním</strong><p>{item.contactNote}</p></div>}</article>
        <aside className="help-detail-facts"><h2>Praktické informácie</h2><dl><div><dt>Zodpovedá</dt><dd>{item.organization}</dd></div><div><dt>Lokalita</dt><dd>{item.locationNote && <>{item.locationNote}<br /></>}{item.city}, {item.region}</dd></div>{item.dogName && <div><dt>Meno psa</dt><dd>{item.dogName}</dd></div>}{item.breed && <div><dt>Plemeno / typ</dt><dd>{item.breed}</dd></div>}{item.ageNote && <div><dt>Vek</dt><dd>{item.ageNote}</dd></div>}{item.reportedDate && <div><dt>Dátum prípadu</dt><dd>{formatHelpDate(item.reportedDate)}</dd></div>}{item.deadlineDate && <div><dt>Termín pomoci</dt><dd>{formatHelpDate(item.deadlineDate)}</dd></div>}</dl>
          {progress !== null && <div className="help-detail-progress"><div className="help-progress-numbers"><span>Vyzbierané <strong>{formatHelpAmount(item.raisedAmount ?? 0)}</strong></span><span>Cieľ <strong>{formatHelpAmount(item.goalAmount)}</strong></span></div><div><span style={{ width: `${progress}%` }} /></div><small>{progress} % cieľa</small></div>}
          {actionAllowed && !item.resolved && <a className="button button--primary" href={item.actionUrl ?? undefined} target="_blank" rel="noreferrer">{item.actionLabel} ↗</a>}
          {item.resolved && <p className="help-resolved-note">✓ Tento prípad už nepotrebuje ďalšiu pomoc.</p>}
          {!item.verified && item.category === "zbierky" && <p className="help-unverified-note">Odkaz na zbierku sa zobrazí až po redakčnom overení.</p>}
        </aside>
      </section>
      <section className="section section--tint"><div className="shell help-safety-note"><span aria-hidden="true">🛡️</span><div><h2>Pomáhaj bezpečne</h2><p>Peniaze posielaj iba cez uvedený overený odkaz. Pri osobnom kontakte si potvrď totožnosť organizácie a nikdy nevstupuj do nebezpečnej situácie.</p></div><Link className="text-link" href="/zasady-obsahu">Ako overujeme obsah →</Link></div></section>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, "\\u003c") }} />
    </main>
  );
}
