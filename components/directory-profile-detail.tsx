import Link from "next/link";
import { DirectoryContactForm } from "@/components/directory-contact-form";
import { Breadcrumbs, MediaFrame, cardShellClassName } from "@/components/page-system";
import { getDirectoryCategory } from "@/lib/directory";
import type { DirectoryDetailPresentation } from "@/lib/directory-detail-presentation";

export function DirectoryProfileDetail({ presentation }: { presentation: DirectoryDetailPresentation }) {
  const category = getDirectoryCategory(presentation.category);
  const firstEmail = presentation.emails[0] ?? null;

  return (
    <main id="obsah">
      <header className="directory-detail-hero"><div className="shell">
        <Breadcrumbs><Link href="/">Domov</Link><span>/</span><Link href="/adresar">Služby pre psov</Link><span>/</span><Link href={`/adresar/${presentation.category}`}>{category?.label}</Link><span>/</span><span>{presentation.name}</span></Breadcrumbs>
        <div className="directory-detail-hero-grid"><div>
          <div className="directory-detail-tags"><span>{category?.singular}</span>{presentation.featured && <b>Odporúčame</b>}</div>
          <h1>{presentation.name}</h1>
          {presentation.excerpt && <p>{presentation.excerpt}</p>}
          <div className="directory-detail-location"><span aria-hidden="true">📍</span><strong>{presentation.city}</strong>{presentation.district && <span>okres {presentation.district}</span>}<Link href={`/adresar/${presentation.category}?region=${encodeURIComponent(presentation.region)}`}>{presentation.region}</Link>{presentation.online && <span>služby aj online</span>}</div>
          {(presentation.phone || firstEmail || presentation.websiteUrl || presentation.navigationUrl) && <div className="directory-direct-actions">
            {presentation.phone && <a href={presentation.phone.href}>Zavolať</a>}{firstEmail && <a href={firstEmail.href}>E-mail</a>}{presentation.websiteUrl && <a href={presentation.websiteUrl} target="_blank" rel="noreferrer">Web ↗</a>}{presentation.navigationUrl && <a href={presentation.navigationUrl} target="_blank" rel="noreferrer">Navigovať ↗</a>}
          </div>}
        </div><MediaFrame className="directory-detail-visual" variant="landscape">{presentation.imageUrl ? <img src={presentation.imageUrl} alt={`Profil ${presentation.name}`} /> : <span aria-hidden="true">{category?.icon ?? "🐾"}</span>}</MediaFrame></div>
      </div></header>

      <section className="section shell directory-detail-layout">
        <article className="directory-detail-copy">
          {presentation.description && <section><span className="eyebrow">O službe</span><h2>O službe</h2>{presentation.descriptionParagraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</section>}
          {presentation.services.length > 0 && <section className="directory-detail-services"><h3>Ponúkané služby</h3><ul>{presentation.services.map((service) => <li key={service}><span aria-hidden="true">✓</span>{service}</li>)}</ul></section>}
          {(presentation.address || presentation.city || presentation.coverage || presentation.online) && <section className="directory-detail-qualifications"><h3>Lokalita / pokrytie</h3><dl>
            {presentation.address && <div><dt>Adresa</dt><dd>{presentation.address}</dd></div>}{presentation.city && <div><dt>Mesto / obec</dt><dd>{presentation.city}</dd></div>}{presentation.district && <div><dt>Okres</dt><dd>{presentation.district}</dd></div>}{presentation.region && <div><dt>Kraj</dt><dd>{presentation.region}</dd></div>}{presentation.coverage && <div><dt>Pokrytie</dt><dd>{presentation.coverage}</dd></div>}{presentation.online && <div><dt>Online</dt><dd>Áno</dd></div>}
          </dl></section>}
          {presentation.priceNote && <section className="directory-detail-qualifications"><h3>Cenník</h3><p>{presentation.priceNote}</p></section>}
          {(presentation.qualifications.length > 0 || presentation.facts.length > 0) && <section className="directory-detail-qualifications"><h3>Špecializácie / odborné údaje</h3>
            {presentation.qualifications.length > 0 && <ul>{presentation.qualifications.map((item) => <li key={item}>{item}</li>)}</ul>}{presentation.facts.length > 0 && <dl>{presentation.facts.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl>}
          </section>}
        </article>
        <aside className={`directory-detail-facts ${cardShellClassName}`}><h2>Kontakty</h2><dl>
          {presentation.phone && <div><dt>Telefón</dt><dd><a href={presentation.phone.href}>{presentation.phone.value}</a></dd></div>}{presentation.emails.length > 0 && <div><dt>E-mail</dt><dd>{presentation.emails.map((email) => <a href={email.href} key={email.value}>{email.value}</a>)}</dd></div>}{presentation.websiteUrl && <div><dt>Web</dt><dd><a href={presentation.websiteUrl} target="_blank" rel="noreferrer">Otvoriť web ↗</a></dd></div>}{presentation.facebookUrl && <div><dt>Facebook</dt><dd><a href={presentation.facebookUrl} target="_blank" rel="noreferrer">Otvoriť Facebook ↗</a></dd></div>}{presentation.instagramUrl && <div><dt>Instagram</dt><dd><a href={presentation.instagramUrl} target="_blank" rel="noreferrer">Otvoriť Instagram ↗</a></dd></div>}
        </dl>{presentation.navigationUrl && <a className="text-link" href={presentation.navigationUrl} target="_blank" rel="noreferrer">Navigovať ↗</a>}<a className="button button--primary" href="#kontakt">Poslať dopyt cez Psipediu</a></aside>
      </section>

      <section className="shell directory-owner-box"><div><span aria-hidden="true">✎</span><div><strong>Ste majiteľom tohto profilu?</strong><p>Doplňte alebo opravte údaje o svojej službe.</p></div></div><Link href={`/adresar/${presentation.category}/${presentation.slug}/upravit`}>Navrhnúť úpravu profilu</Link></section>
      <section className="section section--tint" id="kontakt"><div className="shell directory-contact-shell"><DirectoryContactForm profileId={presentation.id} profileName={presentation.name} /></div></section>
    </main>
  );
}
