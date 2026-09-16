import Link from "next/link";
import {
  DetailActions,
  DetailContactsCard,
  DetailContentLayout,
  DetailFactsCard,
  DetailParagraphs,
  DetailSection,
} from "@/components/detail-primitives";
import { Breadcrumbs, PageContainer, SectionHero } from "@/components/page-system";
import type { PublicOrganizationComposition } from "@/lib/help-organization-store";
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
              <ul className={styles.adoptionList}>
                {adoptions.map((adoption) => (
                  <li key={adoption.id}>
                    <Link className={styles.adoptionLink} href={`/pomoc-psom/adopcia/${adoption.slug}`}>
                      <span>
                        <strong>{adoption.name}</strong>
                        {adoption.city ? <small>{adoption.city}</small> : null}
                      </span>
                      <b>{adoption.status === "RESERVED" ? "Rezervovaný" : "Na adopciu"}</b>
                    </Link>
                  </li>
                ))}
              </ul>
            </DetailSection>
          ) : null}
        </DetailContentLayout>
      </PageContainer>
    </main>
  );
}
