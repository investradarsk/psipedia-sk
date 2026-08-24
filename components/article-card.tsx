import Link from "next/link";
import type { Article } from "@/lib/content";
import { getNewsCategory } from "@/lib/news";
import { articleHref, portalSectionLabel, articlePortalSection } from "@/lib/portal";
import { ArrowIcon, PawMark } from "./icons";
import { FavoriteButton } from "./favorite-button";

export function ArticleCard({ article, large = false }: { article: Article; large?: boolean }) {
  const href = articleHref(article);
  const section = articlePortalSection(article);
  const newsCategory = section === "novinky" ? getNewsCategory(article.newsCategory) : null;
  const topicHref = newsCategory ? `/novinky/${newsCategory.slug}` : `/tema/${categorySlug(article.category)}`;
  const topicLabel = newsCategory ? newsCategory.shortLabel : article.category;
  return (
    <article className={`article-card article-card--${article.accent} ${large ? "article-card--large" : ""}`}>
      <Link href={href} className="article-card-media" tabIndex={-1} aria-hidden="true">
        {article.image ? (
          <img src={article.image} alt={`Ilustračná fotografia k článku: ${article.title}`} loading="lazy" decoding="async" />
        ) : (
          <div className="article-placeholder"><PawMark size={large ? 76 : 58} /></div>
        )}
      </Link>
      <div className="article-card-body">
        <div className="article-card-meta">
          <Link href={topicHref} className="eyebrow">{portalSectionLabel(section)} · {topicLabel}</Link>
          <span>{article.readTime} čítania</span>
        </div>
        <h3><Link href={href}>{article.title}</Link></h3>
        <p>{article.excerpt}</p>
        <div className="article-card-footer">
          <Link href={href} className="text-link">{section === "novinky" ? "Čítať novinku" : "Čítať článok"} <ArrowIcon size={18} /></Link>
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
