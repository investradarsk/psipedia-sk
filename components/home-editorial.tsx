import Link from "next/link";
import type { Article } from "@/lib/content";
import { articlePortalSection } from "@/lib/portal";
import { ArticleCard } from "@/components/article-card";
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
