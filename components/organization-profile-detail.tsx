import Link from "next/link";
import { AdoptionCardMedia } from "@/components/adoption-card-media";
import { ProfileReviewSection } from "@/components/profile-review-section";
import { PublicLocationMap } from "@/components/map/public-location-map";
import type { PublicEntityMapResult } from "@/lib/map-query";
import type { PublicMapRuntime } from "@/lib/public-map-runtime";
import { LocationIcon } from "@/components/help-public-icons";
import {
  DetailActions,
  DetailContactsCard,
  DetailFactsCard,
  DetailParagraphs,
  DetailSection,
} from "@/components/detail-primitives/detail-primitives";
import { PublicProfileContentLayout, PublicProfileHero } from "@/components/public-profile/public-profile-hero";
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
  commercial,
  publicMap,
}: {
  composition: PublicOrganizationComposition;
  reviews: PublicProfileReviewData | null;
  reviewReadError?: boolean;
  commercial?: { premium: boolean; promoted: boolean; sponsoredLabel: string | null };
  publicMap?: PublicEntityMapResult & PublicMapRuntime;
}) {
  const { organization, adoptions, fundraisingMethods } = composition;
  const presentation = buildOrganizationProfilePresentation(organization);
  const fundraising = buildOrganizationFundraisingPresentation(fundraisingMethods);

  const aside = (
    <div className={styles.asideStack}>
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
      <DetailFactsCard title="Základné informácie" facts={presentation.facts} />
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

  const directContact = presentation.contacts.find((contact) =>
    contact.label === "Telefón" || contact.label === "Email"
  );
  const primaryAction = presentation.actions[0]
    ?? (directContact ? { label: directContact.label === "Telefón" ? "Zavolať" : "Napísať e-mail", href: directContact.href, external: false } : null);
  const fallbackAction = fundraising.length > 0
    ? { label: "Ako môžete pomôcť", href: "#podpora", external: false }
    : adoptions.length > 0
      ? { label: "Psy na adopciu", href: "#psy-na-adopciu", external: false }
      : { label: "Ďalšie organizácie", href: "/organizacie", external: false };

  return (
    <main id="obsah" tabIndex={-1}>
      <PublicProfileHero
        breadcrumbs={<>
          <Link href="/">Domov</Link><span aria-hidden="true">›</span>
          <Link href="/organizacie">Organizácie</Link><span aria-hidden="true">›</span>
          <span aria-current="page">{organization.name}</span>
        </>}
        typeLabel={presentation.facts.find((fact) => fact.label === "Typ organizácie")?.value ?? "Organizácia"}
        title={organization.name}
        lead={presentation.shortDescription}
        location={presentation.location ? <span data-organization-location-summary><LocationIcon size={16} /> {presentation.location}</span> : null}
        imageUrl={presentation.imageUrl}
        imageAlt={"Fotografia organizácie " + organization.name}
        badges={[
          ...(commercial?.premium ? [{ label: "Premium profil", tone: "premium" as const, title: "Platené rozšírenie profilu." }] : []),
          ...(commercial?.promoted ? [{ label: commercial.sponsoredLabel ?? "Sponzorované", tone: "sponsored" as const }] : []),
        ]}
        actions={[
          { ...(primaryAction ?? fallbackAction), primary: true },
          ...presentation.contacts
            .filter((contact) => (contact.label === "Telefón" || contact.label === "Email") && contact.href !== primaryAction?.href)
            .map((contact) => ({
              label: contact.label === "Telefón" ? "Zavolať" : "Napísať e-mail",
              href: contact.href,
              external: false,
            })),
        ]}
      />

      <PublicProfileContentLayout aside={aside}>
          {publicMap?.items.length ? (
            <PublicLocationMap
              title="Poloha organizácie"
              items={publicMap.items}
              attribution={publicMap.attribution}
              googleApiKey={publicMap.googleApiKey}
              googleMapId={publicMap.googleMapId}
              rendererEnabled={publicMap.rendererEnabled}
              testRendererEnvironment={publicMap.testRendererEnvironment}
            />
          ) : null}

          {presentation.description ? (
            <DetailSection eyebrow="O organizácii" title="Kto sú a čo robia">
              <DetailParagraphs value={presentation.description} />
            </DetailSection>
          ) : null}

          {fundraising.length > 0 ? (
            <DetailSection eyebrow="Podpora" title="Ako môžete pomôcť">
              <div id="podpora" className={styles.fundraisingGrid} data-organization-fundraising>
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
            <DetailSection eyebrow="Adopcie" title="Psy na adopciu v tejto organizácii">
              <div id="psy-na-adopciu" className={styles.adoptionGrid}>
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
      </PublicProfileContentLayout>
    </main>
  );
}
