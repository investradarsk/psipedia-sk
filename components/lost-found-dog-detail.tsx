import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
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

export async function LostFoundDogDetail({ type, slug }: { type: DogReportType; slug: string }) {
  const report = await getPublicDogReport(type, slug);
  if (!report) notFound();
  const active = report.status === "ACTIVE";
  const relayHref = `/kontakt?tema=${encodeURIComponent(`Hlásenie ${report.id}: ${dogReportTypeLabel(type)}`)}`;
  return <main className={styles.detail}>
    <nav className={styles.crumbs} aria-label="Omrvinková navigácia"><Link href="/pomoc-psom">Pomoc psom</Link> / <Link href={dogReportBasePath(type)}>{type === "LOST" ? "Stratené psy" : "Nájdené psy"}</Link> / {report.dogName || report.slug}</nav>
    <div className={styles.statusBanner} data-state={report.status}><strong>{dogReportStatusLabel[report.status]}</strong><span>{active ? "Hlásenie je stále aktuálne." : "Tento prípad už nie je vedený ako aktívny."}</span></div>
    <section className={styles.detailHero}>
      <div className={styles.detailImage}>{report.mainImage ? <img src={report.mainImage} alt={report.dogName ? `${dogReportTypeShortLabel(type)} pes ${report.dogName}` : dogReportTypeLabel(type)} /> : <span aria-hidden="true">🐕</span>}</div>
      <div className={styles.detailIntro}><span className={`${styles.badge} ${type === "LOST" ? styles.lost : styles.found}`}>{dogReportTypeLabel(type)}</span><h1>{report.dogName || report.breed || "Pes bez známeho mena"}</h1><p>📍 {report.city}{report.district ? ` · ${report.district}` : ""} · {report.region}</p><p>📅 {formatDogReportDate(report.eventDate)}</p>
        {type === "LOST" && <div className={styles.lastSeen}><strong>Naposledy videný:</strong><br />{formatDogReportDate(report.lastSeenDateTime || report.eventDate, Boolean(report.lastSeenDateTime))} · {report.locationDescription || report.city}</div>}
      </div>
    </section>

    <div className={styles.detailGrid}><div>
      <section className={styles.panel}><h2>Popis</h2><p>{report.description}</p>{report.distinguishingMarks && <><h2>Rozpoznávacie znaky</h2><p>{report.distinguishingMarks}</p></>}{report.collarDescription && <><h2>Obojok alebo postroj</h2><p>{report.collarDescription}</p></>}</section>
      {report.gallery.length > 0 && <section className={styles.panel} style={{ marginTop: 20 }}><h2>Ďalšie fotografie</h2><div className={styles.gallery}>{report.gallery.map((image, index) => <img key={`${image}-${index}`} src={image} alt={`${report.dogName || "Pes"} – fotografia ${index + 2}`} />)}</div></section>}
    </div><aside>
      <section className={styles.panel}><h2>Základné údaje</h2><dl className={styles.facts}><div><dt>Pohlavie</dt><dd>{dogSexLabel[report.sex]}</dd></div><div><dt>Veľkosť</dt><dd>{dogSizeLabel[report.size]}</dd></div><div><dt>Plemeno</dt><dd>{report.breedSlug ? <Link className={styles.breedLink} href={`/plemena/${report.breedSlug}`}>{report.breed}</Link> : report.breed || "Neznáme"}</dd></div>{report.color && <div><dt>Farba</dt><dd>{report.color}</dd></div>}{report.approximateAge && <div><dt>Vek</dt><dd>{report.approximateAge}</dd></div>}<div><dt>Čip</dt><dd>{chipStateLabel[report.chipped]}</dd></div></dl></section>
      <section className={styles.panel} style={{ marginTop: 20 }}><h2>Kontakt</h2>{report.publicContactNote && <p>{report.publicContactNote}</p>}{report.sourceUrl ? <a className={styles.cta} href={report.sourceUrl} rel="nofollow noreferrer">Otvoriť pôvodné hlásenie</a> : <Link className={styles.cta} href={relayHref}>Kontaktovať cez Psipediu</Link>}<p className={styles.privacy}>Telefón a e-mail oznamovateľa nie sú automaticky publikované. Pomáha to obmedziť spam, scraping a zneužitie osobných údajov.</p></section>
      {(report.publicLatitude !== null || report.locationDescription) && <section className={styles.panel} style={{ marginTop: 20 }}><h2>Približná lokalita</h2><p>{report.locationDescription || report.city}</p><div className={styles.mapNote}>Presná súkromná adresa sa nezobrazuje. Dátový model uchováva iba verejne bezpečný približný bod pre budúcu mapu aktívnych hlásení.</div></section>}
    </aside></div>
  </main>;
}
