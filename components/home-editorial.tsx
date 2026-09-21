import Link from "next/link";
import type { Article } from "@/lib/content";
import { articleHref, articlePortalSection, portalSectionLabel } from "@/lib/portal";
import { ArrowIcon, PawMark } from "@/components/icons";

function ArticleVisual({ article }: { article: Article }) {
  return article.image ? (
    <img
      src={article.image}
      alt={article.imageAlt || `Ilustračná fotografia k článku: ${article.title}`}
      loading="lazy"
      decoding="async"
    />
  ) : (
    <span className="home-article-placeholder" aria-hidden="true">
      <PawMark size={36} />
    </span>
  );
}

function ArticleMeta({ article }: { article: Article }) {
  const section = articlePortalSection(article);
  return (
    <span className="home-article-meta article-card-meta">
      <span>{portalSectionLabel(section)}</span>
      <time dateTime={article.dateIso}>{article.date}</time>
    </span>
  );
}

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
      <article
        className="home-latest-lead article-card--large"
        data-home-article-lead
        data-home-article-slug={lead.slug}
        data-home-article-date={lead.dateIso}
        data-home-article-section={articlePortalSection(lead)}
      >
        <Link href={articleHref(lead)} className="home-latest-lead-link">
          <span className="home-latest-lead-media"><ArticleVisual article={lead} /></span>
          <span className="home-latest-lead-copy">
            <ArticleMeta article={lead} />
            <h3>{lead.title}</h3>
          </span>
        </Link>
      </article>

      <div className="home-latest-list featured-stack" data-home-article-secondary={testId}>
        {secondary.map((article) => (
          <article
            className="home-latest-item"
            key={article.slug}
            data-home-article-slug={article.slug}
            data-home-article-date={article.dateIso}
            data-home-article-section={articlePortalSection(article)}
          >
            <Link href={articleHref(article)}>
              <span className="home-latest-thumb"><ArticleVisual article={article} /></span>
              <span className="home-latest-copy">
                <ArticleMeta article={article} />
                <h3>{article.title}</h3>
              </span>
            </Link>
          </article>
        ))}
      </div>
    </div>
  );
}

export function HomeLatestArticles({ articles }: { articles: Article[] }) {
  const [lead] = articles;

  return (
    <section className="section shell home-latest-section home-news-section" data-home-latest aria-labelledby="home-latest-title">
      <div className="home-section-heading">
        <div>
          <span className="eyebrow">Redakcia Psipedia</span>
          <h2 id="home-latest-title">Najnovšie články</h2>
          <p>Nové články o zdraví, výcviku, šteniatkach a každodennom živote so psom.</p>
        </div>
      </div>

      {lead ? (
        <HomeArticleFeatureLayout articles={articles} testId="latest" />
      ) : (
        <div className="home-editorial-empty" data-home-latest-empty>
          <strong>Nové články pripravujeme</strong>
          <p>Medzitým si môžeš pozrieť ďalšie témy a praktické rady na Psipedii.</p>
        </div>
      )}
      <div className="home-section-cta home-section-cta--quiet" data-home-section-cta="latest">
        <Link href="/clanky" className="text-link">Všetky články <ArrowIcon size={17} /></Link>
      </div>
    </section>
  );
}

export function HomeEditorialSection({
  eyebrow,
  title,
  description,
  articles,
  href,
  actionLabel,
  testId,
}: {
  eyebrow: string;
  title: string;
  description: string;
  articles: Article[];
  href: string;
  actionLabel: string;
  testId: string;
}) {
  return (
    <section className="section shell home-editorial-section" data-home-editorial={testId} aria-labelledby={`home-${testId}-title`}>
      <div className="home-section-heading home-section-heading--compact">
        <div>
          <span className="eyebrow">{eyebrow}</span>
          <h2 id={`home-${testId}-title`}>{title}</h2>
          <p>{description}</p>
        </div>
      </div>

      {articles.length ? (
        <HomeArticleFeatureLayout articles={articles} testId={testId} />
      ) : (
        <div className="home-editorial-empty" data-home-editorial-empty={testId}>
          <strong>Ďalší obsah pripravujeme</strong>
          <p>Ďalšie praktické články k tejto téme postupne pribúdajú.</p>
        </div>
      )}
      <div className="home-section-cta home-section-cta--quiet" data-home-section-cta={testId}>
        <Link href={href} className="text-link">{actionLabel} <ArrowIcon size={17} /></Link>
      </div>
    </section>
  );
}
