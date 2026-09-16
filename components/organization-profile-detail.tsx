import Link from "next/link";
import { AdoptionCardMedia } from "@/components/adoption-card-media";
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
import { buildOrganizationProfilePresentation } from "@/lib/organization-profile-presentation";
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
    <article className={styles.adoptionCard}>
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

export function OrganizationProfileDetail({ composition }: { composition: PublicOrganizationComposition }) {
  const { organization, adoptions } = composition;
  const presentation = buildOrganizationProfilePresentation(organization);

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
        {presentation.location ? <p className={styles.location}>📍 {presentation.location}</p> : null}
      </SectionHero>

      <PageContainer className={styles.content}>
        <DetailContentLayout aside={aside}>
          {presentation.description ? (
            <DetailSection eyebrow="O organizácii" title="Kto sú a čo robia">
              <DetailParagraphs value={presentation.description} />
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
        </DetailContentLayout>
      </PageContainer>
    </main>
  );
}
