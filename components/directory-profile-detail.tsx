import { PublicHeading } from "@/components/public-heading";
import type { ReactNode } from "react";
import Link from "next/link";
import { Breadcrumbs } from "@/components/page-system";
import { ImageDisplay } from "@/components/image-display";
import { responsiveMediaSrcSet } from "@/lib/responsive-media";
import { PublicFoundation, PublicMediaFallback, PublicPhotoGallery } from "@/components/public-visual-system";
import { DirectoryContactForm } from "@/components/directory-contact-form";
import { DirectoryServicesList } from "@/components/directory-services-list";
import { DirectoryOpeningHours } from "@/components/directory-opening-hours";
import { ProfileReviewSection } from "@/components/profile-review-section";
import { RelatedBreedList } from "@/components/related-entity-list";
import type { BreederPublicLink } from "@/lib/breeder-profile-relations";
import { RelatedEntityLinks } from "@/components/related-entity-links";
import { PublicLocationMap } from "@/components/map/public-location-map";
import { buildGoogleMapsDirectionsUrl, isApproximateMapItem } from "@/lib/map-public-ui";
import type { PublicEntityMapResult } from "@/lib/map-query";
import type { PublicMapRuntime } from "@/lib/public-map-runtime";
import {
  DetailHero,
  DetailHeroActions,
  DetailOptionGrid,
  DetailParagraphs,
  DetailSection,
  DetailContactsCard,
  PublicDetailLayout,
  PublicDetailFlow,
} from "@/components/detail-primitives/detail-primitives";
import { directoryProfileCategoryLabels, getDirectoryCategory } from "@/lib/directory";
import {
  formatDirectoryUpdatedAt,
  type DirectoryDetailPresentation,
} from "@/lib/directory-detail-presentation";
import type { PublicProfileReviewData } from "@/lib/profile-review-read";
import type { PublicRelatedBreed } from "@/lib/content-relations";
import type { InternalDiscoveryLink } from "@/lib/internal-discovery";
import styles from "./directory-profile-detail.module.css";
import { isDuplicatedDirectoryDescription } from "@/lib/directory-description-dedupe";

type DetailRow = { label: string; value: ReactNode };

function DirectoryProfileHero({
  presentation,
  categoryLabels,
  commercial,
  navigationHref,
  showExcerpt,
}: {
  presentation: DirectoryDetailPresentation;
  categoryLabels: string[];
  commercial?: { premium: boolean; promoted: boolean; sponsoredLabel: string | null };
  navigationHref: string | null;
  showExcerpt: boolean;
}) {
  const hasLocation = Boolean(presentation.city || presentation.district || presentation.region);
  return (
    <DetailHero
      kind="directory"
      mediaPresentation="compact"
      breadcrumbs={
        <Breadcrumbs label="Drobečková navigácia">
          <Link href="/">Domov</Link>
          <span aria-hidden="true">/</span>
          <Link href="/adresar">Služby pre psov</Link>
          <span aria-hidden="true">/</span>
          <Link href={"/adresar/" + presentation.category}>
            {getDirectoryCategory(presentation.category)?.label}
          </Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{presentation.name}</span>
        </Breadcrumbs>
      }
      media={
        presentation.imageUrl ? (
          <ImageDisplay
            fallbackOnError
            context="detail"
            roleHint="generic"
            config={presentation.detailImageDisplay}
            src={presentation.imageUrl}
            alt={presentation.imageAlt || "Fotografia služby " + presentation.name}
            srcSet={responsiveMediaSrcSet(presentation.imageUrl, [480, 640, 960, 1280, 1600])}
            sizes="(max-width: 760px) 100vw, 50vw"
            loading="eager"
            fetchPriority="high"
            decoding="async"
          />
        ) : (
          <PublicMediaFallback
            size="detail"
            label={`Fotografia služby ${presentation.name} zatiaľ nie je pridaná`}
          />
        )
      }
      copy={
        <>
          <div className={styles.badges}>
            {categoryLabels.map((label) => (
              <span className={styles.categoryBadge} key={label}>{label}</span>
            ))}
            {presentation.featured ? (
              <span className={styles.featuredBadge}>Odporúčame</span>
            ) : null}
            {commercial?.premium ? (
              <span className={styles.premiumBadge} title="Platené rozšírenie profilu.">
                Premium profil
              </span>
            ) : null}
            {commercial?.promoted ? (
              <span className={styles.sponsoredBadge}>
                {commercial.sponsoredLabel ?? "Sponzorované"}
              </span>
            ) : null}
          </div>
          <PublicHeading
            role="page"
            as="h1"
            data-long-title={presentation.name.length >= 70 ? "" : undefined}
          >
            {presentation.name}
          </PublicHeading>
          {hasLocation ? (
            <p className={styles.heroLocation}>
              {presentation.city ? <strong>{presentation.city}</strong> : null}
              {presentation.district ? <span>okres {presentation.district}</span> : null}
              {presentation.region ? <span>{presentation.region}</span> : null}
            </p>
          ) : null}
          {showExcerpt && presentation.excerpt ? (
            <p className={styles.heroLead}>{presentation.excerpt}</p>
          ) : null}
          <DetailHeroActions className={styles.heroActions} label="Akcie profilu">
            <a className={styles.primaryAction} data-profile-primary-action href="#kontakt">
              Poslať dopyt
            </a>
            {presentation.phone?.href ? (
              <a className={styles.secondaryAction} href={presentation.phone.href}>
                Zavolať
              </a>
            ) : null}
            {navigationHref ? (
              <a
                className={styles.secondaryAction}
                href={navigationHref}
                target="_blank"
                rel="noreferrer"
              >
                Navigovať
              </a>
            ) : null}
          </DetailHeroActions>
        </>
      }
    />
  );
}

export function DirectoryProfileDetail({
  presentation,
  reviews,
  reviewReadError = false,
  commercial,
  publicMap,
  relatedBreeds = [],
  relatedClubs = [],
  locationDiscoveryLinks = [],
  management,
}: {
  presentation: DirectoryDetailPresentation;
  reviews: PublicProfileReviewData | null;
  reviewReadError?: boolean;
  commercial?: { premium: boolean; promoted: boolean; sponsoredLabel: string | null };
  publicMap?: PublicEntityMapResult & PublicMapRuntime;
  relatedBreeds?: PublicRelatedBreed[];
  relatedClubs?: BreederPublicLink[];
  locationDiscoveryLinks?: InternalDiscoveryLink[];
  management?: ReactNode;
}) {
  const mapItem = publicMap?.items[0];
  // Exactly the same GEO gate as PublicLocationMap: no directions for approximate points.
  const navigationHref =
    mapItem && !isApproximateMapItem(mapItem)
      ? buildGoogleMapsDirectionsUrl(mapItem.latitude, mapItem.longitude, mapItem.googlePlaceId)
      : null;

  const practicalRows: DetailRow[] = [
    ...(presentation.address ? [{ label: "Adresa", value: presentation.address }] : []),
    ...(presentation.city ? [{ label: "Mesto / obec", value: presentation.city }] : []),
    ...(presentation.district ? [{ label: "Okres", value: presentation.district }] : []),
    ...(presentation.region ? [{ label: "Kraj", value: presentation.region }] : []),
    ...(presentation.coverage ? [{ label: "Oblasť pôsobenia", value: presentation.coverage }] : []),
    ...(presentation.phone
      ? [
          {
            label: "Telefón",
            value: presentation.phone.href
              ? <a href={presentation.phone.href}>{presentation.phone.value}</a>
              : presentation.phone.value,
          },
        ]
      : []),
    ...(presentation.emails.length
      ? [
          {
            label: "E-mail",
            value: (
              <span className={styles.contactValues}>
                {presentation.emails.map((email) => (
                  email.href
                    ? <a href={email.href} key={email.value}>{email.value}</a>
                    : <span key={email.value}>{email.value}</span>
                ))}
              </span>
            ),
          },
        ]
      : []),
    ...(presentation.websiteText
      ? [
          {
            label: "Web",
            value: presentation.websiteUrl
              ? <a href={presentation.websiteUrl} target="_blank" rel="noreferrer">Otvoriť web ↗</a>
              : presentation.websiteText,
          },
        ]
      : []),
    ...(presentation.facebookText
      ? [
          {
            label: "Facebook",
            value: presentation.facebookUrl
              ? <a href={presentation.facebookUrl} target="_blank" rel="noreferrer">Facebook ↗</a>
              : presentation.facebookText,
          },
        ]
      : []),
    ...(presentation.instagramText
      ? [
          {
            label: "Instagram",
            value: presentation.instagramUrl
              ? <a href={presentation.instagramUrl} target="_blank" rel="noreferrer">Instagram ↗</a>
              : presentation.instagramText,
          },
        ]
      : []),
  ];
  const updatedAt = formatDirectoryUpdatedAt(presentation.updatedAt);
  // Keep factual specialties in their structured rows; suppress an identical
  // qualification label rather than repeating it in the same section.
  const factValues = new Set(
    presentation.facts.map((fact) => fact.value.trim().toLocaleLowerCase("sk")),
  );
  const isBreeder = presentation.category === "chovatelske-stanice";
  const isPhysiotherapy = presentation.category === "fyzioterapia";
  const hasNamedLinks = isBreeder || presentation.category === "treneri";
  // Older imported records split prose at semicolons. Join only clear
  // lowercase continuations; do not render half a sentence as its own tag.
  const visibleQualifications = presentation.qualifications.reduce<string[]>((items, raw) => {
    const qualification = raw.trim();
    if (!qualification || factValues.has(qualification.toLocaleLowerCase("sk"))) return items;
    if (hasNamedLinks && relatedBreeds.length && /^plemen[oa]:/i.test(qualification)) return items;
    if (hasNamedLinks && relatedClubs.length && /^(klub|chovateľský klub):/i.test(qualification)) return items;
    if (hasNamedLinks && relatedClubs.some(club =>
      club.name.trim().toLocaleLowerCase("sk") === qualification.toLocaleLowerCase("sk"))) return items;
    if (items.length && /^\p{Ll}/u.test(qualification)) {
      items[items.length - 1] += "; " + qualification;
    } else if (!items.some(item => item.toLocaleLowerCase("sk") === qualification.toLocaleLowerCase("sk"))) {
      items.push(qualification);
    }
    return items;
  }, []);
  const expertFacts = presentation.facts.filter(fact =>
    !(hasNamedLinks && relatedBreeds.length > 0 && (fact.label === "Plemeno" || fact.label === "Plemená")) &&
    !(hasNamedLinks && relatedClubs.length > 0 && fact.label === "Klub"));
  const breederLinkFacts: Array<{ label: string; value: ReactNode }> = hasNamedLinks ? [
    ...(relatedBreeds.length ? [{
      label: relatedBreeds.length > 1 ? "Plemená" : "Plemeno",
      value: <span className={styles.expertLinks}>
        {relatedBreeds.map(breed => <Link key={breed.id} href={breed.href}>{breed.name}</Link>)}
      </span>,
    }] : []),
    ...(relatedClubs.length ? [{
      label: relatedClubs.length > 1 ? "Chovateľské kluby" : "Chovateľský klub",
      value: <span className={styles.expertLinks}>
        {relatedClubs.map(club => <Link key={club.id} href={club.href}>{club.name}</Link>)}
      </span>,
    }] : []),
  ] : [];
  const hasExpertise =
    expertFacts.length > 0 || breederLinkFacts.length > 0 ||
    visibleQualifications.length > 0 ||
    Boolean(!isPhysiotherapy && presentation.priceNote);
  // Keep editorial fields independent; hide the hero excerpt when it exactly
  // duplicates the long description in the “O službe” section.
  const hasExtendedDescription = Boolean(presentation.description?.trim());

  const profileGallery = (presentation.galleryUrls ?? []).filter((url) => url && url !== presentation.imageUrl);

  const blocks = [
    {
      key: "intro",
      column: "main" as const,
      content: hasExtendedDescription ? (
        <DetailSection compactHeading eyebrow="Predstavenie" title="O službe">
          <DetailParagraphs value={presentation.description} />
        </DetailSection>
      ) : null,
    },
    {
      key: "contact",
      column: "aside" as const,
      content: (
        <DetailContactsCard
          id="directory-profile-contact"
          title="Adresa a kontakt"
          noteTone="neutral"
          contacts={practicalRows}
          note={
            <>
              {!presentation.phone && !presentation.emails.length && !presentation.websiteText ? (
                <span data-public-contact-empty>Priamy kontakt zatiaľ nie je uvedený. </span>
              ) : null}
              {updatedAt ? (
                <span>
                  <time dateTime={presentation.updatedAt}>{updatedAt}</time>
                </span>
              ) : null}
            </>
          }
        />
      ),
    },
    {
      key: "expertise",
      column: "aside" as const,
      content: hasExpertise ? (
        <DetailSection
          compactHeading
          eyebrow={isPhysiotherapy ? "Odborný profil" : "Zameranie"}
          title={isPhysiotherapy ? "Odbornosť a skúsenosti" : presentation.health?.title ?? "Odborné informácie"}
        >
          {expertFacts.length || breederLinkFacts.length
            ? <DetailOptionGrid options={[...expertFacts, ...breederLinkFacts]} /> : null}
          {visibleQualifications.length > 0 ? (
            isPhysiotherapy ? (
              <DetailParagraphs value={visibleQualifications.join("\n")} />
            ) : (
              <div className={styles.qualifications}>
                <h3>Odbornosť a skúsenosti</h3>
                <ul className={styles.qualificationsList}>
                  {visibleQualifications.slice(0, 4).map((qualification) => (
                    <li key={qualification}>{qualification}</li>
                  ))}
                </ul>
                {visibleQualifications.length > 4 ? (
                  <details className={styles.moreQualifications}>
                    <summary>Ďalšie informácie ({visibleQualifications.length - 4})</summary>
                    <ul className={styles.qualificationsList}>
                      {visibleQualifications.slice(4).map(qualification => (
                        <li key={qualification}>{qualification}</li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </div>
            )
          ) : null}
          {presentation.priceNote && !isPhysiotherapy ? (
            <div className={styles.priceNote}>
              <strong>Cena / cenník</strong>
              <p>{presentation.priceNote}</p>
            </div>
          ) : null}
        </DetailSection>
      ) : null,
    },
    {
      key: "physio-price",
      column: "aside" as const,
      content: isPhysiotherapy && presentation.priceNote ? (
        <DetailSection compactHeading eyebrow="Cenník" title="Orientačná cena">
          <DetailParagraphs value={presentation.priceNote} />
        </DetailSection>
      ) : null,
    },
    {
      key: "services",
      column: "main" as const,
      content:
        presentation.services.length > 0 ? (
          <DetailSection compactHeading eyebrow="Ponuka" title="Poskytované služby">
            <DirectoryServicesList services={presentation.services} />
          </DetailSection>
        ) : null,
    },
    {
      key: "hours",
      column: "aside" as const,
      content: presentation.openingHours ? (
        <DirectoryOpeningHours value={presentation.openingHours} />
      ) : null,
    },
    {
      key: "map",
      column: "aside" as const,
      content: publicMap?.items.length ? (
        <div className={styles.mapPosition}>
          <PublicLocationMap
            compactHeading
            title="Kde nás nájdete"
            items={publicMap.items}
            attribution={publicMap.attribution}
            googleApiKey={publicMap.googleApiKey}
            googleMapId={publicMap.googleMapId}
            rendererEnabled={publicMap.rendererEnabled}
            testRendererEnvironment={publicMap.testRendererEnvironment}
          />
        </div>
      ) : null,
    },
    {
      key: "sources",
      column: "main" as const,
      content: presentation.sources?.length ? (
        <DetailSection compactHeading title="Zdroje informácií">
          <ul>
            {presentation.sources.map((source) => (
              <li key={source}>{source}</li>
            ))}
          </ul>
        </DetailSection>
      ) : null,
    },
    {
      key: "profile-gallery",
      column: "main" as const,
      content: profileGallery.length ? (
        <DetailSection compactHeading eyebrow="Fotografie" title="Galéria">
          <PublicPhotoGallery
            label={`Fotografie profilu ${presentation.name}`}
            images={profileGallery.map((src, index) => ({
              src,
              alt: `${presentation.name} – fotografia ${index + 1}`,
            }))}
          />
        </DetailSection>
      ) : null,
    },
    {
      key: "reviews",
      column: "main" as const,
      content: (
        <ProfileReviewSection
          compactHeading
          data={reviews}
          baseHref={"/adresar/" + presentation.category + "/" + presentation.slug}
          readError={reviewReadError}
        />
      ),
    },
    {
      key: "nearby",
      column: "main" as const,
      content:
        locationDiscoveryLinks.length > 0 ? (
          <DetailSection compactHeading eyebrow="Ďalšie v okolí" title="Ďalšie profily v lokalite">
            <RelatedEntityLinks links={locationDiscoveryLinks} label="Ďalšie profily v lokalite" />
          </DetailSection>
        ) : null,
    },
    {
      key: "breeds",
      column: "main" as const,
      content:
        !hasNamedLinks && relatedBreeds.length > 0 ? (
          <DetailSection
            compactHeading
            eyebrow="Súvisiace plemená"
            title="Plemená prepojené s týmto profilom"
          >
            <RelatedBreedList breeds={relatedBreeds} label="Plemená prepojené s týmto profilom" />
          </DetailSection>
        ) : null,
    },
  ];

  return (
    <main id="obsah" className={styles.page}>
      <PublicFoundation data-public-service-detail-template="shared-event-service">
      <DirectoryProfileHero
        presentation={presentation}
        categoryLabels={directoryProfileCategoryLabels(presentation)}
        commercial={commercial}
        navigationHref={navigationHref}
        showExcerpt={!isDuplicatedDirectoryDescription(presentation.excerpt, presentation.description)}
      />
      <PublicDetailFlow blocks={blocks} className={styles.layout} />

      <PublicDetailLayout
        className={styles.enquiryLayout}
        aside={management}
        asideLabel="Správa a oprava profilu"
      >
        <section className={styles.enquiry} id="kontakt">
          <DirectoryContactForm profileId={presentation.id} profileName={presentation.name} />
        </section>
      </PublicDetailLayout>
      </PublicFoundation>
    </main>
  );
}
