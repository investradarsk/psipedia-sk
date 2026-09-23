import Link from "next/link";
import { AdoptionCardMedia } from "@/components/adoption-card-media";
import { ProfileReviewSection } from "@/components/profile-review-section";
import { LocationIcon } from "@/components/help-public-icons";
import {
  DetailActions,
  DetailContactsCard,
  DetailContentLayout,
  DetailFactsCard,
  DetailParagraphs,
  DetailSection,
} from "@/components/detail-primitives/detail-primitives";
import { Breadcrumbs, PageContainer, SectionHero } from "@/components/page-system";
import { adoptionDetailPath } from "@/lib/adoption-detail";
import type { PublicOrganizationComposition } from "@/lib/help-organization-store";
import type { OrganizationPublicAdoption } from "@/lib/organization-adoption-store";
import type { PublicProfileReviewData } from "@/lib/profile-review-read";
import {
  buildOrganizationFundraisingPresentation,
  buildOrganizationProfilePresentation,
} from "@/lib/organization-profile-presentation";
import styles from "./organization-profile-detail.module.css";

function ContactLink({
  href,
  value,
  external,
}: {
  href: string;
  value: string;
  external: boolean;
}) {
  return (
    <a
      className={styles.contactLink}
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer" : undefined}
    >
      {value}{external ? " ↗" : ""}
    </a>
  );
}

function OrganizationAdoptionCard({ adoption }: { adoption: OrganizationPublicAdoption }) {
  const href = adoptionDetailPath(adoption.slug);

  return (
    <article className={styles.adoptionCard} data-adoption-card={adoption.slug}>
      <AdoptionCardMedia
        href={href}
        name={adoption.name}
        status={adoption.status}
        mainImage={adoption.mainImage}
      />
      <div className={styles.adoptionCardBody}>
        {adoption.city ? <p className={styles.adoptionLocation}>{adoption.city}</p> : null}
        <h3><Link href={href}>{adoption.name}</Link></h3>
        {adoption.status === "RESERVED" ? (
          <p className={styles.adoptionReserved}>Tento pes je momentálne rezervovaný.</p>
        ) : null}
        <Link className={styles.adoptionCta} href={href}>
          Zobraziť profil <span aria-hidden="true">→</span>
        </Link>
      </div>
    </article>
  );
}

export function OrganizationProfileDetail({
  composition,
  reviews,
  reviewReadError = false,
}: {
  composition: PublicOrganizationComposition;
  reviews: PublicProfileReviewData | null;
  reviewReadError?: boolean;
}) {
  const { organization, adoptions, fundraisingMethods } = composition;
  const presentation = buildOrganizationProfilePresentation(organization);
  const fundraising = buildOrganizationFundraisingPresentation(fundraisingMethods);

  const aside = (
    <div className={styles.asideStack}>
      <DetailFactsCard title="Základné informácie" facts={presentation.facts} />
      <DetailContactsCard
        title="Kontakty"
        contacts={presentation.contacts.map((contact) => ({
          id: contact.label,
          label: contact.label,
          value: (
            <ContactLink
              href={contact.href}
              value={contact.value}
              external={contact.external}
            />
          ),
        }))}
      />
      {presentation.actions.length > 0 ? (
        <DetailActions>
          {presentation.actions.map((action) => (
            <a
              className={styles.actionLink}
              href={action.href}
              key={action.href}
              target={action.external ? "_blank" : undefined}
              rel={action.external ? "noreferrer" : undefined}
            >
              {action.label}
            </a>
          ))}
        </DetailActions>
      ) : null}
    </div>
  );

  return (
    <main id="obsah" tabIndex={-1}>
      <PageContainer className={styles.breadcrumbWrap}>
        <Breadcrumbs label="Drobečková navigácia">
          <Link className={styles.breadcrumbLink} href="/">Domov</Link>
          <span aria-hidden="true">›</span>
          <span>Organizácie</span>
          <span aria-hidden="true">›</span>
          <span aria-current="page">{organization.name}</span>
        </Breadcrumbs>
      </PageContainer>

      <SectionHero className={styles.hero}>
        <p className={styles.eyebrow}>Pomoc psom · organizácia</p>
        <h1>{organization.name}</h1>
        {presentation.shortDescription ? <p className={styles.lead}>{presentation.shortDescription}</p> : null}
        {presentation.location ? <p className={styles.location} data-organization-location-summary><LocationIcon size={16} /> {presentation.location}</p> : null}
      </SectionHero>

      <PageContainer className={styles.content}>
        <DetailContentLayout aside={aside}>
          {presentation.locations.length > 1 ? (
            <DetailSection eyebrow="Lokality" title="Kde organizácia pôsobí">
              <ul className={styles.locationList}>
                {presentation.locations.map((location, index) => (
                  <li
                    className={styles.locationItem}
                    data-organization-location={location.id ?? `legacy-${index}`}
                    key={location.id ?? `legacy-${index}`}
                  >
                    <div className={styles.locationHeading}>
                      <h3>{location.label ?? `Lokalita ${index + 1}`}</h3>
                      {location.isPrimary ? <span className={styles.primaryBadge}>Hlavná lokalita</span> : null}
                    </div>
                    {location.value ? <p>{location.value}</p> : null}
                  </li>
                ))}
              </ul>
            </DetailSection>
          ) : null}

          {presentation.description ? (
            <DetailSection eyebrow="O organizácii" title="Kto sú a čo robia">
              <DetailParagraphs value={presentation.description} />
            </DetailSection>
          ) : null}

          {fundraising.length > 0 ? (
            <DetailSection eyebrow="Podpora" title="Ako môžete pomôcť">
              <div className={styles.fundraisingGrid} data-organization-fundraising>
                {fundraising.map((method) => (
                  <article
                    className={styles.fundraisingCard}
                    data-fundraising-method={method.id}
                    key={method.id}
                  >
                    <p className={styles.fundraisingType}>{method.typeLabel}</p>
                    <h3>{method.title}</h3>
                    {method.detail ? (
                      <dl className={styles.fundraisingDetail}>
                        <dt>{method.detail.label}</dt>
                        <dd>{method.detail.value}</dd>
                      </dl>
                    ) : null}
                    {method.instructions ? (
                      <p className={styles.fundraisingInstructions}>{method.instructions}</p>
                    ) : null}
                    {method.action ? (
                      <a
                        className={styles.fundraisingCta}
                        href={method.action.href}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {method.action.label}
                      </a>
                    ) : null}
                  </article>
                ))}
              </div>
            </DetailSection>
          ) : null}

          {adoptions.length > 0 ? (
            <DetailSection eyebrow="Adopcie" title="Psy na adopciu">
              <div className={styles.adoptionGrid}>
                {adoptions.map((adoption) => (
                  <OrganizationAdoptionCard adoption={adoption} key={adoption.id} />
                ))}
              </div>
            </DetailSection>
          ) : null}

          <ProfileReviewSection
            data={reviews}
            baseHref={`/organizacie/${organization.slug}`}
            readError={reviewReadError}
          />
        </DetailContentLayout>
      </PageContainer>
    </main>
  );
}
