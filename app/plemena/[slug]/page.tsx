import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RatingDots } from "@/components/breed-card";
import { BreedFciDisclosure } from "@/components/breed-fci-disclosure";
import { ArrowIcon, PawMark } from "@/components/icons";
import { breedAtlasHref } from "@/lib/breed-atlas";
import { breeds, getFciGroup } from "@/lib/content";
import { combinedFciMeasurement, publicBreedMeasurement, publicFciDate, publicFciSectionName, type FciStandard } from "@/lib/breed-fci";
import { getBreedDetailRelations, getPublishedBreed, type BreedEditorial, type BreedSport, type ManagedBreed } from "@/lib/breed-store";
import { articleHref, type ArticlePortalSection } from "@/lib/portal";
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
  const managedBreed = "id" in breed && typeof breed.id === "number" ? breed as ManagedBreed : null;
  const editorial: BreedEditorial = managedBreed?.editorial ?? {};
  const sports: BreedSport[] = managedBreed?.sports ?? [];
  const relations=managedBreed?await getBreedDetailRelations(managedBreed):{articles:[],breedingStations:[],breedClubs:[],similarBreeds:[]};
  const canonical = resolvedCanonical(breed.seo, `/plemena/${breed.slug}`);
  const publishedAt = "publishedAt" in breed && typeof breed.publishedAt === "string" ? breed.publishedAt : "2026-08-17";
  const updatedAt = "updatedAt" in breed && typeof breed.updatedAt === "string" ? breed.updatedAt : "2026-08-17";
  const gallery = breed.gallery ?? []; const healthRisks = breed.healthRisks ?? []; const sources = breed.sources ?? []; const fci: FciStandard = managedBreed?.fciStandard ?? {};
  const schema = { "@context": "https://schema.org", "@graph": [
    { "@type": "Article", "@id": `${canonical}#article`, url: canonical, mainEntityOfPage: { "@type": "WebPage", "@id": canonical },
      headline: `${breed.name} – povaha, potreby a profil plemena`, description: breed.intro || fci.povaha_temperament || managedBreed?.officialFciName,
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
  const sections = [{id:"prehlad-plemena",eyebrow:"Prehľad",title:"Prehľad plemena",content:editorial.overview},
    {id:"historia",eyebrow:"História",title:"História plemena",content:breed.history},
    {id:"povaha",eyebrow:"Povaha",title:"Povaha a temperament",content:breed.character},
    {id:"pohyb",eyebrow:"Pohyb",title:"Pohyb a denné potreby",content:breed.exercise || breed.needs,tip:editorial.exerciseTip},
    {id:"vycvik",eyebrow:"Výcvik",title:"Výcvik a výchova",content:breed.training,tip:editorial.trainingTip},
    {id:"zdravie",eyebrow:"Zdravie",title:"Zdravie a starostlivosť",content:breed.health,tip:editorial.healthTip},
    {id:"srst",eyebrow:"Starostlivosť",title:"Srsť a údržba",content:editorial.coatCare,tip:editorial.coatTip},
    {id:"rodina",eyebrow:"Praktický život",title:"Život s rodinou a deťmi",content:editorial.familyLife},
    {id:"ine-psy",eyebrow:"Praktický život",title:"Vzťah k iným psom",content:editorial.otherDogsLife},
    {id:"zaujimavosti",eyebrow:"Zaujímavosti",title:"Zaujímavosti",content:editorial.curiosities},
    {id:"chyby-majitelov",eyebrow:"Praktický sprievodca",title:"Časté chyby majiteľov",content:editorial.commonOwnerMistakes}].filter((section) => Boolean(section.content));
  const hasFciStandard = Boolean(managedBreed?.fciNumber || Object.keys(fci).length > 0);
  const fciSections = [
    fciTextSection("fci-historia", "História a využitie", "História", [["Historický súhrn",fci.historicky_suhrn]]),
    fciTextSection("fci-vzhlad", "Celkový vzhľad a proporcie", "Vzhľad", [["Celkový vzhľad",fci.celkovy_vzhlad],["Dôležité proporcie",fci.dolezite_proporcie]]),
    fciTextSection("fci-povaha", "Povaha a temperament", "Povaha", [["Povaha a temperament",fci.povaha_temperament]]),
    fciTextSection("fci-hlava", "Hlava", "Hlava", [["Lebečná časť",fci.hlava_lebecna_cast],["Tvárová časť",fci.hlava_tvarova_cast],["Oči",fci.oci],["Uši",fci.usi]]),
    fciTextSection("fci-telo", "Telo", "Telo", [["Krk",fci.krk],["Telo",fci.telo],["Chvost",fci.chvost]]),
    fciTextSection("fci-koncatiny", "Končatiny a pohyb", "Končatiny", [["Predné končatiny",fci.predne_koncatiny],["Zadné končatiny",fci.zadne_koncatiny],["Pohyb",fci.pohyb]]),
    fciTextSection("fci-srst", "Koža, srsť a farba", "Srsť", [["Koža",fci.koza],["Srsť",fci.srst],["Farba",fci.farba]]),
  ].filter((section): section is FciTextSection => Boolean(section));
  const fciDogHeight = publicBreedMeasurement(fci.vyska_pes_cm,"height");
  const fciBitchHeight = publicBreedMeasurement(fci.vyska_suka_cm,"height");
  const fciDogWeight = publicBreedMeasurement(fci.hmotnost_pes_kg,"weight");
  const fciBitchWeight = publicBreedMeasurement(fci.hmotnost_suka_kg,"weight");
  const dimensionRows = [
    { label: "Výška", dog: fciDogHeight, bitch: fciBitchHeight },
    { label: "Hmotnosť", dog: fciDogWeight, bitch: fciBitchWeight },
  ].filter((row) => row.dog || row.bitch);
  const faultSection = fciTextSection("fci-chyby", "Chyby", "Chyby", [["Chyby",fci.chyby],["Závažné chyby",fci.zavazne_chyby],["Diskvalifikačné chyby",fci.diskvalifikacne_chyby]]);
  const breedingSection = fciTextSection("fci-chov", "Poznámka k chovu", "Chovná poznámka", [["Poznámka k chovu",fci.poznamka_chov]]);
  const fciNavigation = [
    ...fciSections.map((section) => ({ href: `#${section.id}`, label: section.navLabel })),
    ...(dimensionRows.length || fci.velkost_hmotnost_poznamka ? [{ href: "#fci-rozmery", label: "Rozmery" }] : []),
    ...(faultSection ? [{ href: "#fci-chyby", label: "Chyby" }] : []),
    ...(breedingSection ? [{ href: "#fci-chov", label: "Chovná poznámka" }] : []),
  ];
  const detailNavigation = [
    {href:"#prehlad",label:"Prehľad",show:true},
    {href:"#povaha",label:"Povaha",show:sections.some((section)=>section.id==="povaha")},
    {href:"#pohyb",label:"Pohyb",show:sections.some((section)=>section.id==="pohyb")},
    {href:"#vycvik",label:"Výcvik",show:sections.some((section)=>section.id==="vycvik")},
    {href:"#zdravie",label:"Zdravie",show:sections.some((section)=>section.id==="zdravie") || healthRisks.length > 0},
    {href:"#sporty",label:"Športy",show:sports.length>0},
    {href:"#fci-standard",label:"Oficiálny FCI štandard",show:hasFciStandard},
    {href:"#suvisiaci-obsah",label:"Súvisiaci obsah",show:relations.articles.length+relations.breedingStations.length+relations.breedClubs.length>0},
  ].filter((item)=>item.show);
  const hasPracticalContent = sections.length > 0 || healthRisks.length > 0 || sources.length > 0 || breed.goodFor.length > 0 || breed.consider.length > 0;
  const fciGroupName = getFciGroup(breed.fciGroup)?.label || fci.fci_skupina_nazov || breed.group;
  const fciSectionNumber = managedBreed?.fciSectionNumber.trim() ?? "";
  const storedSectionName = (fci.fci_sekcia_nazov || breed.fciSection).trim();
  const fciSectionName = publicFciSectionName(breed.fciGroup, fciSectionNumber, storedSectionName && storedSectionName !== fciSectionNumber ? storedSectionName : "");
  const heroHeight = publicBreedMeasurement(breed.height,"height",combinedFciMeasurement([fciDogHeight, fciBitchHeight], "cm"));
  const heroWeight = publicBreedMeasurement(breed.weight,"weight",combinedFciMeasurement([fciDogWeight, fciBitchWeight], "kg"));
  const heroLifespan = publicBreedMeasurement(breed.lifespan,"lifespan");
  const heroTraits=editorial.heroTraits?.filter((item)=>item.label.trim()).slice(0,3)??[];
  const fciGroupHref = breedAtlasHref({ query: "", fciGroup: String(breed.fciGroup), fciSection: "", origin: "", energy: "all" });
  const fciSectionHref = fciSectionNumber ? breedAtlasHref({ query: "", fciGroup: String(breed.fciGroup), fciSection: fciSectionNumber, origin: "", energy: "all" }) : "";

  return <main id="obsah">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(schema) }} />
    <header className="breed-detail-hero shell" id="prehlad"><nav className="article-breadcrumbs" aria-label="Navigácia"><Link href="/">Domov</Link><span>/</span><Link href="/plemena">Plemená</Link><span>/</span><span>{breed.name}</span></nav>
      <div className={`breed-detail-card${breed.image ? "" : " breed-detail-card--placeholder"}`}>
        <div className="breed-detail-intro">
          {managedBreed?.fciNumber && <div className="breed-hero-meta"><span>FCI č. {managedBreed.fciNumber}</span></div>}
          <h1>{breed.name}</h1>
          {managedBreed?.officialFciName && <p className="breed-official-name">{managedBreed.officialFciName}</p>}
          <div className="breed-fci-path" aria-label="FCI zaradenie plemena"><Link href={fciGroupHref} className="breed-fci-path-node" aria-label={`FCI skupina ${breed.fciGroup}: ${fciGroupName}`}><small>Skupina {breed.fciGroup}</small><strong>{fciGroupName}</strong></Link>{(fciSectionNumber || fciSectionName) && <><span className="breed-fci-path-arrow" aria-hidden="true">·</span>{fciSectionHref ? <Link href={fciSectionHref} className="breed-fci-path-node" aria-label={`FCI sekcia ${fciSectionNumber}${fciSectionName ? `: ${fciSectionName}` : ""}`}><small>Sekcia {fciSectionNumber}</small>{fciSectionName && <strong>{fciSectionName}</strong>}</Link> : <span className="breed-fci-path-node"><small>FCI sekcia</small>{fciSectionName && <strong>{fciSectionName}</strong>}</span>}</>}<span className="breed-fci-path-current"><small>Plemeno</small><strong>{breed.name}</strong></span></div>
          {breed.intro && <p className="breed-lead">{breed.intro}</p>}
        </div>
        {breed.image ? <img className="breed-detail-image" src={breed.image} alt={`${breed.name} – titulná fotografia plemena`} /> : <div className="breed-detail-image breed-detail-image--empty" role="img" aria-label={`Fotografia plemena ${breed.name} sa pripravuje`}><span className="breed-placeholder-mark" aria-hidden="true"><PawMark size={68}/></span><span>Fotografia sa pripravuje</span><small>Profil doplníme o autentický záber plemena.</small></div>}
        {(heroTraits.length>0||managedBreed?.editorialComplete) && <div className="breed-hero-ratings" aria-label="Redakčné hodnotenie plemena">{heroTraits.length>0?heroTraits.map((trait)=><RatingDots value={trait.rating} label={trait.label} key={trait.label}/>):<><RatingDots value={managedBreed!.energy} label="Energia"/><RatingDots value={managedBreed!.trainability} label="Cvičiteľnosť"/><RatingDots value={managedBreed!.children??managedBreed!.family} label="Rodina"/></>}</div>}
        <h2 className="sr-only">Plemeno v skratke</h2>
          <dl className="breed-hero-facts">{breed.origin && <div><dt>Pôvod</dt><dd>{breed.origin}</dd></div>}{heroHeight && <div><dt>Výška</dt><dd>{fciDogHeight&&<small>Pes: {fciDogHeight}</small>}{fciBitchHeight&&<small>Suka: {fciBitchHeight}</small>}{(fciDogHeight||fciBitchHeight)&&<span className="sr-only">Spolu {heroHeight}</span>}{!fciDogHeight&&!fciBitchHeight&&heroHeight}</dd></div>}{heroWeight && <div><dt>Hmotnosť</dt><dd>{fciDogWeight&&<small>Pes: {fciDogWeight}</small>}{fciBitchWeight&&<small>Suka: {fciBitchWeight}</small>}{(fciDogWeight||fciBitchWeight)&&<span className="sr-only">Spolu {heroWeight}</span>}{!fciDogWeight&&!fciBitchWeight&&heroWeight}</dd></div>}{fci.vyuzitie && <div><dt>Využitie</dt><dd>{fci.vyuzitie}</dd></div>}{heroLifespan && <div><dt>Dĺžka života</dt><dd>{heroLifespan}</dd></div>}</dl>
      </div></header>
    <nav className="breed-detail-nav" aria-label="Obsah profilu plemena"><div className="shell">{detailNavigation.map((item)=><a href={item.href} key={item.href}>{item.label}</a>)}</div></nav>
    {gallery.length > 0 && <section className="breed-gallery shell" aria-label={`Fotografie plemena ${breed.name}`}>{gallery.map((item, index) => <figure key={`${item.imageUrl}-${index}`}><img src={item.imageUrl} alt={item.alt || `${breed.name} – fotografia ${index + 1}`} />{(item.caption || item.credit) && <figcaption>{item.caption}{item.caption && item.credit ? " · " : ""}{item.credit && <span>Foto: {item.credit}</span>}</figcaption>}</figure>)}</section>}
    {hasPracticalContent && <div className="breed-detail-body breed-detail-body--single shell"><div className="breed-copy">
      {sections.slice(0,3).map((section) => <section id={section.id} className="breed-practical-section" key={section.id}><span className="eyebrow">{section.eyebrow}</span><div className="breed-section-heading"><span aria-hidden="true"><PawMark size={18}/></span><h2>{section.title}</h2></div>{paragraphs(section.content).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}{"tip" in section&&section.tip&&<p className="breed-section-tip">{section.tip}</p>}</section>)}
      {(breed.goodFor.length>0||breed.consider.length>0)&&<section className="breed-practical-section breed-practical-fit" aria-label="Praktická vhodnosť plemena"><div className="breed-section-heading"><span aria-hidden="true"><PawMark size={18}/></span><h2>Pre koho je vhodný a pre koho nie</h2></div><div className="breed-practical-fit-grid">{breed.goodFor.length>0&&<div className="is-positive"><h3>Hodí sa pre</h3><ul>{breed.goodFor.map((item)=><li key={item}>{item}</li>)}</ul></div>}{breed.consider.length>0&&<div className="is-caution"><h3>Treba zvážiť</h3><ul>{breed.consider.map((item)=><li key={item}>{item}</li>)}</ul></div>}</div></section>}
      {sections.slice(3).map((section) => <section id={section.id} className="breed-practical-section" key={section.id}><span className="eyebrow">{section.eyebrow}</span><div className="breed-section-heading"><span aria-hidden="true"><PawMark size={18}/></span><h2>{section.title}</h2></div>{paragraphs(section.content).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}{"tip" in section&&section.tip&&<p className="breed-section-tip">{section.tip}</p>}</section>)}
      {healthRisks.length > 0 && <section id={sections.some((section)=>section.id==="zdravie") ? undefined : "zdravie"} className="breed-practical-section"><span className="eyebrow">Zdravie</span><h2>Typické zdravotné riziká</h2><ul className="breed-health-risks">{healthRisks.map((item) => <li key={item}>{item}</li>)}</ul></section>}
      {sources.length > 0 && <section><span className="eyebrow">Overené informácie</span><h2>Odborné zdroje</h2><ol className="breed-source-list">{sources.map((source) => <li key={`${source.label}-${source.url}`}><a href={source.url} rel="noopener noreferrer" target="_blank">{source.label}</a></li>)}</ol></section>}
      </div></div>}
    {sports.length>0&&<section className="breed-sports shell" id="sporty"><header><span className="eyebrow">Pohyb a spolupráca</span><h2>Vhodnosť pre športy a aktivity</h2><p>Redakčné hodnotenie konkrétneho plemena, nie automatický odhad podľa FCI skupiny.</p></header><div>{sports.map((sport)=><article key={sport.key}><div><h3>{sport.label}</h3><span aria-label={`${sport.rating} z 5`}>{Array.from({length:5},(_,index)=><i className={index<sport.rating?"is-filled":""} key={index}/>)}</span></div>{sport.note&&<p>{sport.note}</p>}</article>)}</div></section>}
    {hasFciStandard && <section className="breed-fci-standard shell" id="fci-standard"><div className="breed-fci-reading-column"><header className="breed-fci-header"><span className="eyebrow">Odborná referencia</span><h2>Oficiálny FCI štandard</h2><p className="breed-fci-intro">Technický štandard Fédération Cynologique Internationale je dostupný celý v jednom bloku.</p></header><div className="breed-fci-standard-path" aria-label="FCI skupina a sekcia"><Link href={fciGroupHref} aria-label={`FCI skupina ${breed.fciGroup}: ${fciGroupName}`}><small>FCI skupina {breed.fciGroup}<span aria-hidden="true"> · </span></small><strong>{fciGroupName}</strong></Link>{(fciSectionNumber || fciSectionName) && <><span aria-hidden="true">→</span>{fciSectionHref ? <Link href={fciSectionHref} aria-label={`FCI sekcia ${fciSectionNumber}${fciSectionName ? `: ${fciSectionName}` : ""}`}><small>Sekcia {fciSectionNumber}<span aria-hidden="true"> · </span></small>{fciSectionName && <strong>{fciSectionName}</strong>}</Link> : <div><small>FCI sekcia<span aria-hidden="true"> · </span></small>{fciSectionName && <strong>{fciSectionName}</strong>}</div>}</>}</div><dl className="breed-fci-basics">
      {managedBreed?.fciNumber && <div><dt>FCI číslo</dt><dd>{managedBreed?.fciNumber}</dd></div>}
      {breed.origin && <div><dt>Krajina pôvodu</dt><dd>{breed.origin}</dd></div>}
      {fci.vyuzitie && <div><dt>Využitie</dt><dd>{fci.vyuzitie}</dd></div>}
      {managedBreed?.workingTrial && <div><dt>Pracovná skúška</dt><dd>{managedBreed?.workingTrial}</dd></div>}
      {managedBreed?.validStandardDate && <div><dt>Dátum platného štandardu</dt><dd>{publicFciDate(managedBreed?.validStandardDate)}</dd></div>}
    </dl>
    <BreedFciDisclosure>{fciNavigation.length > 0 && <nav className="breed-fci-anchor-nav" aria-label="Obsah FCI štandardu"><span>V tejto časti</span><div>{fciNavigation.map((item) => <a href={item.href} key={item.href}>{item.label}</a>)}</div></nav>}
    <div className="breed-fci-open-content">{fciSections.map((section) => <section className="breed-fci-open-section" id={section.id} key={section.id}><h3>{section.title}</h3>{section.items.map((item) => <div className="breed-fci-open-item" key={item.label}>{section.items.length > 1 && <h4>{item.label}</h4>}{item.paragraphs.map((paragraph, index) => <p key={`${item.label}-${index}`}>{paragraph}</p>)}</div>)}</section>)}
      {(dimensionRows.length > 0 || fci.velkost_hmotnost_poznamka) && <section className="breed-fci-open-section" id="fci-rozmery"><h3>Výška a hmotnosť</h3>{dimensionRows.length > 0 && <table className="breed-fci-dimensions"><caption className="sr-only">Výška a hmotnosť psa a suky</caption><thead><tr><th scope="col">Parameter</th><th scope="col">Pes</th><th scope="col">Suka</th></tr></thead><tbody>{dimensionRows.map((row) => <tr key={row.label}><th scope="row">{row.label}</th><td>{row.dog || "—"}</td><td>{row.bitch || "—"}</td></tr>)}</tbody></table>}{paragraphs(fci.velkost_hmotnost_poznamka).map((paragraph, index) => <p className="breed-fci-dimensions-note" key={`dimensions-${index}`}>{paragraph}</p>)}</section>}
      {faultSection && <section className="breed-fci-open-section breed-fci-open-section--faults" id={faultSection.id}><h3>{faultSection.title}</h3>{faultSection.items.map((item) => <div className="breed-fci-open-item" key={item.label}>{item.label !== faultSection.title && <h4>{item.label}</h4>}{item.paragraphs.map((paragraph, index) => <p key={`${item.label}-${index}`}>{paragraph}</p>)}</div>)}</section>}
      {breedingSection && <section className="breed-fci-open-section" id={breedingSection.id}><h3>{breedingSection.title}</h3>{breedingSection.items.flatMap((item) => item.paragraphs).map((paragraph, index) => <p key={`breeding-${index}`}>{paragraph}</p>)}</section>}
    </div>
    {(fci.fci_nomenklatura_url || fci.fci_standard_pdf || fci.zdroj_poznamka) && <div className="breed-fci-sources"><h3>Oficiálny štandard</h3><p>Údaje vychádzajú z nomenklatúry a oficiálneho štandardu Fédération Cynologique Internationale (FCI).</p><div>{fci.fci_nomenklatura_url && <a href={fci.fci_nomenklatura_url} target="_blank" rel="noopener noreferrer">FCI nomenklatúra</a>}{fci.fci_standard_pdf && <a href={fci.fci_standard_pdf} target="_blank" rel="noopener noreferrer">Oficiálny PDF štandard</a>}</div></div>}
    </BreedFciDisclosure></div></section>}
    {relations.articles.length>0&&<section className="breed-related-section shell" id="suvisiaci-obsah"><header><span className="eyebrow">Ďalšie čítanie</span><h2>Prehĺbte si vedomosti</h2></header><div className="breed-related-grid">{relations.articles.map((article)=><article key={article.id}>{article.image&&<img src={article.image} alt="" loading="lazy"/>}<div><small>Článok Psipedie</small><h3><Link href={articleHref({slug:article.slug,portalSection:article.portalSection as ArticlePortalSection})}>{article.title}</Link></h3><p>{article.excerpt}</p></div></article>)}</div></section>}
    {relations.breedingStations.length>0&&<section className="breed-related-section shell"><header><span className="eyebrow">Z našej databázy</span><h2>Chovateľské stanice</h2></header><div className="breed-directory-grid">{relations.breedingStations.map((profile)=><article key={profile.id}><h3><Link href={`/adresar/chovatelske-stanice/${profile.slug}`}>{profile.name}</Link></h3><p>{[profile.city,profile.region].filter(Boolean).join(" · ")}</p>{profile.excerpt&&<small>{profile.excerpt}</small>}</article>)}</div><Link className="text-link" href={`/adresar/chovatelske-stanice?breed=${encodeURIComponent(breed.name)}`}>Zobraziť všetky chovateľské stanice pre toto plemeno →</Link></section>}
    {relations.breedClubs.length>0&&<section className="breed-related-section shell"><header><span className="eyebrow">Organizácie a chov</span><h2>Chovateľský klub</h2></header><div className="breed-directory-grid">{relations.breedClubs.map((profile)=><article key={profile.id}><h3><Link href={`/adresar/chovatelske-kluby/${profile.slug}`}>{profile.name}</Link></h3><p>{[profile.city,profile.region].filter(Boolean).join(" · ")}</p>{profile.excerpt&&<small>{profile.excerpt}</small>}</article>)}</div></section>}
    <section className="breed-useful-links shell">
      <header><span className="eyebrow">Adresár Psipedie</span><h2>Užitočné odkazy a kontakty</h2><p>Nájdite organizácie a odborníkov, ktorí vám pomôžu s chovom, výcvikom aj aktivitami.</p></header>
      <div>
        <Link href="/adresar/chovatelske-kluby"><span className="breed-useful-icon" aria-hidden="true"><PawMark size={22}/></span><strong>Chovateľské kluby</strong><small>Kluby združujúce chovateľov a priaznivcov plemena.</small><span className="breed-useful-cta">Zobraziť kluby <ArrowIcon size={15}/></span></Link>
        <Link href="/adresar/chovatelske-stanice"><span className="breed-useful-icon" aria-hidden="true"><PawMark size={22}/></span><strong>Chovateľské stanice</strong><small>Publikované stanice v databáze Psipedie.</small><span className="breed-useful-cta">Zobraziť stanice <ArrowIcon size={15}/></span></Link>
        <Link href={`/adresar/treneri?breed=${encodeURIComponent(breed.name)}`}><span className="breed-useful-icon" aria-hidden="true"><PawMark size={22}/></span><strong>Psí tréneri</strong><small>Tréneri so skúsenosťami s pracovnými aj rodinnými psami.</small><span className="breed-useful-cta">Zobraziť trénerov <ArrowIcon size={15}/></span></Link>
        <Link href="/adresar/kynologicke-kluby"><span className="breed-useful-icon" aria-hidden="true"><PawMark size={22}/></span><strong>Kynologické kluby</strong><small>Kluby pre šport, výcvik a praktické aktivity.</small><span className="breed-useful-cta">Zobraziť kluby <ArrowIcon size={15}/></span></Link>
      </div>
    </section>
    {relations.similarBreeds.length>0&&<section className="breed-related-section shell"><header><span className="eyebrow">Objavte ďalšie profily</span><h2>Podobné plemená</h2></header><div className="breed-similar-grid">{relations.similarBreeds.map((item)=><Link href={`/plemena/${item.slug}`} key={item.id}>{item.image?<img src={item.image} alt="" loading="lazy"/>:<span aria-hidden="true"><PawMark size={30}/></span>}<strong>{item.name}</strong><small>FCI {item.fciGroup} · {item.fciSection}</small></Link>)}</div></section>}
    <div className="breed-detail-footer shell"><Link href="/plemena" className="button button--dark">Späť do atlasu <ArrowIcon /></Link></div>
  </main>;
}
