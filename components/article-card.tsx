import Link from "next/link";
import type { Article } from "@/lib/content";
import { getNewsCategory } from "@/lib/news";
import { articleHref, portalSectionLabel, articlePortalSection } from "@/lib/portal";
import { ArticleListItem } from "./article-list-item";
import { ArrowIcon, PawMark } from "./icons";
import { FavoriteButton } from "./favorite-button";

export function ArticleCard({
  article,
  large = false,
  topicHref: topicHrefOverride,
  topicLabel: topicLabelOverride,
  actionLabel,
}: {
  article: Article;
  large?: boolean;
  topicHref?: string;
  topicLabel?: string;
  actionLabel?: string;
}) {
  const href = articleHref(article);
  const section = articlePortalSection(article);
  const newsCategory = section === "novinky" ? getNewsCategory(article.newsCategory) : null;
  const topicHref = topicHrefOverride ?? (newsCategory ? `/novinky/${newsCategory.slug}` : `/tema/${categorySlug(article.category)}`);
  const topicLabel = topicLabelOverride ?? (newsCategory ? newsCategory.shortLabel : article.category);

  if (!large) return <ArticleListItem article={article} topicLabel={topicLabel} listItem={false} />;

  const resolvedActionLabel = actionLabel ?? (section === "novinky" ? "Čítať novinku" : "Čítať článok");
  return (
    <article className={`article-card article-card--${article.accent} article-card--large`}>
      <Link href={href} className="article-card-media" tabIndex={-1} aria-hidden="true">
        {article.image ? (
          <img src={article.image} alt={`Ilustračná fotografia k článku: ${article.title}`} loading="lazy" decoding="async" />
        ) : (
          <div className="article-placeholder"><PawMark size={76} /></div>
        )}
      </Link>
      <div className="article-card-body">
        <div className="article-card-meta">
          <Link href={topicHref} className="eyebrow">{portalSectionLabel(section)} · {topicLabel}</Link>
          <time dateTime={article.dateIso}>{article.date}</time>
        </div>
        <h3><Link href={href}>{article.title}</Link></h3>
        <p>{article.excerpt}</p>
        <div className="article-card-footer">
          <Link href={href} className="text-link">{resolvedActionLabel} <ArrowIcon size={18} /></Link>
          <FavoriteButton slug={article.slug} compact />
        </div>
      </div>
    </article>
  );
}

export function categorySlug(category: Article["category"]) {
  return {
    "Výcvik": "vycvik",
    "Zdravie": "zdravie",
    "Výživa": "vyziva",
    "Život so psom": "zivot-so-psom",
  }[category];
}
