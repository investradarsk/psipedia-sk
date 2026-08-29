import Link from "next/link";
import { DirectoryContactForm } from "@/components/directory-contact-form";
import { getDirectoryCategory, type DirectoryCategorySlug, type PublicDirectoryProfile } from "@/lib/directory";

function paragraphs(value: string) {
  return value.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
}

function importedValue(profile: PublicDirectoryProfile, ...keys: string[]) {
  for (const key of keys) {
    const value = profile.importData?.[key];
    if (value !== null && value !== undefined && String(value).trim()) return String(value).trim();
  }
  return null;
}

function usefulValue(value: string | null) {
  if (!value) return null;
  return /^(neoveren[eé]|nezisten[eé]|neuveden[eé]|n\/a|nie je uveden[eé])$/i.test(value) ? null : value;
}

function publicUrl(value: string | null) {
  if (!value) return null;
  const candidate = /^https?:\/\//i.test(value) ? value : /^[\w.-]+\.[a-z]{2,}(?:\/|$)/i.test(value) ? `https://${value}` : null;
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

const detailFields: Partial<Record<DirectoryCategorySlug, string[]>> = {
  veterinari: ["Špecializácie", "Pohotovosť", "Hospitalizácia", "RTG", "USG", "Laboratórium"],
  treneri: ["Individuálny výcvik", "Skupinový výcvik", "Výcvik šteniat", "Behaviorálne poradenstvo", "Online konzultácie"],
  "kynologicke-kluby": ["Typ klubu", "Zameranie", "Organizácia", "Výcvik šteniat", "Individuálny výcvik", "Skupinový výcvik", "Športová kynológia", "Obrany", "Stopy", "Agility", "Rally obedience", "Retriever / poľovnícka kynológia"],
  "chovatelske-kluby": ["Plemeno", "Plemená", "FCI skupina", "Organizácia", "Zastrešujúca organizácia"],
  "chovatelske-stanice": ["Plemeno", "Plemená", "FCI skupina", "Aktívny chov", "Aktuálne vrhy", "Plánované vrhy"],
  "hotely-a-opatrovanie": ["Hotel", "Opatrovanie", "Denná starostlivosť", "Vyzdvihnutie psa", "Online objednanie"],
  vencenie: ["Individuálne venčenie", "Skupinové venčenie", "Venčenie s tréningom", "Šteňatá", "Veľké psy", "Seniori / špeciálne potreby", "Vyzdvihnutie psa", "GPS / foto report", "Typ poskytovateľa"],
  fyzioterapia: ["Hydroterapia", "Laserterapia", "Magnetoterapia", "Elektroterapia", "Manuálne techniky", "Dogfitness / prevencia", "Pooperačná rehabilitácia", "Ortopedickí pacienti", "Neurologickí pacienti", "Športové / pracovné psy", "Mobilná služba", "Odborník / certifikácia"],
  "dalsie-sluzby": ["Typ služby", "Pokrytie", "Výjazd ku klientovi", "Celoslovenská dostupnosť", "Orientačná cena"],
};

export function DirectoryProfileDetail({ profile }: { profile: PublicDirectoryProfile }) {
  const category = getDirectoryCategory(profile.category);
  const phone = usefulValue(importedValue(profile, "Telefón", "Telefon", "phone"));
  const rawEmail = usefulValue(importedValue(profile, "E-mail", "Email", "email"));
  const emails = rawEmail?.split(/[;,]/).map((item) => item.trim()).filter((item) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item)) ?? [];
  const website = publicUrl(importedValue(profile, "Web", "Webstránka") ?? profile.websiteUrl);
  const facebook = publicUrl(importedValue(profile, "Facebook"));
  const instagram = publicUrl(importedValue(profile, "Instagram"));
  const phoneHref = phone ? `tel:${phone.replace(/[^+\d]/g, "")}` : null;
  const navigationQuery = [profile.address, profile.city, profile.district, profile.region, "Slovensko"].filter(Boolean).join(", ");
  const navigationUrl = profile.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(navigationQuery)}` : null;
  const facts = (detailFields[profile.category] ?? []).flatMap((label) => {
    const value = usefulValue(importedValue(profile, label));
    return value ? [{ label, value }] : [];
  });
  const coverage = usefulValue(importedValue(profile, "Pokrytie", "Oblasť pôsobenia", "Lokalita / pokrytie"));
  const description = profile.description || profile.excerpt;

  return (
    <main id="obsah">
      <header className="directory-detail-hero"><div className="shell">
        <nav className="article-breadcrumbs" aria-label="Navigácia"><Link href="/">Domov</Link><span>/</span><Link href="/adresar">Služby pre psov</Link><span>/</span><Link href={`/adresar/${profile.category}`}>{category?.label}</Link><span>/</span><span>{profile.name}</span></nav>
        <div className="directory-detail-hero-grid"><div>
          <div className="directory-detail-tags"><span>{category?.singular}</span>{profile.featured && <b>Odporúčame</b>}</div>
          <h1>{profile.name}</h1>
          {profile.excerpt && <p>{profile.excerpt}</p>}
          <div className="directory-detail-location"><span aria-hidden="true">📍</span><strong>{profile.city}</strong>{profile.district && <span>okres {profile.district}</span>}<span>{profile.region}{profile.online ? " · služby aj online" : ""}</span></div>
          {(phoneHref || emails[0] || website || navigationUrl) && <div className="directory-direct-actions">
            {phoneHref && <a href={phoneHref}>Zavolať</a>}{emails[0] && <a href={`mailto:${emails[0]}`}>E-mail</a>}{website && <a href={website} target="_blank" rel="noreferrer">Web ↗</a>}{navigationUrl && <a href={navigationUrl} target="_blank" rel="noreferrer">Navigovať ↗</a>}
          </div>}
        </div><div className="directory-detail-visual">{profile.imageUrl ? <img src={profile.imageUrl} alt={`Profil ${profile.name}`} /> : <span aria-hidden="true">{category?.icon ?? "🐾"}</span>}</div></div>
      </div></header>

      <section className="section shell directory-detail-layout">
        <article className="directory-detail-copy">
          {description && <section><span className="eyebrow">O službe</span><h2>O službe</h2>{paragraphs(description).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</section>}
          {profile.services.length > 0 && <section className="directory-detail-services"><h3>Ponúkané služby</h3><ul>{profile.services.map((service) => <li key={service}><span aria-hidden="true">✓</span>{service}</li>)}</ul></section>}
          {(profile.address || profile.city || coverage || profile.online) && <section className="directory-detail-qualifications"><h3>Lokalita / pokrytie</h3><dl>
            {profile.address && <div><dt>Adresa</dt><dd>{profile.address}</dd></div>}{profile.city && <div><dt>Mesto / obec</dt><dd>{profile.city}</dd></div>}{profile.district && <div><dt>Okres</dt><dd>{profile.district}</dd></div>}{profile.region && <div><dt>Kraj</dt><dd>{profile.region}</dd></div>}{coverage && <div><dt>Pokrytie</dt><dd>{coverage}</dd></div>}{profile.online && <div><dt>Online</dt><dd>Áno</dd></div>}
          </dl></section>}
          {profile.priceNote && <section className="directory-detail-qualifications"><h3>Cenník</h3><p>{profile.priceNote}</p></section>}
          {(profile.qualifications.length > 0 || facts.length > 0) && <section className="directory-detail-qualifications"><h3>Špecializácie / odborné údaje</h3>
            {profile.qualifications.length > 0 && <ul>{profile.qualifications.map((item) => <li key={item}>{item}</li>)}</ul>}{facts.length > 0 && <dl>{facts.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl>}
          </section>}
        </article>
        <aside className="directory-detail-facts"><h2>Kontakty</h2><dl>
          {phone && <div><dt>Telefón</dt><dd><a href={phoneHref ?? undefined}>{phone}</a></dd></div>}{emails.length > 0 && <div><dt>E-mail</dt><dd>{emails.map((email) => <a href={`mailto:${email}`} key={email}>{email}</a>)}</dd></div>}{website && <div><dt>Web</dt><dd><a href={website} target="_blank" rel="noreferrer">Otvoriť web ↗</a></dd></div>}{facebook && <div><dt>Facebook</dt><dd><a href={facebook} target="_blank" rel="noreferrer">Otvoriť Facebook ↗</a></dd></div>}{instagram && <div><dt>Instagram</dt><dd><a href={instagram} target="_blank" rel="noreferrer">Otvoriť Instagram ↗</a></dd></div>}
        </dl>{navigationUrl && <a className="text-link" href={navigationUrl} target="_blank" rel="noreferrer">Navigovať ↗</a>}<a className="button button--primary" href="#kontakt">Poslať dopyt cez Psipediu</a></aside>
      </section>

      <section className="shell directory-owner-box"><div><span aria-hidden="true">✎</span><div><strong>Ste majiteľom tohto profilu?</strong><p>Doplňte alebo opravte údaje o svojej službe.</p></div></div><Link href="/opravy-a-podnety">Navrhnúť úpravu profilu</Link></section>
      <section className="section section--tint" id="kontakt"><div className="shell directory-contact-shell"><DirectoryContactForm profileId={profile.id} profileName={profile.name} /></div></section>
    </main>
  );
}
