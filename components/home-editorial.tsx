import Link from "next/link";
import type { ReactNode } from "react";
import type { Article } from "@/lib/content";
import { articlePortalSection } from "@/lib/portal";
import { ArticleCard } from "@/components/article-card";
import { BreedPhoto } from "@/components/breed-photo";
import { ArrowIcon } from "@/components/icons";

function HomeArticleFeatureLayout({
  articles,
  testId,
}: {
  articles: Article[];
  testId: string;
}) {
  const [lead, ...secondary] = articles;
  if (!lead) return null;

  return (
    <div className="home-latest-layout home-article-feature-layout" data-home-article-layout={testId}>
      <div
        className="home-latest-lead"
        data-home-article-lead
        data-home-article-slug={lead.slug}
        data-home-article-date={lead.dateIso}
        data-home-article-section={articlePortalSection(lead)}
      >
        <ArticleCard article={lead} variant="featured" headingLevel={3} omitMissingImage />
      </div>
      <div
        className="home-latest-list"
        data-home-article-secondary={testId}
        data-home-latest-secondary={testId === "latest" ? "true" : undefined}
      >
        {secondary.map((article) => (
          <article
            className="home-latest-item"
            key={article.slug}
            data-home-article-slug={article.slug}
            data-home-article-date={article.dateIso}
            data-home-article-section={articlePortalSection(article)}
          >
            <ArticleCard article={article} variant="compact" listItem={false} />
          </article>
        ))}
      </div>
    </div>
  );
}

function HomeMagazineColumns({ children, sidebar }: { children: ReactNode; sidebar?: ReactNode }) {
  return (
    <div className="home-magazine-grid">
      <div className="home-magazine-main">{children}</div>
      {sidebar ? <aside className="home-magazine-side" aria-label="Súvisiace informácie">{sidebar}</aside> : null}
    </div>
  );
}

export function HomeMagazineSidebar({
  title,
  href,
  actionLabel,
  children,
}: {
  title: string;
  href: string;
  actionLabel: string;
  children: ReactNode;
}) {
  return (
    <section className="home-magazine-sidebar-block">
      <div className="home-magazine-sidebar-heading">
        <h3>{title}</h3>
        <Link href={href} aria-label={`Otvoriť: ${title}`}><ArrowIcon size={18} /></Link>
      </div>
      {children}
      <Link href={href} className="home-magazine-sidebar-action">
        {actionLabel} <ArrowIcon size={16} />
      </Link>
    </section>
  );
}

export function HomeMagazineBanner({
  title,
  description,
  label,
  href,
  testId,
}: {
  title: string;
  description: string;
  label: string;
  href: string;
  testId: string;
}) {
  return (
    <section className="shell home-magazine-banner" data-home-banner={testId} aria-label={title}>
      <div>
        <span className="eyebrow">Psipedia spája ľudí so psami</span>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <Link href={href} className="button button--dark">
        {label} <ArrowIcon size={18} />
      </Link>
    </section>
  );
}

export function HomeLatestArticles({ articles, sidebar }: { articles: Article[]; sidebar?: ReactNode }) {
  return (
    <section className="section shell home-latest-section home-news-section home-magazine-section" data-home-latest aria-labelledby="home-latest-title">
      <div className="home-section-heading">
        <div>
          <span className="eyebrow">Redakcia Psipedia</span>
          <h2 id="home-latest-title">Novinky zo sveta psov</h2>
          <p>Výskum, kynologické úspechy, významné udalosti a dianie doma aj vo svete.</p>
        </div>
      </div>
      <HomeMagazineColumns sidebar={sidebar}>
        {articles.length ? (
          <HomeArticleFeatureLayout articles={articles} testId="latest" />
        ) : (
          <div className="home-editorial-empty" data-home-latest-empty>
            <strong>Nové správy pripravujeme</strong>
            <p>Publikované aktuality sa tu objavia po vydaní. Návody zo Šteniatok, Zdravia ani Výcviku za novinky nevydávame.</p>
          </div>
        )}
      </HomeMagazineColumns>
      <div className="home-section-cta home-section-cta--quiet" data-home-section-cta="latest">
        <Link href="/clanky" className="text-link">Archív noviniek <ArrowIcon size={17} /></Link>
      </div>
    </section>
  );
}

export type HomeBreedCard = {
  slug: string;
  name: string;
  image?: string | null;
  intro?: string | null;
};

export function HomeBreedMagazine({ breeds }: { breeds: HomeBreedCard[] }) {
  const [lead, ...others] = breeds.filter((breed) => Boolean(breed.image?.trim())).slice(0, 5);
  if (!lead) {
    return (
      <div className="home-editorial-empty" data-home-breeds-empty>
        <strong>Objav atlas plemien</strong>
        <p>Fotografie a profily publikovaných plemien nájdeš v atlase.</p>
      </div>
    );
  }
  return (
    <div className="home-latest-layout home-breed-magazine" data-home-breed-layout>
      <article className="home-breed-feature">
        <Link href={`/plemena/${lead.slug}`}>
          <span className="home-breed-feature-media">
            <BreedPhoto src={lead.image ?? undefined} alt={`${lead.name} – atlas plemien`} sizes="(max-width: 900px) 100vw, 65vw" loading="lazy" decoding="async" />
          </span>
          <span className="home-breed-feature-copy">
            <small>Atlas plemien</small>
            <strong>{lead.name}</strong>
            {lead.intro?.trim() ? <span>{lead.intro}</span> : null}
          </span>
        </Link>
      </article>
      {others.length ? (
        <div className="home-latest-list home-breed-list">
          {others.map((breed) => (
            <article className="home-breed-list-item" key={breed.slug}>
              <Link href={`/plemena/${breed.slug}`}>
                <span className="home-breed-list-media">
                  <BreedPhoto src={breed.image ?? undefined} alt={breed.name} sizes="112px" loading="lazy" decoding="async" />
                </span>
                <span>
                  <small>Profil plemena</small>
                  <strong>{breed.name}</strong>
                  {breed.intro?.trim() ? <span className="home-breed-list-intro">{breed.intro}</span> : null}
                </span>
              </Link>
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function HomeEditorialSection({
  eyebrow,
  title,
  description,
  articles,
  feature,
  sidebar,
  href,
  actionLabel,
  testId,
}: {
  eyebrow: string;
  title: string;
  description: string;
  articles: Article[];
  feature?: ReactNode;
  sidebar?: ReactNode;
  href: string;
  actionLabel: string;
  testId: string;
}) {
  return (
    <section className="section shell home-editorial-section home-magazine-section" data-home-editorial={testId} aria-labelledby={`home-${testId}-title`}>
      <div className="home-section-heading home-section-heading--compact">
        <div>
          <span className="eyebrow">{eyebrow}</span>
          <h2 id={`home-${testId}-title`}>{title}</h2>
          <p>{description}</p>
        </div>
      </div>
      <HomeMagazineColumns sidebar={sidebar}>
        {feature ?? (articles.length ? (
          <HomeArticleFeatureLayout articles={articles} testId={testId} />
        ) : (
          <div className="home-editorial-empty" data-home-editorial-empty={testId}>
            <strong>Ďalší obsah pripravujeme</strong>
            <p>Články k tejto téme postupne pribúdajú.</p>
          </div>
        ))}
      </HomeMagazineColumns>
      <div className="home-section-cta home-section-cta--quiet" data-home-section-cta={testId}>
        <Link href={href} className="text-link">{actionLabel} <ArrowIcon size={17} /></Link>
      </div>
    </section>
  );
}
