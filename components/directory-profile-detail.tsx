import Link from "next/link";
import { DirectoryContactForm } from "@/components/directory-contact-form";
import { ProfileReviewSection } from "@/components/profile-review-section";
import { RelatedBreedList } from "@/components/related-entity-list";
import { RelatedEntityLinks } from "@/components/related-entity-links";
import { PublicLocationMap } from "@/components/map/public-location-map";
import type { PublicEntityMapResult } from "@/lib/map-query";
import type { PublicMapRuntime } from "@/lib/public-map-runtime";
import {
  DetailContactsCard,
  DetailFactsCard,
  DetailOptionGrid,
  DetailParagraphs,
  DetailSection,
} from "@/components/detail-primitives/detail-primitives";
import { PublicProfileContentLayout, PublicProfileHero } from "@/components/public-profile/public-profile-hero";
import { getDirectoryCategory } from "@/lib/directory";
import { getDirectoryQuickFacts, type DirectoryDetailPresentation } from "@/lib/directory-detail-presentation";
import type { PublicProfileReviewData } from "@/lib/profile-review-read";
import type { PublicRelatedBreed } from "@/lib/content-relations";
import type { InternalDiscoveryLink } from "@/lib/internal-discovery";
import styles from "./directory-profile-detail.module.css";

export function DirectoryProfileDetail({
  presentation,
  reviews,
  reviewReadError = false,
  commercial,
  publicMap,
  relatedBreeds = [],
  locationDiscoveryLinks = [],
}: {
  presentation: DirectoryDetailPresentation;
  reviews: PublicProfileReviewData | null;
  reviewReadError?: boolean;
  commercial?: { premium: boolean; promoted: boolean; sponsoredLabel: string | null };
  publicMap?: PublicEntityMapResult & PublicMapRuntime;
  relatedBreeds?: PublicRelatedBreed[];
  locationDiscoveryLinks?: InternalDiscoveryLink[];
}) {
  const category = getDirectoryCategory(presentation.category);
  const hasEmbeddedMap = Boolean(publicMap?.items.length);
  const hasHeroLocation = Boolean(
    presentation.city || presentation.district || presentation.region,
  );
  const quickFacts = getDirectoryQuickFacts(
    presentation,
    category?.singular ?? category?.label ?? "Profil adresára",
    relatedBreeds,
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
    presentation.priceNote ? { label: "Cena", value: presentation.priceNote } : null,
  ];

  return (
    <main id="obsah" className={styles.page}>
      <PublicProfileHero
        breadcrumbs={<>
          <Link href="/">Domov</Link><span aria-hidden="true">/</span>
          <Link href="/adresar">Služby pre psov</Link><span aria-hidden="true">/</span>
          <Link href={"/adresar/" + presentation.category}>{category?.label}</Link>
          <span aria-hidden="true">/</span><span aria-current="page">{presentation.name}</span>
        </>}
        typeLabel={category?.singular ?? category?.label ?? "Profil adresára"}
        title={presentation.name}
        lead={presentation.excerpt}
        location={hasHeroLocation ? <>
          {presentation.city ? <strong>{presentation.city}</strong> : null}
          {presentation.district ? <span>okres {presentation.district}</span> : null}
          {presentation.region ? <span>{presentation.region}</span> : null}
        </> : null}
        imageUrl={presentation.imageUrl}
        imageAlt={"Fotografia služby " + presentation.name}
        badges={[
          ...(presentation.featured ? [{ label: "Odporúčame", tone: "featured" as const }] : []),
          ...(commercial?.premium ? [{ label: "Premium profil", tone: "premium" as const, title: "Platené rozšírenie profilu." }] : []),
          ...(commercial?.promoted ? [{ label: commercial.sponsoredLabel ?? "Sponzorované", tone: "sponsored" as const }] : []),
        ]}
        actions={[
          { label: "Poslať dopyt", href: "#kontakt", primary: true },
          ...(presentation.phone ? [{ label: "Zavolať", href: presentation.phone.href }] : []),
          ...(presentation.websiteUrl ? [{ label: "Web ↗", href: presentation.websiteUrl, external: true }] : []),
          ...(!hasEmbeddedMap && presentation.navigationUrl ? [{ label: "Navigovať ↗", href: presentation.navigationUrl, external: true }] : []),
        ]}
      />

      <PublicProfileContentLayout aside={<>
          <DetailContactsCard title="Kontakt" contacts={contacts} />
          <DetailFactsCard title="Praktické informácie" facts={practicalFacts} />
          {!presentation.health && <DetailFactsCard title="Odborné údaje" facts={presentation.facts} />}
      </>}>
        <article className={styles.article}>
          {quickFacts.length > 0 && (
            <section className={styles.quickFacts} aria-labelledby="directory-basic-information">
              <h2 id="directory-basic-information">Základné informácie</h2>
              <dl className={styles.quickFactsList}>
                {quickFacts.map((fact) => (
                  <div key={fact.label}>
                    <dt>{fact.label}</dt>
                    <dd>
                      {fact.dateTime ? (
                        <time dateTime={fact.dateTime}>{fact.value}</time>
                      ) : fact.links ? (
                        <span className={styles.quickFactLinks}>
                          {fact.links.map((link, index) => (
                            <span key={`${link.href}-${link.label}`}>
                              {index > 0 ? ", " : null}
                              <a
                                href={link.href}
                                {...(/^https?:\/\//i.test(link.href) ? { target: "_blank", rel: "noreferrer" } : {})}
                              >
                                {link.label}
                              </a>
                            </span>
                          ))}
                        </span>
                      ) : fact.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

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

          {presentation.health && (
            <DetailSection eyebrow={presentation.health.eyebrow} title={presentation.health.title}>
              <DetailOptionGrid options={presentation.health.facts} />
            </DetailSection>
          )}

          {presentation.qualifications.length > 0 && (
            <DetailSection eyebrow="Skúsenosti" title="Kvalifikácie a zameranie">
              <ul className={styles.qualificationsList}>
                {presentation.qualifications.map((qualification) => <li key={qualification}>{qualification}</li>)}
              </ul>
            </DetailSection>
          )}

          {relatedBreeds.length > 0 ? (
            <DetailSection eyebrow="Súvisiace plemená" title="Plemená prepojené s týmto profilom">
              <RelatedBreedList breeds={relatedBreeds} label="Plemená prepojené s týmto profilom" />
            </DetailSection>
          ) : null}

          {locationDiscoveryLinks.length > 0 ? (
            <DetailSection eyebrow="Ďalšie v okolí" title="Ďalšie profily v lokalite">
              <RelatedEntityLinks links={locationDiscoveryLinks} label="Ďalšie profily v lokalite" />
            </DetailSection>
          ) : null}

          {hasEmbeddedMap && publicMap ? (
            <PublicLocationMap
              title="Kde nás nájdete"
              items={publicMap.items}
              attribution={publicMap.attribution}
              googleApiKey={publicMap.googleApiKey}
              googleMapId={publicMap.googleMapId}
              rendererEnabled={publicMap.rendererEnabled}
              testRendererEnvironment={publicMap.testRendererEnvironment}
            />
          ) : null}

          <ProfileReviewSection
            data={reviews}
            baseHref={`/adresar/${presentation.category}/${presentation.slug}`}
            readError={reviewReadError}
          />
        </article>
      </PublicProfileContentLayout>

      <section className={styles.contactSection} id="kontakt">
        <div className={`shell ${styles.contactShell}`}>
          <DirectoryContactForm profileId={presentation.id} profileName={presentation.name} />
        </div>
      </section>
    </main>
  );
}
