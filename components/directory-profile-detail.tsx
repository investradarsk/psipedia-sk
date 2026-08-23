import Link from "next/link";
import { DirectoryContactForm } from "@/components/directory-contact-form";
import { getDirectoryCategory, type PublicDirectoryProfile } from "@/lib/directory";

function paragraphs(value: string) {
  return value.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
}

export function DirectoryProfileDetail({ profile }: { profile: PublicDirectoryProfile }) {
  const category = getDirectoryCategory(profile.category);
  const schema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: profile.name,
    description: profile.excerpt,
    url: `https://psipedia.sk/adresar/${profile.category}/${profile.slug}`,
    areaServed: profile.online ? [profile.region, "Online"] : profile.region,
    address: profile.address ? { "@type": "PostalAddress", streetAddress: profile.address, addressLocality: profile.city, addressRegion: profile.region, addressCountry: "SK" } : undefined,
    image: profile.imageUrl ? `https://psipedia.sk${profile.imageUrl}` : undefined,
  };

  return (
    <main id="obsah">
      <header className="directory-detail-hero">
        <div className="shell">
          <nav className="article-breadcrumbs" aria-label="Navigácia"><Link href="/">Domov</Link><span>/</span><Link href="/adresar">Adresár</Link><span>/</span><Link href={`/adresar/${profile.category}`}>{category?.label}</Link><span>/</span><span>{profile.name}</span></nav>
          <div className="directory-detail-hero-grid">
            <div>
              <div className="directory-detail-tags"><span>{category?.singular}</span>{profile.verified && <b>✓ Overený profil</b>}{profile.featured && <b>Odporúčame</b>}</div>
              <h1>{profile.name}</h1>
              <p>{profile.excerpt}</p>
              <div className="directory-detail-location"><span aria-hidden="true">📍</span><strong>{profile.city}</strong><span>{profile.region}{profile.online ? " · služby aj online" : ""}</span></div>
            </div>
            <div className="directory-detail-visual">{profile.imageUrl ? <img src={profile.imageUrl} alt={`Profil ${profile.name}`} /> : <span aria-hidden="true">{category?.icon ?? "🐾"}</span>}</div>
          </div>
        </div>
      </header>

      <section className="section shell directory-detail-layout">
        <article className="directory-detail-copy">
          <span className="eyebrow">O profile</span><h2>Čo ponúka</h2>
          {paragraphs(profile.description).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          {profile.services.length > 0 && <section className="directory-detail-services"><h3>Služby a zameranie</h3><ul>{profile.services.map((service) => <li key={service}><span aria-hidden="true">✓</span>{service}</li>)}</ul></section>}
          {profile.qualifications.length > 0 && <section className="directory-detail-qualifications"><h3>Skúsenosti a kvalifikácie</h3><ul>{profile.qualifications.map((item) => <li key={item}>{item}</li>)}</ul></section>}
        </article>
        <aside className="directory-detail-facts">
          <h2>Praktické informácie</h2>
          <dl><div><dt>Kategória</dt><dd>{category?.label}</dd></div><div><dt>Lokalita</dt><dd>{profile.address && <>{profile.address}<br /></>}{profile.city}, {profile.region}</dd></div><div><dt>Online</dt><dd>{profile.online ? "Áno" : "Nie"}</dd></div>{profile.priceNote && <div><dt>Cena</dt><dd>{profile.priceNote}</dd></div>}</dl>
          {profile.websiteUrl && <a className="text-link" href={profile.websiteUrl} target="_blank" rel="noreferrer">Navštíviť web ↗</a>}
          <a className="button button--primary" href="#kontakt">Kontaktovať cez Psipediu</a>
        </aside>
      </section>

      <section className="section section--tint" id="kontakt"><div className="shell directory-contact-shell"><DirectoryContactForm profileId={profile.id} profileName={profile.name} /></div></section>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, "\\u003c") }} />
    </main>
  );
}
