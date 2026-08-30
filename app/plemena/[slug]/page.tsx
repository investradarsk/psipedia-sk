import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RatingDots } from "@/components/breed-card";
import { ArrowIcon, PawMark } from "@/components/icons";
import { breedAtlasHref } from "@/lib/breed-atlas";
import { breeds } from "@/lib/content";
import { getPublishedBreed } from "@/lib/breed-store";
import { absoluteUrl, ORGANIZATION_ID, serializeJsonLd, SITE_URL } from "@/lib/seo";
import { breedSeoFallback, buildContentMetadata, resolvedCanonical } from "@/lib/content-seo";

type Props = { params: Promise<{ slug: string }> };
type FciTextSection = { id: string; title: string; navLabel: string; items: Array<{ label: string; paragraphs: string[] }> };
export const dynamic = "force-dynamic";
export function generateStaticParams() { return breeds.map((breed) => ({ slug: breed.slug })); }
function paragraphs(value?: string) { return value?.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean) ?? []; }
function fciTextSection(id: string, title: string, navLabel: string, values: Array<[string, string | undefined]>): FciTextSection | null {
  const items = values.map(([label, value]) => ({ label, paragraphs: paragraphs(value) })).filter((item) => item.paragraphs.length > 0);
  return items.length ? { id, title, navLabel, items } : null;
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
  const sections = [{id:"povaha",eyebrow:"Povaha",title:"Aký je doma a medzi ľuďmi",content:breed.character},
    {id:"historia",eyebrow:"História",title:"Pôvod a vývoj plemena",content:breed.history},
    {id:"pohyb",eyebrow:"Pohyb",title:"Koľko aktivity potrebuje",content:breed.exercise || breed.needs},
    {id:"vycvik",eyebrow:"Výcvik",title:"Ako s ním pracovať",content:breed.training},
    {id:"zdravie",eyebrow:"Zdravie",title:"Zdravie a prevencia",content:breed.health}].filter((section) => Boolean(section.content));
  const hasFciStandard = Boolean(breed.fciNumber || Object.keys(fci).length > 0);
  const fciSections = [
    fciTextSection("fci-historia", "História a využitie", "História", [["Historický súhrn",fci.historicky_suhrn]]),
    fciTextSection("fci-vzhlad", "Celkový vzhľad a proporcie", "Vzhľad", [["Celkový vzhľad",fci.celkovy_vzhlad],["Dôležité proporcie",fci.dolezite_proporcie]]),
    fciTextSection("fci-povaha", "Povaha a temperament", "Povaha", [["Povaha a temperament",fci.povaha_temperament]]),
    fciTextSection("fci-hlava", "Hlava", "Hlava", [["Lebečná časť",fci.hlava_lebecna_cast],["Tvárová časť",fci.hlava_tvarova_cast],["Oči",fci.oci],["Uši",fci.usi]]),
    fciTextSection("fci-telo", "Telo", "Telo", [["Krk",fci.krk],["Telo",fci.telo],["Chvost",fci.chvost]]),
    fciTextSection("fci-koncatiny", "Končatiny a pohyb", "Končatiny", [["Predné končatiny",fci.predne_koncatiny],["Zadné končatiny",fci.zadne_koncatiny],["Pohyb",fci.pohyb]]),
    fciTextSection("fci-srst", "Koža, srsť a farba", "Srsť", [["Koža",fci.koza],["Srsť",fci.srst],["Farba",fci.farba]]),
  ].filter((section): section is FciTextSection => Boolean(section));
  const dimensionRows = [
    { label: "Výška", dog: fci.vyska_pes_cm?.trim() || "", bitch: fci.vyska_suka_cm?.trim() || "" },
    { label: "Hmotnosť", dog: fci.hmotnost_pes_kg?.trim() || "", bitch: fci.hmotnost_suka_kg?.trim() || "" },
  ].filter((row) => row.dog || row.bitch);
  const faultSection = fciTextSection("fci-chyby", "Chyby", "Chyby", [["Chyby",fci.chyby],["Závažné chyby",fci.zavazne_chyby],["Diskvalifikačné chyby",fci.diskvalifikacne_chyby]]);
  const breedingSection = fciTextSection("fci-chov", "Poznámka k chovu", "Chov", [["Poznámka k chovu",fci.poznamka_chov]]);
  const fciNavigation = [
    ...fciSections.map((section) => ({ href: `#${section.id}`, label: section.navLabel })),
    ...(dimensionRows.length || fci.velkost_hmotnost_poznamka ? [{ href: "#fci-rozmery", label: "Rozmery" }] : []),
    ...(faultSection ? [{ href: "#fci-chyby", label: "Chyby" }] : []),
    ...(breedingSection ? [{ href: "#fci-chov", label: "Chov" }] : []),
  ];
  const detailNavigation = [
    {href:"#prehlad",label:"Prehľad",show:true},
    {href:"#povaha",label:"Povaha",show:sections.some((section)=>section.id==="povaha")},
    {href:"#pohyb",label:"Pohyb",show:sections.some((section)=>section.id==="pohyb")},
    {href:"#vycvik",label:"Výcvik",show:sections.some((section)=>section.id==="vycvik")},
    {href:"#zdravie",label:"Zdravie",show:sections.some((section)=>section.id==="zdravie") || healthRisks.length > 0},
    {href:"#fci-standard",label:"FCI štandard",show:hasFciStandard},
  ].filter((item)=>item.show);
  const hasSidebar = breed.editorialComplete || breed.goodFor.length > 0 || breed.consider.length > 0;
  const hasPracticalContent = sections.length > 0 || healthRisks.length > 0 || sources.length > 0 || hasSidebar;
  const fciGroupName = fci.fci_skupina_nazov || breed.group;
  const fciSectionNumber = breed.fciSectionNumber.trim();
  const storedSectionName = (fci.fci_sekcia_nazov || breed.fciSection).trim();
  const fciSectionName = storedSectionName && storedSectionName !== fciSectionNumber ? storedSectionName : "";
  const fciGroupHref = breedAtlasHref({ query: "", fciGroup: String(breed.fciGroup), fciSection: "", origin: "", energy: "all" });
  const fciSectionHref = fciSectionNumber ? breedAtlasHref({ query: "", fciGroup: String(breed.fciGroup), fciSection: fciSectionNumber, origin: "", energy: "all" }) : "";

  return <main id="obsah">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(schema) }} />
    <header className="breed-detail-hero shell" id="prehlad"><nav className="article-breadcrumbs" aria-label="Navigácia"><Link href="/">Domov</Link><span>/</span><Link href="/plemena">Plemená</Link><span>/</span><span>{breed.name}</span></nav>
      <div className="breed-detail-card"><div className="breed-detail-intro">{breed.fciNumber && <div className="breed-hero-meta"><span>FCI č. {breed.fciNumber}</span></div>}<div className="breed-fci-path" aria-label="FCI zaradenie plemena"><Link href={fciGroupHref} className="breed-fci-path-node"><small>FCI skupina {breed.fciGroup}</small><strong>{fciGroupName}</strong></Link>{(fciSectionNumber || fciSectionName) && <><span className="breed-fci-path-arrow" aria-hidden="true">→</span>{fciSectionHref ? <Link href={fciSectionHref} className="breed-fci-path-node"><small>Sekcia {fciSectionNumber}</small>{fciSectionName && <strong>{fciSectionName}</strong>}</Link> : <span className="breed-fci-path-node"><small>FCI sekcia</small>{fciSectionName && <strong>{fciSectionName}</strong>}</span>}</>}<span className="breed-fci-path-arrow" aria-hidden="true">→</span><div className="breed-fci-path-node breed-fci-path-node--breed"><small>Plemeno</small><h1>{breed.name}</h1></div></div>{breed.officialFciName && <p className="breed-official-name">{breed.officialFciName}</p>}{breed.intro && <p className="breed-lead">{breed.intro}</p>}<dl className="breed-hero-facts">{breed.origin && <div><dt>Pôvod</dt><dd>{breed.origin}</dd></div>}{breed.height && <div><dt>Výška</dt><dd>{breed.height}</dd></div>}{breed.weight && <div><dt>Hmotnosť</dt><dd>{breed.weight}</dd></div>}{breed.lifespan && <div><dt>Dĺžka života</dt><dd>{breed.lifespan}</dd></div>}{fci.vyuzitie && <div><dt>Využitie</dt><dd>{fci.vyuzitie}</dd></div>}</dl></div>{breed.image ? <img className="breed-detail-image" src={breed.image} alt={`${breed.name} – titulná fotografia plemena`} /> : <div className="breed-detail-image breed-detail-image--empty" aria-hidden="true"><PawMark size={88}/><span>Fotografia sa pripravuje</span></div>}</div></header>
    <nav className="breed-detail-nav" aria-label="Obsah profilu plemena"><div className="shell">{detailNavigation.map((item)=><a href={item.href} key={item.href}>{item.label}</a>)}</div></nav>
    {gallery.length > 0 && <section className="breed-gallery shell" aria-label={`Fotografie plemena ${breed.name}`}>{gallery.map((item, index) => <figure key={`${item.imageUrl}-${index}`}><img src={item.imageUrl} alt={item.alt || `${breed.name} – fotografia ${index + 1}`} />{(item.caption || item.credit) && <figcaption>{item.caption}{item.caption && item.credit ? " · " : ""}{item.credit && <span>Foto: {item.credit}</span>}</figcaption>}</figure>)}</section>}
    {hasPracticalContent && <div className={`breed-detail-body shell${hasSidebar ? "" : " breed-detail-body--single"}`}><div className="breed-copy">
      {sections.map((section) => <section id={section.id} className="breed-practical-section" key={section.id}><span className="eyebrow">{section.eyebrow}</span><h2>{section.title}</h2>{paragraphs(section.content).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</section>)}
      {healthRisks.length > 0 && <section id={sections.some((section)=>section.id==="zdravie") ? undefined : "zdravie"} className="breed-practical-section"><span className="eyebrow">Zdravie</span><h2>Typické zdravotné riziká</h2><ul className="breed-health-risks">{healthRisks.map((item) => <li key={item}>{item}</li>)}</ul></section>}
      {sources.length > 0 && <section><span className="eyebrow">Overené informácie</span><h2>Odborné zdroje</h2><ol className="breed-source-list">{sources.map((source) => <li key={`${source.label}-${source.url}`}><a href={source.url} rel="noopener noreferrer" target="_blank">{source.label}</a></li>)}</ol></section>}
      </div>{hasSidebar && <aside className="breed-side">{breed.editorialComplete && <div className="breed-side-card"><h3>Rýchly profil</h3><div className="breed-ratings"><RatingDots value={breed.energy} label="Energia" /><RatingDots value={breed.trainability} label="Cvičiteľnosť" /><RatingDots value={breed.children ?? breed.family} label="Vzťah k deťom" /><RatingDots value={breed.otherDogs ?? 3} label="Vzťah k psom" /><RatingDots value={breed.apartment ?? 3} label="Vhodnosť do bytu" /><RatingDots value={breed.grooming ?? 3} label="Starostlivosť" /><RatingDots value={breed.shedding ?? 3} label="Pĺznutie" /><RatingDots value={breed.preyDrive ?? 3} label="Lovecký inštinkt" /></div></div>}
        {breed.goodFor.length > 0 && <div className="breed-side-card"><h3>Pre koho je vhodný</h3><ul>{breed.goodFor.map((item) => <li key={item}>{item}</li>)}</ul></div>}
        {breed.consider.length > 0 && <div className="breed-side-card"><h3>Pre koho nemusí byť vhodný</h3><ul>{breed.consider.map((item) => <li key={item}>{item}</li>)}</ul></div>}</aside>}</div>}
    {hasFciStandard && <section className="breed-fci-standard shell" id="fci-standard"><div className="breed-fci-reading-column"><span className="eyebrow">Odborná referencia</span><h2>FCI štandard</h2><p className="breed-fci-intro">Oficiálna charakteristika plemena podľa údajov uložených z nomenklatúry a štandardu FCI.</p><div className="breed-fci-standard-path" aria-label="FCI skupina a sekcia"><Link href={fciGroupHref}><small>FCI skupina {breed.fciGroup}</small><strong>{fciGroupName}</strong></Link>{(fciSectionNumber || fciSectionName) && <><span aria-hidden="true">→</span>{fciSectionHref ? <Link href={fciSectionHref}><small>Sekcia {fciSectionNumber}</small>{fciSectionName && <strong>{fciSectionName}</strong>}</Link> : <div><small>FCI sekcia</small>{fciSectionName && <strong>{fciSectionName}</strong>}</div>}</>}</div><dl className="breed-fci-basics">
      {breed.fciNumber && <div><dt>FCI číslo</dt><dd>{breed.fciNumber}</dd></div>}
      {breed.origin && <div><dt>Krajina pôvodu</dt><dd>{breed.origin}</dd></div>}
      {fci.vyuzitie && <div><dt>Využitie</dt><dd>{fci.vyuzitie}</dd></div>}
      {breed.workingTrial && <div><dt>Pracovná skúška</dt><dd>{breed.workingTrial}</dd></div>}
      {breed.validStandardDate && <div><dt>Dátum platného štandardu</dt><dd>{breed.validStandardDate}</dd></div>}
    </dl>
    {fciNavigation.length > 0 && <nav className="breed-fci-anchor-nav" aria-label="Obsah FCI štandardu"><span>V tejto časti</span><div>{fciNavigation.map((item) => <a href={item.href} key={item.href}>{item.label}</a>)}</div></nav>}
    <div className="breed-fci-open-content">{fciSections.map((section) => <section className="breed-fci-open-section" id={section.id} key={section.id}><h3>{section.title}</h3>{section.items.map((item) => <div className="breed-fci-open-item" key={item.label}>{section.items.length > 1 && <h4>{item.label}</h4>}{item.paragraphs.map((paragraph, index) => <p key={`${item.label}-${index}`}>{paragraph}</p>)}</div>)}</section>)}
      {(dimensionRows.length > 0 || fci.velkost_hmotnost_poznamka) && <section className="breed-fci-open-section" id="fci-rozmery"><h3>Výška a hmotnosť</h3>{dimensionRows.length > 0 && <table className="breed-fci-dimensions"><caption className="sr-only">Výška a hmotnosť psa a suky</caption><thead><tr><th scope="col"><span className="sr-only">Parameter</span></th><th scope="col">Pes</th><th scope="col">Suka</th></tr></thead><tbody>{dimensionRows.map((row) => <tr key={row.label}><th scope="row">{row.label}</th><td>{row.dog || "—"}</td><td>{row.bitch || "—"}</td></tr>)}</tbody></table>}{paragraphs(fci.velkost_hmotnost_poznamka).map((paragraph, index) => <p className="breed-fci-dimensions-note" key={`dimensions-${index}`}>{paragraph}</p>)}</section>}
      {faultSection && <section className="breed-fci-open-section breed-fci-open-section--faults" id={faultSection.id}><h3>{faultSection.title}</h3>{faultSection.items.map((item) => <div className="breed-fci-open-item" key={item.label}><h4>{item.label}</h4>{item.paragraphs.map((paragraph, index) => <p key={`${item.label}-${index}`}>{paragraph}</p>)}</div>)}</section>}
      {breedingSection && <section className="breed-fci-open-section" id={breedingSection.id}><h3>{breedingSection.title}</h3>{breedingSection.items.flatMap((item) => item.paragraphs).map((paragraph, index) => <p key={`breeding-${index}`}>{paragraph}</p>)}</section>}
    </div>
    {(fci.fci_nomenklatura_url || fci.fci_standard_pdf || fci.zdroj_poznamka) && <div className="breed-fci-sources"><h3>Oficiálny štandard</h3>{fci.zdroj_poznamka && <p>{fci.zdroj_poznamka}</p>}<div>{fci.fci_nomenklatura_url && <a href={fci.fci_nomenklatura_url} target="_blank" rel="noopener noreferrer">FCI nomenklatúra</a>}{fci.fci_standard_pdf && <a href={fci.fci_standard_pdf} target="_blank" rel="noopener noreferrer">FCI PDF štandard</a>}</div></div>}
    </div></section>}
    <div className="breed-detail-footer shell"><Link href="/plemena" className="button button--dark">Späť do atlasu <ArrowIcon /></Link></div>
  </main>;
}
