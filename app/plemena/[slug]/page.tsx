import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RatingDots } from "@/components/breed-card";
import { ArrowIcon } from "@/components/icons";
import { breeds } from "@/lib/content";
import { getPublishedBreed } from "@/lib/breed-store";
import { absoluteUrl, buildPageMetadata, ORGANIZATION_ID, serializeJsonLd, SITE_URL } from "@/lib/seo";

type Props = { params: Promise<{ slug: string }> };
export const dynamic = "force-dynamic";
export function generateStaticParams() { return breeds.map((breed) => ({ slug: breed.slug })); }
function paragraphs(value?: string) { return value?.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean) ?? []; }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params; const breed = await getPublishedBreed(slug);
  return breed ? buildPageMetadata({ title: breed.name, description: breed.intro, path: `/plemena/${breed.slug}`, image: breed.image,
    imageAlt: `${breed.name} – profil plemena`, type: "article",
    publishedTime: "publishedAt" in breed && typeof breed.publishedAt === "string" ? breed.publishedAt : "2026-08-17",
    modifiedTime: "updatedAt" in breed && typeof breed.updatedAt === "string" ? breed.updatedAt : "2026-08-17", authors: ["Redakcia Psipedia"],
    section: "Plemená psov", tags: [breed.name, `FCI skupina ${breed.fciGroup}`, breed.origin] }) : {};
}

export default async function BreedDetailPage({ params }: Props) {
  const { slug } = await params; const breed = await getPublishedBreed(slug); if (!breed) notFound();
  const canonical = `${SITE_URL}/plemena/${breed.slug}`;
  const publishedAt = "publishedAt" in breed && typeof breed.publishedAt === "string" ? breed.publishedAt : "2026-08-17";
  const updatedAt = "updatedAt" in breed && typeof breed.updatedAt === "string" ? breed.updatedAt : "2026-08-17";
  const gallery = breed.gallery ?? []; const healthRisks = breed.healthRisks ?? []; const sources = breed.sources ?? [];
  const schema = { "@context": "https://schema.org", "@graph": [
    { "@type": "Article", "@id": `${canonical}#article`, url: canonical, mainEntityOfPage: { "@type": "WebPage", "@id": canonical },
      headline: `${breed.name} – povaha, potreby a profil plemena`, description: breed.intro,
      image: [absoluteUrl(breed.image), ...gallery.map((item) => absoluteUrl(item.imageUrl))], datePublished: publishedAt,
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
      <div className="breed-detail-card"><div><span className="eyebrow">FCI {breed.fciGroup} · {breed.fciSection} · {breed.origin}</span><h1>{breed.name}</h1><p>{breed.intro}</p></div><img className="breed-detail-image" src={breed.image} alt={`${breed.name} – titulná fotografia plemena`} /></div></header>
    <section className="shell"><div className="breed-facts"><div><span>FCI skupina</span><strong>{breed.fciGroup}. {breed.fciSection}</strong></div><div><span>Krajina pôvodu</span><strong>{breed.origin}</strong></div><div><span>Veľkosť</span><strong>{breed.size}</strong></div><div><span>Hmotnosť</span><strong>{breed.weight}</strong></div>{breed.height && <div><span>Výška</span><strong>{breed.height}</strong></div>}<div><span>Dĺžka života</span><strong>{breed.lifespan}</strong></div><div><span>Srsť</span><strong>{breed.coat}</strong></div></div></section>
    {gallery.length > 0 && <section className="breed-gallery shell" aria-label={`Fotografie plemena ${breed.name}`}>{gallery.map((item, index) => <figure key={`${item.imageUrl}-${index}`}><img src={item.imageUrl} alt={item.alt || `${breed.name} – fotografia ${index + 1}`} />{(item.caption || item.credit) && <figcaption>{item.caption}{item.caption && item.credit ? " · " : ""}{item.credit && <span>Foto: {item.credit}</span>}</figcaption>}</figure>)}</section>}
    <div className="breed-detail-body shell"><div className="breed-copy">
      {sections.map(([eyebrow, title, content]) => <section key={eyebrow}><span className="eyebrow">{eyebrow}</span><h2>{title}</h2>{paragraphs(content).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</section>)}
      {healthRisks.length > 0 && <section><span className="eyebrow">Zdravie</span><h2>Typické zdravotné riziká</h2><ul className="breed-health-risks">{healthRisks.map((item) => <li key={item}>{item}</li>)}</ul></section>}
      {sources.length > 0 && <section><span className="eyebrow">Overené informácie</span><h2>Odborné zdroje</h2><ol className="breed-source-list">{sources.map((source) => <li key={`${source.label}-${source.url}`}><a href={source.url} rel="noopener noreferrer" target="_blank">{source.label}</a></li>)}</ol></section>}
      <Link href="/plemena" className="button button--dark">Späť do atlasu <ArrowIcon /></Link></div>
      <aside className="breed-side"><div className="breed-side-card"><h3>Rýchly profil</h3><div className="breed-ratings"><RatingDots value={breed.energy} label="Energia" /><RatingDots value={breed.trainability} label="Cvičiteľnosť" /><RatingDots value={breed.children ?? breed.family} label="Vzťah k deťom" /><RatingDots value={breed.otherDogs ?? 3} label="Vzťah k psom" /><RatingDots value={breed.apartment ?? 3} label="Vhodnosť do bytu" /><RatingDots value={breed.grooming ?? 3} label="Starostlivosť" /><RatingDots value={breed.shedding ?? 3} label="Pĺznutie" /><RatingDots value={breed.preyDrive ?? 3} label="Lovecký inštinkt" /></div></div>
        {breed.goodFor.length > 0 && <div className="breed-side-card"><h3>Pre koho je vhodný</h3><ul>{breed.goodFor.map((item) => <li key={item}>{item}</li>)}</ul></div>}
        {breed.consider.length > 0 && <div className="breed-side-card"><h3>Pre koho nemusí byť vhodný</h3><ul>{breed.consider.map((item) => <li key={item}>{item}</li>)}</ul></div>}</aside></div>
  </main>;
}
