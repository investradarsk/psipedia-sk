import { PublicActionLink, PublicMediaFallback, PublicPhotoGallery } from "@/components/public-visual-system";
import { DetailActions, DetailContactsCard, DetailFactsCard, DetailHero, DetailParagraphs, DetailSection, type DetailContact } from "./detail-primitives/detail-primitives";
import { PublicHelpProfileDetailLayout } from "@/components/public-visual-system/public-help-profile-detail-layout";
import { ImageDisplay } from "@/components/image-display";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StructuredData } from "@/components/structured-data";
import { getPublicDogReport } from "@/lib/lost-found-dog-store";
import { chipStateLabel, dogReportBasePath, dogReportStatusLabel, dogReportTitle, dogReportTypeLabel, dogReportTypeShortLabel, dogSexLabel, dogSizeLabel, formatDogReportDate, type DogReportType } from "@/lib/lost-found-dogs";
import { lostFoundStatusShouldIndex } from "@/lib/lost-found-lifecycle.js";
import { buildGenericMainEntityJsonLd, buildWebPageJsonLd, SITE_URL } from "@/lib/seo";
import styles from "./lost-found-dogs.module.css";

export async function lostFoundDogMetadata(type: DogReportType, slug: string): Promise<Metadata> {
  const report = await getPublicDogReport(type, slug);
  if (!report) return { title: "Hlásenie sa nenašlo | Psipedia", robots: { index: false, follow: true } };
  const title = `${dogReportTitle(report)} | Psipedia`;
  const lead = report.shortDescription?.trim() || report.description;
  const description = `${dogReportTypeLabel(type)} · ${report.city}${report.district ? `, ${report.district}` : ""}. ${lead}`.slice(0, 158);
  const canonical = `${SITE_URL}${dogReportBasePath(type)}/${report.slug}`;
  const image = report.mainImage ? (report.mainImage.startsWith("http") ? report.mainImage : `${SITE_URL}${report.mainImage}`) : undefined;
  const shouldIndex = lostFoundStatusShouldIndex(report.status);
  return {
    title, description,
    alternates: { canonical },
    robots: { index: shouldIndex, follow: true },
    openGraph: { title, description, url: canonical, type: "article", images: image ? [{ url: image }] : undefined, publishedTime: report.publishedAt || undefined, modifiedTime: report.updatedAt },
    twitter: { card: image ? "summary_large_image" : "summary", title, description, images: image ? [image] : undefined },
  };
}


export async function LostFoundDogDetail({ type, slug }: { type: DogReportType; slug: string }) {
  const report = await getPublicDogReport(type, slug);
  if (!report) notFound();
  const active = report.status === "ACTIVE";
  const relayHref = `/kontakt?tema=${encodeURIComponent(`Hlásenie ${report.id}: ${dogReportTypeLabel(type)}`)}`;
  const canonical = `${SITE_URL}${dogReportBasePath(type)}/${report.slug}`;
  const breadcrumbId = `${canonical}#breadcrumb`;
  const reportImage = report.mainImage ? (report.mainImage.startsWith("http") ? report.mainImage : `${SITE_URL}${report.mainImage}`) : null;
  const reportEntity = buildGenericMainEntityJsonLd({
    canonical,
    name: report.dogName || report.breed || dogReportTitle(report),
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
          name: dogReportTitle(report),
          description: report.description,
          mainEntityId: reportEntity["@id"],
          breadcrumbId,
          datePublished: report.publishedAt || report.createdAt,
          dateModified: report.updatedAt,
        }),
        ...(reportImage ? { primaryImageOfPage: reportImage } : {}),
      },
      reportEntity,
      { "@type": "BreadcrumbList", "@id": breadcrumbId, itemListElement: [
        { "@type": "ListItem", position: 1, name: "Domov", item: SITE_URL },
        { "@type": "ListItem", position: 2, name: "Pomoc psom", item: `${SITE_URL}/pomoc-psom` },
        { "@type": "ListItem", position: 3, name: type === "LOST" ? "Stratené psy" : "Nájdené psy", item: `${SITE_URL}${dogReportBasePath(type)}` },
        { "@type": "ListItem", position: 4, name: report.dogName || report.breed || "Pes", item: canonical },
      ] },
    ],
  };
  const hasFacts = report.sex !== "UNKNOWN" || report.size !== "UNKNOWN" || Boolean(report.breed) || Boolean(report.color) || Boolean(report.approximateAge) || report.chipped !== "UNKNOWN";
  const publicPhoneHref = report.publicPhone ? "tel:" + report.publicPhone.replace(/[^+\d]/g, "") : null;
  const publicEmailHref = report.publicEmail ? "mailto:" + report.publicEmail : null;
  const publishedContacts: DetailContact[] = [
    ...(publicPhoneHref ? [{ label:"Telefón", value:<a href={publicPhoneHref}>{report.publicPhone}</a> }] : []),
    ...(publicEmailHref ? [{ label:"E-mail", value:<a href={publicEmailHref}>{report.publicEmail}</a> }] : []),
    ...(report.publicWebsiteUrl ? [{ label:"Web", value:<a href={report.publicWebsiteUrl} target="_blank" rel="noreferrer">Otvoriť web ↗</a> }] : []),
    ...(report.publicFacebookUrl ? [{ label:"Facebook", value:<a href={report.publicFacebookUrl} target="_blank" rel="noreferrer">Facebook ↗</a> }] : []),
    ...(report.publicInstagramUrl ? [{ label:"Instagram", value:<a href={report.publicInstagramUrl} target="_blank" rel="noreferrer">Instagram ↗</a> }] : []),
    ...(report.sourceUrl ? [{ label:"Pôvodný zdroj", value:<a href={report.sourceUrl} target="_blank" rel="nofollow noreferrer">Otvoriť pôvodné hlásenie ↗</a> }] : []),
  ];
  const facts = [
    ...(report.sex !== "UNKNOWN" ? [{label:"Pohlavie",value:dogSexLabel[report.sex]}] : []),
    ...(report.size !== "UNKNOWN" ? [{label:"Veľkosť",value:dogSizeLabel[report.size]}] : []),
    ...(report.breed ? [{label:"Plemeno",value:report.breedSlug
      ? <Link className={styles.breedLink} href={"/plemena/" + report.breedSlug}>{report.breed}</Link> : report.breed}] : []),
    ...(report.color ? [{label:"Farba",value:report.color}] : []),
    ...(report.approximateAge ? [{label:"Vek",value:report.approximateAge}] : []),
    ...(report.chipped !== "UNKNOWN" ? [{label:"Čip",value:chipStateLabel[report.chipped]}] : []),
  ];
  // Never expose a technical URL slug as a visible breadcrumb label.
  const breadcrumbLabel = report.dogName?.trim() || report.breed?.trim()
    || `${type === "LOST" ? "Stratený" : "Nájdený"} pes – ${report.city}`;

  return <main id="obsah" tabIndex={-1} className={styles.detail}>
    <StructuredData value={schema} />
    <DetailHero kind="lost-found" breadcrumbs={    <nav className={styles.crumbs} aria-label="Omrvinková navigácia"><Link href="/pomoc-psom">Pomoc psom</Link><span aria-hidden="true">/</span><Link href={dogReportBasePath(type)}>{type === "LOST" ? "Stratené psy" : "Nájdené psy"}</Link><span aria-hidden="true">/</span><span>{breadcrumbLabel}</span></nav>}
      copy={<>    <div className={styles.statusBanner} data-state={report.status}><strong>{dogReportStatusLabel[report.status]}</strong><span>{active ? "Hlásenie je stále aktuálne." : "Tento prípad už nie je vedený ako aktívny."}</span></div>
        <span className={`${styles.badge} ${type === "LOST" ? styles.lost : styles.found}`}>{dogReportTypeLabel(type)}</span>
        <h1 id={`dog-report-${report.id}`}>{dogReportTitle(report)}</h1>
        <div className={styles.detailMeta}><span><strong>Lokalita</strong> {report.city}{report.district ? ` · ${report.district}` : ""} · {report.region}</span><span><strong>Dátum</strong> {formatDogReportDate(report.eventDate)}</span></div>
        {type === "LOST" && <div className={styles.lastSeen}><strong>Naposledy videný:</strong><span>{formatDogReportDate(report.lastSeenDateTime || report.eventDate, Boolean(report.lastSeenDateTime))} · {report.locationDescription || report.city}</span></div>}
        {type === "FOUND" && report.locationDescription && <div className={styles.foundAt}><strong>Miesto nájdenia</strong><span>{report.locationDescription}</span></div>}{report.shortDescription?.trim() && <p className={styles.detailLead}>{report.shortDescription}</p>}
        <DetailActions>
          {active && publicPhoneHref ? <PublicActionLink href={publicPhoneHref}>Zavolať</PublicActionLink> : null}
          {active && publicEmailHref ? <PublicActionLink href={publicEmailHref} variant={publicPhoneHref ? "secondary" : "primary"}>Napísať e-mail</PublicActionLink> : null}
          {report.sourceUrl ? <PublicActionLink href={report.sourceUrl} target="_blank" rel="nofollow noreferrer" variant={publicPhoneHref || publicEmailHref ? "secondary" : "primary"}>Otvoriť pôvodné hlásenie</PublicActionLink>
            : active && !publicPhoneHref && !publicEmailHref ? <PublicActionLink href={relayHref}>Kontaktovať cez Psipediu</PublicActionLink> : null}
        </DetailActions>
</>}
      media={report.mainImage ? <ImageDisplay roleHint="generic" fallbackOnError context="detail" config={report.detailImageDisplay} src={report.mainImage} alt={report.dogName ? `${dogReportTypeShortLabel(type)} pes ${report.dogName}` : dogReportTypeLabel(type)} loading="eager" /> : <PublicMediaFallback size="detail" label="Fotografia psa zatiaľ nie je dostupná" />} />

    <PublicHelpProfileDetailLayout>
      <article className={styles.detailCopy}>
        <DetailSection compactHeading title="Popis">
          <DetailParagraphs value={report.description} />
          {report.distinguishingMarks ? <><h3>Rozpoznávacie znaky</h3><DetailParagraphs value={report.distinguishingMarks} /></> : null}
          {report.collarDescription ? <><h3>Obojok alebo postroj</h3><DetailParagraphs value={report.collarDescription} /></> : null}
        </DetailSection>
        {report.gallery.length > 0 ? <DetailSection compactHeading title="Ďalšie fotografie">
          <PublicPhotoGallery variant="linked" fit="contain" className={styles.reportGallery} label="Ďalšie fotografie"
            maxImages={report.gallery.length} images={report.gallery.map((image,index)=>({src:image,alt:(report.dogName || "Pes") + " – fotografia " + (index+2)}))} />
        </DetailSection> : null}
      </article>
      <aside className={styles.detailAside} aria-label="Kontakty a praktické informácie">
        <DetailContactsCard title="Adresa a kontakt" id="lost-found-public-contact" contacts={publishedContacts}
          emptyMessage="Priamy verejný kontakt zatiaľ nie je uvedený."
          note={<>
            {report.publicContactNote ? <span className={styles.publicContactNote}>{report.publicContactNote}</span> : null}
            <span>Telefón a e-mail oznamovateľa nie sú automaticky publikované. Zobrazujú sa iba výslovne schválené verejné kontakty.</span>
          </>} noteTone="neutral" />
        {active && !report.sourceUrl && !publicPhoneHref && !publicEmailHref
          ? <DetailActions><PublicActionLink href={relayHref}>Kontaktovať cez Psipediu</PublicActionLink></DetailActions>
          : null}
        <div className={styles.safetyPanel}><DetailSection compactHeading title="Bezpečný kontakt">
          <p>Pri osobnom stretnutí dbajte na vlastnú bezpečnosť a presnú súkromnú adresu nezverejňujte verejne. Ak je pes vystrašený alebo sa správa nepredvídateľne, neprenasledujte ho bez vhodného zabezpečenia.</p>
        </DetailSection></div>
        {hasFacts ? <DetailFactsCard title="Základné údaje" facts={facts} /> : null}
        {(report.publicLatitude !== null || report.locationDescription) ? <DetailSection compactHeading title="Približná lokalita">
          <p>{report.locationDescription || report.city}</p>
          <p className={styles.mapNote}>Zobrazuje sa len približná lokalita, nie súkromná adresa.</p>
        </DetailSection> : null}
        <DetailFactsCard title="Aktuálnosť a zdroj" facts={[
          {label:"Aktualizované",value:formatDogReportDate(report.updatedAt,true)},
          ...(report.source ? [{label:"Zdroj",value:report.source}] : []),
        ]} />
      </aside>
    </PublicHelpProfileDetailLayout>
  </main>;
}
