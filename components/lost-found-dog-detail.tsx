import { PublicHelpSectionNav } from "@/components/public-visual-system/public-help-category-nav";
import {
  PublicActionLink,
  PublicMediaFallback,
  PublicPhotoGallery,
  PublicPhotoLightboxLink,
} from "@/components/public-visual-system";
import {
  DetailActions,
  DetailContactsCard,
  DetailFactsCard,
  DetailHero,
  DetailProfileTitle,
  DetailParagraphs,
  DetailSection,
  type DetailContact,
} from "./detail-primitives/detail-primitives";
import { PublicHelpProfileDetailLayout } from "@/components/public-visual-system/public-help-profile-detail-layout";
import { ImageDisplay } from "@/components/image-display";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StructuredData } from "@/components/structured-data";
import { getPublicDogReport } from "@/lib/lost-found-dog-store";
import {
  chipStateLabel,
  dogReportBasePath,
  dogReportStatusLabel,
  dogReportTitle,
  dogReportTypeLabel,
  dogReportTypeShortLabel,
  dogSexLabel,
  dogSizeLabel,
  formatDogReportDate,
  type DogReportType,
} from "@/lib/lost-found-dogs";
import { lostFoundStatusShouldIndex } from "@/lib/lost-found-lifecycle.js";
import { buildGenericMainEntityJsonLd, buildWebPageJsonLd, SITE_URL } from "@/lib/seo";
import styles from "./lost-found-dogs.module.css";

function dogProfileTitle(report: Parameters<typeof dogReportTitle>[0] & { status: string }) {
  const name = report.dogName?.trim();
  if (report.type !== "LOST" || !name) return dogReportTitle(report);
  return `${report.status === "ACTIVE" ? "Hľadá sa " : ""}${name}${report.city ? ` – ${report.city}` : ""}`;
}

export async function lostFoundDogMetadata(type: DogReportType, slug: string): Promise<Metadata> {
  const report = await getPublicDogReport(type, slug);
  if (!report)
    return { title: "Hlásenie sa nenašlo | Psipedia", robots: { index: false, follow: true } };
  const title = `${dogProfileTitle(report)} | Psipedia`;
  const lead = report.shortDescription?.trim() || report.description;
  const description =
    `${dogReportTypeLabel(type)} · ${report.city}${report.district ? `, ${report.district}` : ""}. ${lead}`.slice(
      0,
      158,
    );
  const canonical = `${SITE_URL}${dogReportBasePath(type)}/${report.slug}`;
  const image = report.mainImage
    ? report.mainImage.startsWith("http")
      ? report.mainImage
      : `${SITE_URL}${report.mainImage}`
    : undefined;
  const shouldIndex = lostFoundStatusShouldIndex(report.status);
  return {
    title,
    description,
    alternates: { canonical },
    robots: { index: shouldIndex, follow: true },
    openGraph: {
      title,
      description,
      url: canonical,
      type: "article",
      images: image ? [{ url: image }] : undefined,
      publishedTime: report.publishedAt || undefined,
      modifiedTime: report.updatedAt,
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export async function LostFoundDogDetail({ type, slug }: { type: DogReportType; slug: string }) {
  const report = await getPublicDogReport(type, slug);
  if (!report) notFound();
  const active = report.status === "ACTIVE";
  const eventDate = formatDogReportDate(report.eventDate);
  const lastSeenDate = report.lastSeenDateTime
    ? formatDogReportDate(report.lastSeenDateTime, true)
    : eventDate;
  const showSeparateEventDate =
    type === "FOUND" ||
    (report.lastSeenDateTime && formatDogReportDate(report.lastSeenDateTime) !== eventDate);
  const locality = [...new Set([report.city, report.district, report.region].filter(Boolean))].join(
    " · ",
  );
  const locationDetail = report.locationDescription?.trim();
  const specificLocation =
    locationDetail?.toLocaleLowerCase("sk") === report.city?.trim().toLocaleLowerCase("sk")
      ? undefined
      : locationDetail;
  const relayHref = `/kontakt?tema=${encodeURIComponent(`Hlásenie ${report.id}: ${dogReportTypeLabel(type)}`)}`;
  const canonical = `${SITE_URL}${dogReportBasePath(type)}/${report.slug}`;
  const breadcrumbId = `${canonical}#breadcrumb`;
  const reportImage = report.mainImage
    ? report.mainImage.startsWith("http")
      ? report.mainImage
      : `${SITE_URL}${report.mainImage}`
    : null;
  const reportEntity = buildGenericMainEntityJsonLd({
    canonical,
    name: report.dogName || report.breed || dogProfileTitle(report),
    description: report.description,
    image: reportImage,
    idSuffix: "dog-report",
  });
  const schema = {
    "@context": "https://schema.org",
    "@graph": [
      {
        ...buildWebPageJsonLd({
          canonical,
          name: dogProfileTitle(report),
          description: report.description,
          mainEntityId: reportEntity["@id"],
          breadcrumbId,
          datePublished: report.publishedAt || report.createdAt,
          dateModified: report.updatedAt,
        }),
        ...(reportImage ? { primaryImageOfPage: reportImage } : {}),
      },
      reportEntity,
      {
        "@type": "BreadcrumbList",
        "@id": breadcrumbId,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Domov", item: SITE_URL },
          { "@type": "ListItem", position: 2, name: "Pomoc psom", item: `${SITE_URL}/pomoc-psom` },
          {
            "@type": "ListItem",
            position: 3,
            name: type === "LOST" ? "Stratené psy" : "Nájdené psy",
            item: `${SITE_URL}${dogReportBasePath(type)}`,
          },
          {
            "@type": "ListItem",
            position: 4,
            name: report.dogName || report.breed || "Pes",
            item: canonical,
          },
        ],
      },
    ],
  };
  const hasFacts =
    report.sex !== "UNKNOWN" ||
    report.size !== "UNKNOWN" ||
    Boolean(report.breed) ||
    Boolean(report.color) ||
    Boolean(report.approximateAge) ||
    report.chipped !== "UNKNOWN";
  const publicPhoneHref = report.publicPhone
    ? "tel:" + report.publicPhone.replace(/[^+\d]/g, "")
    : null;
  const publicEmailHref = report.publicEmail ? "mailto:" + report.publicEmail : null;
  const publishedContacts: DetailContact[] = [
    ...(publicPhoneHref
      ? [{ label: "Telefón", value: <a href={publicPhoneHref}>{report.publicPhone}</a> }]
      : []),
    ...(publicEmailHref
      ? [{ label: "E-mail", value: <a href={publicEmailHref}>{report.publicEmail}</a> }]
      : []),
    ...(report.publicWebsiteUrl
      ? [
          {
            label: "Web",
            value: (
              <a href={report.publicWebsiteUrl} target="_blank" rel="noreferrer">
                Otvoriť web ↗
              </a>
            ),
          },
        ]
      : []),
    ...(report.publicFacebookUrl
      ? [
          {
            label: "Facebook",
            value: (
              <a href={report.publicFacebookUrl} target="_blank" rel="noreferrer">
                Facebook ↗
              </a>
            ),
          },
        ]
      : []),
    ...(report.publicInstagramUrl
      ? [
          {
            label: "Instagram",
            value: (
              <a href={report.publicInstagramUrl} target="_blank" rel="noreferrer">
                Instagram ↗
              </a>
            ),
          },
        ]
      : []),
    ...(report.sourceUrl && !active
      ? [
          {
            label: "Pôvodný zdroj",
            value: (
              <a href={report.sourceUrl} target="_blank" rel="nofollow noreferrer">
                Otvoriť pôvodné hlásenie ↗
              </a>
            ),
          },
        ]
      : []),
  ];
  const facts = [
    ...(report.sex !== "UNKNOWN" ? [{ label: "Pohlavie", value: dogSexLabel[report.sex] }] : []),
    ...(report.size !== "UNKNOWN" ? [{ label: "Veľkosť", value: dogSizeLabel[report.size] }] : []),
    ...(report.breed
      ? [
          {
            label: "Plemeno",
            value: report.breedSlug ? (
              <Link className={styles.breedLink} href={"/plemena/" + report.breedSlug}>
                {report.breed}
              </Link>
            ) : (
              report.breed
            ),
          },
        ]
      : []),
    ...(report.color ? [{ label: "Farba", value: report.color }] : []),
    ...(report.approximateAge ? [{ label: "Vek", value: report.approximateAge }] : []),
    ...(report.chipped !== "UNKNOWN"
      ? [{ label: "Čip", value: chipStateLabel[report.chipped] }]
      : []),
  ];
  // Never expose a technical URL slug as a visible breadcrumb label.
  const breadcrumbLabel =
    report.dogName?.trim() ||
    report.breed?.trim() ||
    `${type === "LOST" ? "Stratený" : "Nájdený"} pes – ${report.city}`;

  return (
    <main id="obsah" tabIndex={-1} className={styles.detail}>
      <StructuredData value={schema} />
      <DetailHero
        kind="lost-found"
        mediaPresentation="compact"
        breadcrumbs={
          <nav className={styles.crumbs} aria-label="Omrvinková navigácia">
            <Link href="/pomoc-psom">Pomoc psom</Link>
            <span aria-hidden="true">/</span>
            <Link href={dogReportBasePath(type)}>
              {type === "LOST" ? "Stratené psy" : "Nájdené psy"}
            </Link>
            <span aria-hidden="true">/</span>
            <span>{breadcrumbLabel}</span>
          </nav>
        }
        copy={
          <>
            <DetailProfileTitle
              title={dogProfileTitle(report)}
              id={`dog-report-${report.id}`}
              category={dogReportTypeLabel(type)}
              categoryClassName={`${styles.badge} ${type === "LOST" ? styles.lost : styles.found}`}
              badges={
                active && (
                  <span className={styles.badge} data-state={report.status}>
                    {dogReportStatusLabel[report.status]}
                  </span>
                )
              }
            />
            {!active && (
              <div className={styles.statusBanner} data-state={report.status}>
                <strong>{dogReportStatusLabel[report.status]}</strong>
                <span>
                  {report.status === "RESOLVED"
                    ? type === "LOST"
                      ? "Pes sa našiel. Hlásenie je uzavreté."
                      : "Pes sa vrátil majiteľovi. Hlásenie je uzavreté."
                    : "Tento prípad už nie je vedený ako aktívny."}
                </span>
              </div>
            )}
            <div className={styles.detailMeta}>
              {locality && (
                <span>
                  <strong>Lokalita</strong> {locality}
                </span>
              )}
              {showSeparateEventDate && (
                <span>
                  <strong>{type === "FOUND" ? "Dátum nájdenia" : "Dátum straty"}</strong>{" "}
                  {eventDate}
                </span>
              )}
            </div>
            {type === "LOST" && (
              <div className={styles.lastSeen}>
                <strong>{report.lastSeenDateTime ? "Posledné videnie" : "Dátum straty"}</strong>
                <span>{[lastSeenDate, specificLocation].filter(Boolean).join(" · ")}</span>
              </div>
            )}
            {type === "FOUND" && specificLocation && (
              <div className={styles.foundAt}>
                <strong>Miesto nájdenia</strong>
                <span>{specificLocation}</span>
              </div>
            )}
            {report.shortDescription?.trim() && (
              <p className={styles.detailLead}>{report.shortDescription}</p>
            )}
            {active && (
              <DetailActions>
                {publicPhoneHref ? (
                  <PublicActionLink href={publicPhoneHref}>Zavolať</PublicActionLink>
                ) : null}
                {publicEmailHref ? (
                  <PublicActionLink
                    href={publicEmailHref}
                    variant={publicPhoneHref ? "secondary" : "primary"}
                  >
                    Napísať e-mail
                  </PublicActionLink>
                ) : null}
                {report.sourceUrl ? (
                  <PublicActionLink
                    href={report.sourceUrl}
                    target="_blank"
                    rel="nofollow noreferrer"
                    variant={publicPhoneHref || publicEmailHref ? "secondary" : "primary"}
                  >
                    Otvoriť pôvodné hlásenie
                  </PublicActionLink>
                ) : !publicPhoneHref && !publicEmailHref ? (
                  <PublicActionLink href={relayHref}>Kontaktovať cez Psipediu</PublicActionLink>
                ) : null}
              </DetailActions>
            )}
          </>
        }
        media={
          report.mainImage ? (
            <PublicPhotoLightboxLink
              src={report.mainImage}
              alt={
                report.dogName
                  ? `${dogReportTypeShortLabel(type)} pes ${report.dogName}`
                  : dogReportTypeLabel(type)
              }
            >
              <ImageDisplay
                roleHint="generic"
                fallbackOnError
                context="detail"
                config={report.detailImageDisplay}
                src={report.mainImage}
                alt={
                  report.dogName
                    ? `${dogReportTypeShortLabel(type)} pes ${report.dogName}`
                    : dogReportTypeLabel(type)
                }
                loading="eager"
              />
            </PublicPhotoLightboxLink>
          ) : (
            <PublicMediaFallback size="detail" label="Fotografia psa zatiaľ nie je dostupná" />
          )
        }
      />

      <PublicHelpSectionNav current="stratene-a-najdene" reportScope={type} />
      <PublicHelpProfileDetailLayout>
        <article className={styles.detailCopy}>
          <DetailSection compactHeading title="Popis">
            <DetailParagraphs value={report.description} />
            {report.distinguishingMarks ? (
              <>
                <h3>Rozpoznávacie znaky</h3>
                <DetailParagraphs value={report.distinguishingMarks} />
              </>
            ) : null}
            {report.collarDescription ? (
              <>
                <h3>Obojok alebo postroj</h3>
                <DetailParagraphs value={report.collarDescription} />
              </>
            ) : null}
          </DetailSection>
          {report.gallery.length > 0 ? (
            <DetailSection compactHeading title="Ďalšie fotografie">
              <PublicPhotoGallery
                variant="linked"
                fit="contain"
                className={styles.reportGallery}
                label="Ďalšie fotografie"
                maxImages={report.gallery.length}
                images={report.gallery.map((image, index) => ({
                  src: image,
                  alt: (report.dogName || "Pes") + " – fotografia " + (index + 2),
                }))}
              />
            </DetailSection>
          ) : null}
        </article>
        <aside className={styles.detailAside} aria-label="Kontakty a praktické informácie">
          <DetailContactsCard
            title="Verejné kontakty"
            id="lost-found-public-contact"
            contacts={publishedContacts}
            emptyMessage="Priamy verejný kontakt zatiaľ nie je uvedený."
            note={
              <>
                {report.publicContactNote ? (
                  <span className={styles.publicContactNote}>{report.publicContactNote}</span>
                ) : null}
                <span>
                  Telefón a e-mail oznamovateľa nie sú automaticky publikované. Zobrazujú sa iba
                  výslovne schválené verejné kontakty.
                </span>
              </>
            }
            noteTone="neutral"
          />
          {active && (
            <p>
              <Link href={`/partner/prevziat-profil/LOST_FOUND_DOG/${report.id}`}>
                Spravujete toto hlásenie? Požiadať o správu
              </Link>
            </p>
          )}
          <div className={styles.safetyPanel}>
            <DetailSection compactHeading title="Bezpečný kontakt">
              <p>
                Pri osobnom stretnutí dbajte na vlastnú bezpečnosť a presnú súkromnú adresu
                nezverejňujte verejne. Ak je pes vystrašený alebo sa správa nepredvídateľne,
                neprenasledujte ho bez vhodného zabezpečenia.
              </p>
            </DetailSection>
          </div>
          {hasFacts ? <DetailFactsCard title="Základné údaje" facts={facts} /> : null}
          {report.publicLatitude !== null || report.locationDescription ? (
            <DetailSection compactHeading title="Približná lokalita">
              <p>{report.locationDescription || report.city}</p>
              <p className={styles.mapNote}>
                Zobrazuje sa len približná lokalita, nie súkromná adresa.
              </p>
            </DetailSection>
          ) : null}
          <DetailFactsCard
            title="Aktuálnosť a zdroj"
            facts={[
              { label: "Aktualizované", value: formatDogReportDate(report.updatedAt, true) },
              ...(report.status === "RESOLVED" && report.resolvedAt
                ? [{ label: "Vyriešené", value: formatDogReportDate(report.resolvedAt, true) }]
                : []),
              ...(report.source ? [{ label: "Zdroj", value: report.source }] : []),
            ]}
          />
        </aside>
      </PublicHelpProfileDetailLayout>
    </main>
  );
}
