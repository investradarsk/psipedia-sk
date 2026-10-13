import type { ReactNode } from "react";
import Link from "next/link";
import { Breadcrumbs } from "@/components/page-system";
import { ImageDisplay } from "@/components/image-display";
import { DirectoryContactForm } from "@/components/directory-contact-form";
import { ProfileReviewSection } from "@/components/profile-review-section";
import { RelatedBreedList } from "@/components/related-entity-list";
import { RelatedEntityLinks } from "@/components/related-entity-links";
import { PublicLocationMap } from "@/components/map/public-location-map";
import { buildGoogleMapsDirectionsUrl, isApproximateMapItem } from "@/lib/map-public-ui";
import type { PublicEntityMapResult } from "@/lib/map-query";
import type { PublicMapRuntime } from "@/lib/public-map-runtime";
import { DetailOptionGrid, DetailParagraphs, DetailSection } from "@/components/detail-primitives/detail-primitives";
import { getDirectoryCategory } from "@/lib/directory";
import { formatDirectoryUpdatedAt, type DirectoryDetailPresentation } from "@/lib/directory-detail-presentation";
import type { PublicProfileReviewData } from "@/lib/profile-review-read";
import type { PublicRelatedBreed } from "@/lib/content-relations";
import type { InternalDiscoveryLink } from "@/lib/internal-discovery";
import styles from "./directory-profile-detail.module.css";

type DetailRow = { label: string; value: ReactNode };

function DirectoryProfileHero({
  presentation,
  categoryLabel,
  commercial,
  navigationHref,
}: {
  presentation: DirectoryDetailPresentation;
  categoryLabel: string;
  commercial?: { premium: boolean; promoted: boolean; sponsoredLabel: string | null };
  navigationHref: string | null;
}) {
  const hasLocation = Boolean(presentation.city || presentation.district || presentation.region);
  return (
    <header className={styles.hero} data-public-profile-hero data-directory-profile-hero>
      <div className="shell">
        <Breadcrumbs label="Drobečková navigácia">
          <Link href="/">Domov</Link><span aria-hidden="true">/</span>
          <Link href="/adresar">Služby pre psov</Link><span aria-hidden="true">/</span>
          <Link href={"/adresar/" + presentation.category}>{getDirectoryCategory(presentation.category)?.label}</Link>
          <span aria-hidden="true">/</span><span aria-current="page">{presentation.name}</span>
        </Breadcrumbs>

        {presentation.imageUrl ? (
          <div className={styles.heroMedia} data-public-profile-media>
            <ImageDisplay
              context="detail"
              roleHint="generic"
              config={presentation.detailImageDisplay}
              src={presentation.imageUrl}
              alt={"Fotografia služby " + presentation.name}
              loading="eager"
              fetchPriority="high"
              decoding="async"
            />
          </div>
        ) : null}

        <div className={styles.heroCopy}>
          <div className={styles.badges}>
            <span className={styles.categoryBadge}>{categoryLabel}</span>
            {presentation.featured ? <span className={styles.featuredBadge}>Odporúčame</span> : null}
            {commercial?.premium ? <span className={styles.premiumBadge} title="Platené rozšírenie profilu.">Premium profil</span> : null}
            {commercial?.promoted ? <span className={styles.sponsoredBadge}>{commercial.sponsoredLabel ?? "Sponzorované"}</span> : null}
          </div>
          <h1>{presentation.name}</h1>
          {hasLocation ? (
            <p className={styles.heroLocation}>
              {presentation.city ? <strong>{presentation.city}</strong> : null}
              {presentation.district ? <span>okres {presentation.district}</span> : null}
              {presentation.region ? <span>{presentation.region}</span> : null}
            </p>
          ) : null}
          {presentation.excerpt ? <p className={styles.heroLead}>{presentation.excerpt}</p> : null}
          <nav className={styles.heroActions} aria-label="Akcie profilu">
            <a className={styles.primaryAction} data-profile-primary-action href="#kontakt">Poslať dopyt</a>
            {presentation.phone ? <a className={styles.secondaryAction} href={presentation.phone.href}>Zavolať</a> : null}
            {navigationHref ? <a className={styles.secondaryAction} href={navigationHref} target="_blank" rel="noreferrer">Navigovať</a> : null}
            {presentation.websiteUrl ? <a className={styles.secondaryAction} href={presentation.websiteUrl} target="_blank" rel="noreferrer">Web ↗</a> : null}
          </nav>
        </div>
      </div>
    </header>
  );
}

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
  const mapItem = publicMap?.items[0];
  // Exactly the same GEO gate as PublicLocationMap: no directions for approximate points.
  const navigationHref = mapItem && !isApproximateMapItem(mapItem)
    ? buildGoogleMapsDirectionsUrl(mapItem.latitude, mapItem.longitude, mapItem.googlePlaceId)
    : null;

  const practicalRows: DetailRow[] = [
    ...(presentation.address ? [{ label: "Adresa", value: presentation.address }] : []),
    ...(presentation.city ? [{ label: "Mesto / obec", value: presentation.city }] : []),
    ...(presentation.district ? [{ label: "Okres", value: presentation.district }] : []),
    ...(presentation.region ? [{ label: "Kraj", value: presentation.region }] : []),
    ...(presentation.coverage ? [{ label: "Oblasť pôsobenia", value: presentation.coverage }] : []),
    ...(presentation.openingHours ? [{ label: "Ordinačné / otváracie hodiny", value: presentation.openingHours }] : []),
    ...(presentation.phone ? [{ label: "Telefón", value: <a href={presentation.phone.href}>{presentation.phone.value}</a> }] : []),
    ...(presentation.emails.length ? [{
      label: "E-mail",
      value: <span className={styles.contactValues}>
        {presentation.emails.map((email) => <a href={email.href} key={email.value}>{email.value}</a>)}
      </span>,
    }] : []),
    ...(presentation.websiteUrl ? [{
      label: "Web", value: <a href={presentation.websiteUrl} target="_blank" rel="noreferrer">Otvoriť web ↗</a>,
    }] : []),
    ...(presentation.facebookUrl ? [{
      label: "Facebook", value: <a href={presentation.facebookUrl} target="_blank" rel="noreferrer">Facebook ↗</a>,
    }] : []),
    ...(presentation.instagramUrl ? [{
      label: "Instagram", value: <a href={presentation.instagramUrl} target="_blank" rel="noreferrer">Instagram ↗</a>,
    }] : []),
  ];
  const updatedAt = formatDirectoryUpdatedAt(presentation.updatedAt);
  const hasExpertise = presentation.facts.length > 0 || presentation.qualifications.length > 0 || Boolean(presentation.priceNote);
  const hasExtendedDescription = Boolean(
    presentation.description?.trim() && presentation.description.trim() !== presentation.excerpt.trim(),
  );

  return (
    <main id="obsah" className={styles.page}>
      <DirectoryProfileHero
        presentation={presentation}
        categoryLabel={category?.singular ?? category?.label ?? "Profil služby"}
        commercial={commercial}
        navigationHref={navigationHref}
      />
      <article className={"shell " + styles.content} data-public-profile-body>
        {hasExtendedDescription ? (
          <DetailSection eyebrow="Predstavenie" title="O službe">
            <DetailParagraphs value={presentation.description} />
          </DetailSection>
        ) : null}

        {practicalRows.length ? (
          <section className={styles.practical} aria-labelledby="directory-profile-contact" data-public-profile-sidebar>
            <div className={styles.sectionHeader}>
              <span className={styles.eyebrow}>Praktické informácie</span>
              <h2 id="directory-profile-contact">Adresa a kontakt</h2>
            </div>
            <dl className={styles.practicalGrid}>
              {practicalRows.map((row) => (
                <div className={styles.practicalItem} key={row.label}>
                  <dt>{row.label}</dt><dd>{row.value}</dd>
                </div>
              ))}
            </dl>
            {updatedAt ? <p className={styles.updatedAt}>{updatedAt}</p> : null}
          </section>
        ) : null}

        {presentation.services.length > 0 ? (
          <DetailSection eyebrow="Ponuka" title="Poskytované služby">
            <ul className={styles.servicesList}>
              {presentation.services.map((service) => <li key={service}>{service}</li>)}
            </ul>
          </DetailSection>
        ) : null}

        {hasExpertise ? (
          <DetailSection eyebrow="Zameranie" title={presentation.health?.title ?? "Odborné informácie"}>
            {presentation.facts.length > 0 ? <DetailOptionGrid options={presentation.facts} /> : null}
            {presentation.qualifications.length > 0 ? (
              <div className={styles.qualifications}>
                <h3>Skúsenosti a kvalifikácie</h3>
                <ul className={styles.qualificationsList}>
                  {presentation.qualifications.map((qualification) => <li key={qualification}>{qualification}</li>)}
                </ul>
              </div>
            ) : null}
            {presentation.priceNote ? (
              <div className={styles.priceNote}>
                <strong>Cena / cenník</strong>
                <p>{presentation.priceNote}</p>
              </div>
            ) : null}
          </DetailSection>
        ) : null}

        {publicMap?.items.length ? (
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
          baseHref={"/adresar/" + presentation.category + "/" + presentation.slug}
          readError={reviewReadError}
        />

        {locationDiscoveryLinks.length > 0 ? (
          <DetailSection eyebrow="Ďalšie v okolí" title="Ďalšie profily v lokalite">
            <RelatedEntityLinks links={locationDiscoveryLinks} label="Ďalšie profily v lokalite" />
          </DetailSection>
        ) : null}

        {relatedBreeds.length > 0 ? (
          <DetailSection eyebrow="Súvisiace plemená" title="Plemená prepojené s týmto profilom">
            <RelatedBreedList breeds={relatedBreeds} label="Plemená prepojené s týmto profilom" />
          </DetailSection>
        ) : null}
      </article>

      <section className={styles.contactSection} id="kontakt">
        <div className={"shell " + styles.contactShell}>
          <DirectoryContactForm profileId={presentation.id} profileName={presentation.name} />
        </div>
      </section>
    </main>
  );
}
