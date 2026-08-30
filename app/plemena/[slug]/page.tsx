import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RatingDots } from "@/components/breed-card";
import { ArrowIcon } from "@/components/icons";
import { breeds } from "@/lib/content";
import { getPublishedBreed } from "@/lib/breed-store";
import { absoluteUrl, ORGANIZATION_ID, serializeJsonLd, SITE_URL } from "@/lib/seo";
import { breedSeoFallback, buildContentMetadata, resolvedCanonical } from "@/lib/content-seo";

type Props = { params: Promise<{ slug: string }> };
export const dynamic = "force-dynamic";
export function generateStaticParams() { return breeds.map((breed) => ({ slug: breed.slug })); }
function paragraphs(value?: string) { return value?.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean) ?? []; }
function fciValue(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function DetailSection({ title, values }: { title: string; values: Array<[string, string | undefined]> }) {
  const present = values.filter(([,value])=>fciValue(value));
  if (!present.length) return null;
  return <details className="breed-fci-section"><summary>{title}</summary><div>{present.map(([label,value])=><section key={label}><h3>{label}</h3>{paragraphs(value).map((paragraph)=><p key={paragraph}>{paragraph}</p>)}</section>)}</div></details>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params; const breed = await getPublishedBreed(slug);
  const fallback = breed ? breedSeoFallback(breed.name) : null;
  return breed && fallback ? buildContentMetadata({ seo: breed.seo, fallbackTitle: fallback.title, fallbackDescription: fallback.description, path: `/plemena/${breed.slug}`, image: breed.image,
    imageAlt: `${breed.name} – profil plemena`, type: "article",
    publishedTime: "publishedAt" in breed && typeof breed.publishedAt === "string" ? breed.publishedAt : "2026-08-17",
    modifiedTime: "updatedAt" in breed && typeof breed.updatedAt === "string" ? breed.updatedAt : "2026-08-17",
    section: "Plemená psov", tags: [breed.name, `FCI skupina ${breed.fciGroup}`, breed.origin] }) : {};
}

export default async function BreedDetailPage({ params }: Props) {
  const { slug } = await params; const breed = await getPublishedBreed(slug); if (!breed) notFound();
  const canonical = resolvedCanonical(breed.seo, `/plemena/${breed.slug}`);
  const publishedAt = "publishedAt" in breed && typeof breed.publishedAt === "string" ? breed.publishedAt : "2026-08-17";
  const updatedAt = "updatedAt" in breed && typeof breed.updatedAt === "string" ? breed.updatedAt : "2026-08-17";
  const gallery = breed.gallery ?? []; const healthRisks = breed.healthRisks ?? []; const sources = breed.sources ?? []; const fci = breed.fciStandard ?? {};
  const schema = { "@context": "https://schema.org", "@graph": [
    { "@type": "Article", "@id": `${canonical}#article`, url: canonical, mainEntityOfPage: { "@type": "WebPage", "@id": canonical },
      headline: `${breed.name} – povaha, potreby a profil plemena`, description: breed.intro || fci.povaha_temperament || breed.officialFciName,
      image: [breed.image ? absoluteUrl(breed.image) : null, ...gallery.map((item) => absoluteUrl(item.imageUrl))].filter(Boolean), datePublished: publishedAt,
      dateModified: updatedAt, inLanguage: "sk-SK", isAccessibleForFree: true, articleSection: "Plemená psov",
      keywords: [breed.name, `FCI skupina ${breed.fciGroup}`, breed.origin, "plemená psov"],
      author: { "@type": "Organization", name: "Redakcia Psipedia", url: `${SITE_URL}/o-nas` },
      publisher: { "@type": "Organization", "@id": ORGANIZATION_ID, name: "Psipedia.sk", url: SITE_URL,
        logo: { "@type": "ImageObject", url: `${SITE_URL}/favicon.svg`, width: 64, height: 64 } },
      about: { "@type": "Thing", name: breed.name, description: breed.intro } },
    { "@type": "BreadcrumbList", "@id": `${canonical}#breadcrumb`, itemListElement: [
      { "@type": "ListItem", position: 1, name: "Domov", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Plemená", item: `${SITE_URL}/plemena` },
      { "@type": "ListItem", position: 3, name: breed.name, item: canonical }] }] };
  const sections = [["Povaha", "Aký je doma a medzi ľuďmi", breed.character], ["História", "Pôvod a vývoj plemena", breed.history],
    ["Pohyb", "Koľko aktivity potrebuje", breed.exercise || breed.needs], ["Výcvik", "Ako s ním pracovať", breed.training],
    ["Zdravie", "Zdravie a prevencia", breed.health]].filter((section) => Boolean(section[2])) as string[][];

  return <main id="obsah">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(schema) }} />
    <header className="breed-detail-hero shell"><nav className="article-breadcrumbs" aria-label="Navigácia"><Link href="/">Domov</Link><span>/</span><Link href="/plemena">Plemená</Link><span>/</span><span>{breed.name}</span></nav>
      <div className="breed-detail-card"><div><span className="eyebrow">FCI {breed.fciGroup} · {breed.fciSection} · {breed.origin}</span><h1>{breed.name}</h1>{breed.officialFciName && <p className="breed-official-name">{breed.officialFciName}</p>}{breed.intro && <p>{breed.intro}</p>}</div>{breed.image ? <img className="breed-detail-image" src={breed.image} alt={`${breed.name} – titulná fotografia plemena`} /> : <div className="breed-detail-image breed-detail-image--empty" aria-hidden="true">🐕</div>}</div></header>
    <section className="shell"><div className="breed-facts">{breed.fciNumber && <div><span>FCI číslo</span><strong>{breed.fciNumber}</strong></div>}<div><span>FCI skupina</span><strong>{breed.fciGroup}. {breed.fciSection}</strong></div><div><span>Krajina pôvodu</span><strong>{breed.origin}</strong></div>{breed.size && <div><span>Veľkosť</span><strong>{breed.size}</strong></div>}{breed.weight && <div><span>Hmotnosť</span><strong>{breed.weight}</strong></div>}{breed.height && <div><span>Výška</span><strong>{breed.height}</strong></div>}{breed.lifespan && <div><span>Dĺžka života</span><strong>{breed.lifespan}</strong></div>}{breed.coat && <div><span>Srsť</span><strong>{breed.coat}</strong></div>}</div></section>
    {gallery.length > 0 && <section className="breed-gallery shell" aria-label={`Fotografie plemena ${breed.name}`}>{gallery.map((item, index) => <figure key={`${item.imageUrl}-${index}`}><img src={item.imageUrl} alt={item.alt || `${breed.name} – fotografia ${index + 1}`} />{(item.caption || item.credit) && <figcaption>{item.caption}{item.caption && item.credit ? " · " : ""}{item.credit && <span>Foto: {item.credit}</span>}</figcaption>}</figure>)}</section>}
    <div className="breed-detail-body shell"><div className="breed-copy">
      {sections.map(([eyebrow, title, content]) => <section key={eyebrow}><span className="eyebrow">{eyebrow}</span><h2>{title}</h2>{paragraphs(content).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</section>)}
      {healthRisks.length > 0 && <section><span className="eyebrow">Zdravie</span><h2>Typické zdravotné riziká</h2><ul className="breed-health-risks">{healthRisks.map((item) => <li key={item}>{item}</li>)}</ul></section>}
      {(breed.fciNumber || Object.keys(fci).length > 0) && <section className="breed-fci-standard"><span className="eyebrow">Oficiálne údaje</span><h2>FCI štandard</h2><dl className="breed-fci-basics">
        {breed.fciNumber && <div><dt>FCI číslo</dt><dd>{breed.fciNumber}</dd></div>}
        <div><dt>FCI skupina</dt><dd>{breed.fciGroup}{fci.fci_skupina_nazov ? ` – ${fci.fci_skupina_nazov}` : ""}</dd></div>
        {(breed.fciSectionNumber || breed.fciSection) && <div><dt>FCI sekcia</dt><dd>{[breed.fciSectionNumber,fci.fci_sekcia_nazov || breed.fciSection].filter(Boolean).join(" – ")}</dd></div>}
        {breed.origin && <div><dt>Krajina pôvodu</dt><dd>{breed.origin}</dd></div>}
        {fci.vyuzitie && <div><dt>Využitie</dt><dd>{fci.vyuzitie}</dd></div>}
        {breed.workingTrial && <div><dt>Pracovná skúška</dt><dd>{breed.workingTrial}</dd></div>}
        {breed.validStandardDate && <div><dt>Dátum platného štandardu</dt><dd>{breed.validStandardDate}</dd></div>}
      </dl>
      <DetailSection title="História a využitie" values={[["Historický súhrn",fci.historicky_suhrn],["Využitie",fci.vyuzitie]]}/>
      <DetailSection title="Celkový vzhľad a proporcie" values={[["Celkový vzhľad",fci.celkovy_vzhlad],["Dôležité proporcie",fci.dolezite_proporcie]]}/>
      <DetailSection title="Povaha a temperament" values={[["Povaha a temperament",fci.povaha_temperament]]}/>
      <DetailSection title="Hlava" values={[["Lebečná časť",fci.hlava_lebecna_cast],["Tvárová časť",fci.hlava_tvarova_cast]]}/>
      <DetailSection title="Oči a uši" values={[["Oči",fci.oci],["Uši",fci.usi]]}/>
      <DetailSection title="Krk a telo" values={[["Krk",fci.krk],["Telo",fci.telo]]}/>
      <DetailSection title="Chvost" values={[["Chvost",fci.chvost]]}/>
      <DetailSection title="Končatiny" values={[["Predné končatiny",fci.predne_koncatiny],["Zadné končatiny",fci.zadne_koncatiny]]}/>
      <DetailSection title="Pohyb" values={[["Pohyb",fci.pohyb]]}/>
      <DetailSection title="Koža, srsť a farba" values={[["Koža",fci.koza],["Srsť",fci.srst],["Farba",fci.farba]]}/>
      <DetailSection title="Výška a hmotnosť" values={[["Výška – pes",fci.vyska_pes_cm],["Výška – suka",fci.vyska_suka_cm],["Hmotnosť – pes",fci.hmotnost_pes_kg],["Hmotnosť – suka",fci.hmotnost_suka_kg],["Poznámka",fci.velkost_hmotnost_poznamka]]}/>
      <DetailSection title="Chyby" values={[["Chyby",fci.chyby]]}/>
      <DetailSection title="Závažné chyby" values={[["Závažné chyby",fci.zavazne_chyby]]}/>
      <DetailSection title="Diskvalifikačné chyby" values={[["Diskvalifikačné chyby",fci.diskvalifikacne_chyby]]}/>
      <DetailSection title="Poznámka k chovu" values={[["Poznámka k chovu",fci.poznamka_chov]]}/>
      {(fci.fci_nomenklatura_url || fci.fci_standard_pdf || fci.zdroj_poznamka) && <div className="breed-fci-sources"><h3>Oficiálny štandard</h3>{fci.zdroj_poznamka && <p>{fci.zdroj_poznamka}</p>}<div>{fci.fci_nomenklatura_url && <a href={fci.fci_nomenklatura_url} target="_blank" rel="noopener noreferrer">FCI nomenklatúra</a>}{fci.fci_standard_pdf && <a href={fci.fci_standard_pdf} target="_blank" rel="noopener noreferrer">FCI PDF štandard</a>}</div></div>}
      </section>}
      {sources.length > 0 && <section><span className="eyebrow">Overené informácie</span><h2>Odborné zdroje</h2><ol className="breed-source-list">{sources.map((source) => <li key={`${source.label}-${source.url}`}><a href={source.url} rel="noopener noreferrer" target="_blank">{source.label}</a></li>)}</ol></section>}
      <Link href="/plemena" className="button button--dark">Späť do atlasu <ArrowIcon /></Link></div>
      <aside className="breed-side">{breed.editorialComplete && <div className="breed-side-card"><h3>Rýchly profil</h3><div className="breed-ratings"><RatingDots value={breed.energy} label="Energia" /><RatingDots value={breed.trainability} label="Cvičiteľnosť" /><RatingDots value={breed.children ?? breed.family} label="Vzťah k deťom" /><RatingDots value={breed.otherDogs ?? 3} label="Vzťah k psom" /><RatingDots value={breed.apartment ?? 3} label="Vhodnosť do bytu" /><RatingDots value={breed.grooming ?? 3} label="Starostlivosť" /><RatingDots value={breed.shedding ?? 3} label="Pĺznutie" /><RatingDots value={breed.preyDrive ?? 3} label="Lovecký inštinkt" /></div></div>}
        {breed.goodFor.length > 0 && <div className="breed-side-card"><h3>Pre koho je vhodný</h3><ul>{breed.goodFor.map((item) => <li key={item}>{item}</li>)}</ul></div>}
        {breed.consider.length > 0 && <div className="breed-side-card"><h3>Pre koho nemusí byť vhodný</h3><ul>{breed.consider.map((item) => <li key={item}>{item}</li>)}</ul></div>}</aside></div>
  </main>;
}
