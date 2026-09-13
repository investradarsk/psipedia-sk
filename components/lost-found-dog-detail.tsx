import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StructuredData } from "@/components/structured-data";
import { getPublicDogReport } from "@/lib/lost-found-dog-store";
import { chipStateLabel, dogReportBasePath, dogReportStatusLabel, dogReportTitle, dogReportTypeLabel, dogReportTypeShortLabel, dogSexLabel, dogSizeLabel, formatDogReportDate, type DogReportType } from "@/lib/lost-found-dogs";
import { lostFoundStatusShouldIndex } from "@/lib/lost-found-lifecycle.js";
import styles from "./lost-found-dogs.module.css";

const SITE_URL = "https://psipedia.sk";

export async function lostFoundDogMetadata(type: DogReportType, slug: string): Promise<Metadata> {
  const report = await getPublicDogReport(type, slug);
  if (!report) return { title: "Hlásenie sa nenašlo | Psipedia", robots: { index: false, follow: true } };
  const title = `${dogReportTitle(report)} | Psipedia`;
  const description = `${dogReportTypeLabel(type)} · ${report.city}${report.district ? `, ${report.district}` : ""}. ${report.description}`.slice(0, 158);
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

function DetailImageFallback() {
  return <div className={styles.detailImageFallback} aria-hidden="true"><span /></div>;
}

export async function LostFoundDogDetail({ type, slug }: { type: DogReportType; slug: string }) {
  const report = await getPublicDogReport(type, slug);
  if (!report) notFound();
  const active = report.status === "ACTIVE";
  const relayHref = `/kontakt?tema=${encodeURIComponent(`Hlásenie ${report.id}: ${dogReportTypeLabel(type)}`)}`;
  const canonical = `${SITE_URL}${dogReportBasePath(type)}/${report.slug}`;
  const schema = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebPage", "@id": canonical, url: canonical, name: dogReportTitle(report), description: report.description, dateModified: report.updatedAt, ...(report.mainImage ? { image: report.mainImage.startsWith("http") ? report.mainImage : `${SITE_URL}${report.mainImage}` } : {}) },
      { "@type": "BreadcrumbList", "@id": `${canonical}#breadcrumb`, itemListElement: [
        { "@type": "ListItem", position: 1, name: "Pomoc psom", item: `${SITE_URL}/pomoc-psom` },
        { "@type": "ListItem", position: 2, name: type === "LOST" ? "Stratené psy" : "Nájdené psy", item: `${SITE_URL}${dogReportBasePath(type)}` },
        { "@type": "ListItem", position: 3, name: report.dogName || report.breed || "Pes", item: canonical },
      ] },
    ],
  };
  const hasFacts = report.sex !== "UNKNOWN" || report.size !== "UNKNOWN" || Boolean(report.breed) || Boolean(report.color) || Boolean(report.approximateAge) || report.chipped !== "UNKNOWN";

  return <main id="obsah" tabIndex={-1} className={styles.detail}>
    <StructuredData value={schema} />
    <nav className={styles.crumbs} aria-label="Omrvinková navigácia"><Link href="/pomoc-psom">Pomoc psom</Link><span aria-hidden="true">/</span><Link href={dogReportBasePath(type)}>{type === "LOST" ? "Stratené psy" : "Nájdené psy"}</Link><span aria-hidden="true">/</span><span>{report.dogName || report.slug}</span></nav>
    <div className={styles.statusBanner} data-state={report.status}><strong>{dogReportStatusLabel[report.status]}</strong><span>{active ? "Hlásenie je stále aktuálne." : "Tento prípad už nie je vedený ako aktívny."}</span></div>

    <section className={styles.detailHero} aria-labelledby={`dog-report-${report.id}`}>
      <div className={styles.detailImage}>{report.mainImage ? <img src={report.mainImage} alt={report.dogName ? `${dogReportTypeShortLabel(type)} pes ${report.dogName}` : dogReportTypeLabel(type)} /> : <DetailImageFallback />}</div>
      <div className={styles.detailIntro}>
        <span className={`${styles.badge} ${type === "LOST" ? styles.lost : styles.found}`}>{dogReportTypeLabel(type)}</span>
        <h1 id={`dog-report-${report.id}`}>{report.dogName || report.breed || "Pes bez známeho mena"}</h1>
        <div className={styles.detailMeta}><span><strong>Lokalita</strong> {report.city}{report.district ? ` · ${report.district}` : ""} · {report.region}</span><span><strong>Dátum</strong> {formatDogReportDate(report.eventDate)}</span></div>
        {type === "LOST" && <div className={styles.lastSeen}><strong>Naposledy videný</strong><span>{formatDogReportDate(report.lastSeenDateTime || report.eventDate, Boolean(report.lastSeenDateTime))} · {report.locationDescription || report.city}</span></div>}
        {type === "FOUND" && report.locationDescription && <div className={styles.foundAt}><strong>Miesto nájdenia</strong><span>{report.locationDescription}</span></div>}
        <div className={styles.detailActions}>{report.sourceUrl ? <a className={styles.cta} href={report.sourceUrl} target="_blank" rel="nofollow noreferrer">Otvoriť pôvodné hlásenie ↗</a> : active ? <Link className={styles.cta} href={relayHref}>Kontaktovať cez Psipediu</Link> : null}</div>
      </div>
    </section>

    <div className={styles.detailGrid}><div className={styles.detailCopy}>
      <section className={styles.panel}><span className={styles.detailEyebrow}>Informácie o psovi</span><h2>Popis</h2><p>{report.description}</p>{report.distinguishingMarks && <><h3>Rozpoznávacie znaky</h3><p>{report.distinguishingMarks}</p></>}{report.collarDescription && <><h3>Obojok alebo postroj</h3><p>{report.collarDescription}</p></>}</section>
      {report.gallery.length > 0 && <section className={styles.panel}><h2>Ďalšie fotografie</h2><div className={styles.gallery}>{report.gallery.map((image, index) => <img key={`${image}-${index}`} src={image} alt={`${report.dogName || "Pes"} – fotografia ${index + 2}`} />)}</div></section>}
      <section className={styles.safetyPanel}><h2>Bezpečný kontakt</h2><p>Pri osobnom stretnutí dbajte na vlastnú bezpečnosť a presnú súkromnú adresu nezverejňujte verejne. Ak je pes vystrašený alebo sa správa nepredvídateľne, neprenasledujte ho bez vhodného zabezpečenia.</p></section>
    </div><aside className={styles.detailAside}>
      {hasFacts && <section className={styles.panel}><h2>Základné údaje</h2><dl className={styles.facts}>{report.sex !== "UNKNOWN" && <div><dt>Pohlavie</dt><dd>{dogSexLabel[report.sex]}</dd></div>}{report.size !== "UNKNOWN" && <div><dt>Veľkosť</dt><dd>{dogSizeLabel[report.size]}</dd></div>}{report.breed && <div><dt>Plemeno</dt><dd>{report.breedSlug ? <Link className={styles.breedLink} href={`/plemena/${report.breedSlug}`}>{report.breed}</Link> : report.breed}</dd></div>}{report.color && <div><dt>Farba</dt><dd>{report.color}</dd></div>}{report.approximateAge && <div><dt>Vek</dt><dd>{report.approximateAge}</dd></div>}{report.chipped !== "UNKNOWN" && <div><dt>Čip</dt><dd>{chipStateLabel[report.chipped]}</dd></div>}</dl></section>}
      {(report.publicContactNote || (!report.sourceUrl && active)) && <section className={styles.panel}><h2>Kontakt</h2>{report.publicContactNote && <p>{report.publicContactNote}</p>}{!report.sourceUrl && active && <Link className={styles.cta} href={relayHref}>Kontaktovať cez Psipediu</Link>}<p className={styles.privacy}>Telefón a e-mail oznamovateľa nie sú automaticky publikované. Pomáha to obmedziť spam, scraping a zneužitie osobných údajov.</p></section>}
      {(report.publicLatitude !== null || report.locationDescription) && <section className={styles.panel}><h2>Približná lokalita</h2><p>{report.locationDescription || report.city}</p><div className={styles.mapNote}>Presná súkromná adresa sa nezobrazuje. Zobrazuje sa iba verejne bezpečná približná lokalita uložená pri hlásení.</div></section>}
      <section className={styles.trustPanel}><h2>Aktuálnosť a zdroj</h2><dl><div><dt>Stav</dt><dd>{dogReportStatusLabel[report.status]}</dd></div><div><dt>Aktualizované</dt><dd>{formatDogReportDate(report.updatedAt, true)}</dd></div>{report.source && <div><dt>Zdroj</dt><dd>{report.source}</dd></div>}</dl>{report.sourceUrl && <a href={report.sourceUrl} target="_blank" rel="nofollow noreferrer">Overiť pôvodný zdroj ↗</a>}</section>
    </aside></div>
  </main>;
}
