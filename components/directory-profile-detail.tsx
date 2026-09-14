import Link from "next/link";
import { DirectoryContactForm } from "@/components/directory-contact-form";
import {
  DetailContactsCard,
  DetailFactsCard,
  DetailParagraphs,
  DetailSection,
} from "@/components/detail-primitives/detail-primitives";
import { Breadcrumbs, MediaFrame } from "@/components/page-system";
import { getDirectoryCategory } from "@/lib/directory";
import type { DirectoryDetailPresentation } from "@/lib/directory-detail-presentation";
import styles from "./directory-profile-detail.module.css";

export function DirectoryProfileDetail({ presentation }: { presentation: DirectoryDetailPresentation }) {
  const category = getDirectoryCategory(presentation.category);
  const hasHeroLocation = Boolean(
    presentation.city || presentation.district || presentation.region || presentation.online,
  );

  const contacts = [
    ...(presentation.phone
      ? [{ label: "Telefón", value: <a href={presentation.phone.href}>{presentation.phone.value}</a> }]
      : []),
    ...(presentation.emails.length > 0
      ? [{
          label: "E-mail",
          value: (
            <span className={styles.contactValues}>
              {presentation.emails.map((email) => <a href={email.href} key={email.value}>{email.value}</a>)}
            </span>
          ),
        }]
      : []),
    ...(presentation.websiteUrl
      ? [{ label: "Web", value: <a href={presentation.websiteUrl} target="_blank" rel="noreferrer">Otvoriť web ↗</a> }]
      : []),
    ...(presentation.facebookUrl
      ? [{ label: "Facebook", value: <a href={presentation.facebookUrl} target="_blank" rel="noreferrer">Facebook ↗</a> }]
      : []),
    ...(presentation.instagramUrl
      ? [{ label: "Instagram", value: <a href={presentation.instagramUrl} target="_blank" rel="noreferrer">Instagram ↗</a> }]
      : []),
    ...(presentation.navigationUrl
      ? [{ label: "Navigácia", value: <a href={presentation.navigationUrl} target="_blank" rel="noreferrer">Otvoriť mapu ↗</a> }]
      : []),
  ];

  const practicalFacts = [
    presentation.address ? { label: "Adresa", value: presentation.address } : null,
    presentation.city ? { label: "Mesto / obec", value: presentation.city } : null,
    presentation.district ? { label: "Okres", value: presentation.district } : null,
    presentation.region ? { label: "Kraj", value: presentation.region } : null,
    presentation.coverage ? { label: "Pokrytie", value: presentation.coverage } : null,
    presentation.online ? { label: "Online", value: "Služba dostupná aj online" } : null,
    presentation.priceNote ? { label: "Cena", value: presentation.priceNote } : null,
  ];

  return (
    <main id="obsah" className={styles.page}>
      <header className={styles.hero}>
        <div className={`shell ${styles.heroShell}`}>
          <Breadcrumbs>
            <Link href="/">Domov</Link>
            <span>/</span>
            <Link href="/adresar">Služby pre psov</Link>
            <span>/</span>
            <Link href={`/adresar/${presentation.category}`}>{category?.label}</Link>
            <span>/</span>
            <span>{presentation.name}</span>
          </Breadcrumbs>

          <div className={`${styles.heroGrid} ${presentation.imageUrl ? "" : styles.heroGridNoMedia}`}>
            <div className={styles.heroCopy}>
              <div className={styles.badges}>
                <span className={styles.categoryBadge}>{category?.singular ?? category?.label}</span>
                {presentation.verified && <span className={styles.verifiedBadge}><span aria-hidden="true">✓</span> Overený profil</span>}
                {presentation.featured && <span className={styles.featuredBadge}><span aria-hidden="true">★</span> Odporúčame</span>}
              </div>

              <h1>{presentation.name}</h1>
              {presentation.excerpt && <p className={styles.lead}>{presentation.excerpt}</p>}

              {hasHeroLocation && (
                <div className={styles.locationLine} aria-label="Lokalita a dostupnosť">
                  <span className={styles.locationIcon} aria-hidden="true">●</span>
                  {presentation.city && <strong>{presentation.city}</strong>}
                  {presentation.district && <span>okres {presentation.district}</span>}
                  {presentation.region && (
                    <Link href={`/adresar/${presentation.category}?region=${encodeURIComponent(presentation.region)}`}>
                      {presentation.region}
                    </Link>
                  )}
                  {presentation.online && <span className={styles.onlineBadge}>aj online</span>}
                </div>
              )}

              <div className={styles.heroActions}>
                <a className={styles.primaryAction} href="#kontakt">Poslať dopyt</a>
                {presentation.phone && <a className={styles.secondaryAction} href={presentation.phone.href}>Zavolať</a>}
                {presentation.websiteUrl && <a className={styles.secondaryAction} href={presentation.websiteUrl} target="_blank" rel="noreferrer">Web ↗</a>}
                {presentation.navigationUrl && <a className={styles.secondaryAction} href={presentation.navigationUrl} target="_blank" rel="noreferrer">Navigovať ↗</a>}
              </div>
            </div>

            {presentation.imageUrl && (
              <MediaFrame className={styles.heroMedia} variant="landscape">
                <img src={presentation.imageUrl} alt={`Fotografia služby ${presentation.name}`} />
              </MediaFrame>
            )}
          </div>
        </div>
      </header>

      <section className={`shell ${styles.contentGrid}`}>
        <article className={styles.article}>
          {presentation.description && (
            <DetailSection eyebrow="Profil služby" title="O službe">
              <DetailParagraphs value={presentation.description} />
            </DetailSection>
          )}

          {presentation.services.length > 0 && (
            <DetailSection eyebrow="Ponuka" title="Služby">
              <ul className={styles.servicesList}>
                {presentation.services.map((service) => (
                  <li key={service}><span aria-hidden="true">✓</span><span>{service}</span></li>
                ))}
              </ul>
            </DetailSection>
          )}

          {presentation.qualifications.length > 0 && (
            <DetailSection eyebrow="Skúsenosti" title="Kvalifikácie a zameranie">
              <ul className={styles.qualificationsList}>
                {presentation.qualifications.map((qualification) => <li key={qualification}>{qualification}</li>)}
              </ul>
            </DetailSection>
          )}
        </article>

        <aside className={styles.sidebar} aria-label="Kontaktné a praktické informácie">
          <DetailContactsCard title="Kontakt" contacts={contacts} />
          <DetailFactsCard title="Praktické informácie" facts={practicalFacts} />
          <DetailFactsCard title="Odborné údaje" facts={presentation.facts} />
        </aside>
      </section>

      <section className={`shell ${styles.ownerBox}`}>
        <div className={styles.ownerCopy}>
          <span className={styles.ownerIcon} aria-hidden="true">✎</span>
          <div>
            <strong>Ste majiteľom tohto profilu?</strong>
            <p>Doplňte alebo opravte údaje o svojej službe.</p>
          </div>
        </div>
        <Link href={`/adresar/${presentation.category}/${presentation.slug}/upravit`}>Navrhnúť úpravu profilu</Link>
      </section>

      <section className={styles.contactSection} id="kontakt">
        <div className={`shell ${styles.contactShell}`}>
          <DirectoryContactForm profileId={presentation.id} profileName={presentation.name} />
        </div>
      </section>
    </main>
  );
}
