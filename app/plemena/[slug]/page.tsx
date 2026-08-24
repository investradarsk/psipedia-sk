import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RatingDots } from "@/components/breed-card";
import { ArrowIcon } from "@/components/icons";
import { breeds } from "@/lib/content";
import { getPublishedBreed } from "@/lib/breed-store";
import { buildPageMetadata, ORGANIZATION_ID, serializeJsonLd, SITE_URL } from "@/lib/seo";

type Props = { params: Promise<{ slug: string }> };

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return breeds.map((breed) => ({ slug: breed.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const breed = await getPublishedBreed(slug);
  return breed ? buildPageMetadata({
    title: breed.name,
    description: breed.intro,
    path: `/plemena/${breed.slug}`,
    image: breed.image,
    imageAlt: `${breed.name} v prírodnom prostredí`,
    type: "article",
    publishedTime: "publishedAt" in breed ? breed.publishedAt ?? breed.createdAt : "2026-08-17",
    modifiedTime: "updatedAt" in breed ? breed.updatedAt : "2026-08-17",
    authors: ["Redakcia Psipedia"],
    section: "Plemená psov",
    tags: [breed.name, `FCI skupina ${breed.fciGroup}`, breed.origin],
  }) : {};
}

export default async function BreedDetailPage({ params }: Props) {
  const { slug } = await params;
  const breed = await getPublishedBreed(slug);
  if (!breed) notFound();
  const canonical = `${SITE_URL}/plemena/${breed.slug}`;
  const schema = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        "@id": `${canonical}#article`,
        url: canonical,
        mainEntityOfPage: { "@type": "WebPage", "@id": canonical },
        headline: `${breed.name} – povaha, potreby a profil plemena`,
        description: breed.intro,
        image: [`${SITE_URL}${breed.image}`],
        datePublished: "publishedAt" in breed ? breed.publishedAt ?? breed.createdAt : "2026-08-17",
        dateModified: "updatedAt" in breed ? breed.updatedAt : "2026-08-17",
        inLanguage: "sk-SK",
        isAccessibleForFree: true,
        articleSection: "Plemená psov",
        keywords: [breed.name, `FCI skupina ${breed.fciGroup}`, breed.origin, "plemená psov"],
        author: { "@type": "Organization", name: "Redakcia Psipedia", url: `${SITE_URL}/o-nas` },
        publisher: {
          "@type": "Organization",
          "@id": ORGANIZATION_ID,
          name: "Psipedia.sk",
          url: SITE_URL,
          logo: { "@type": "ImageObject", url: `${SITE_URL}/favicon.svg`, width: 64, height: 64 },
        },
        about: { "@type": "Thing", name: breed.name, description: breed.intro },
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${canonical}#breadcrumb`,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Domov", item: SITE_URL },
          { "@type": "ListItem", position: 2, name: "Plemená", item: `${SITE_URL}/plemena` },
          { "@type": "ListItem", position: 3, name: breed.name, item: canonical },
        ],
      },
    ],
  };

  return (
    <main id="obsah">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(schema) }} />
      <header className="breed-detail-hero shell">
        <nav className="article-breadcrumbs" aria-label="Navigácia">
          <Link href="/">Domov</Link><span>/</span><Link href="/plemena">Plemená</Link><span>/</span><span>{breed.name}</span>
        </nav>
        <div className="breed-detail-card">
          <div>
            <span className="eyebrow">FCI {breed.fciGroup} · {breed.fciSection} · {breed.origin}</span>
            <h1>{breed.name}</h1>
            <p>{breed.intro}</p>
          </div>
          <img className="breed-detail-image" src={breed.image} alt={`${breed.name} v prírodnom prostredí`} />
        </div>
      </header>

      <section className="shell">
        <div className="breed-facts">
          <div><span>Veľkosť</span><strong>{breed.size}</strong></div>
          <div><span>Hmotnosť</span><strong>{breed.weight}</strong></div>
          <div><span>Dĺžka života</span><strong>{breed.lifespan}</strong></div>
          <div><span>Srsť</span><strong>{breed.coat}</strong></div>
        </div>
      </section>

      <div className="breed-detail-body shell">
        <div className="breed-copy">
          <section>
            <span className="eyebrow">Povaha</span>
            <h2>Aký je doma a medzi ľuďmi</h2>
            <p>{breed.character}</p>
          </section>
          <section>
            <span className="eyebrow">Každodennosť</span>
            <h2>Čo potrebuje, aby prospieval</h2>
            <p>{breed.needs}</p>
          </section>
          <Link href="/plemena" className="button button--dark">Späť do atlasu <ArrowIcon /></Link>
        </div>
        <aside className="breed-side">
          <div className="breed-side-card">
            <h3>Rýchly profil</h3>
            <div className="breed-ratings">
              <RatingDots value={breed.energy} label="Energia" />
              <RatingDots value={breed.trainability} label="Cvičiteľnosť" />
              <RatingDots value={breed.family} label="Rodina" />
            </div>
          </div>
          <div className="breed-side-card">
            <h3>Môže sedieť pre</h3>
            <ul>{breed.goodFor.map((item) => <li key={item}>{item}</li>)}</ul>
          </div>
          <div className="breed-side-card">
            <h3>Pred rozhodnutím zváž</h3>
            <ul>{breed.consider.map((item) => <li key={item}>{item}</li>)}</ul>
          </div>
        </aside>
      </div>
    </main>
  );
}
