import type { ArticleListingCard } from "./content";
import { getNewsCategory } from "./news.ts";
import { articleHref, articlePortalSection, portalSectionLabel } from "./portal.ts";
import { articleCategoryHref } from "./article-category-routes.ts";

export function articleTopicLabel(
  article: Pick<ArticleListingCard, "category" | "portalSection" | "newsCategory">,
) {
  return articlePortalSection(article) === "novinky"
    ? (getNewsCategory(article.newsCategory)?.shortLabel ?? "Zo sveta psov")
    : article.category;
}

export function articleCardPresentation(article: ArticleListingCard) {
  const section = articlePortalSection(article);
  const news = section === "novinky" ? getNewsCategory(article.newsCategory) : null;
  const topic = articleTopicLabel(article);
  return {
    href: articleHref(article),
    topic,
    topicHref: news ? `/novinky/${news.slug}` : articleCategoryHref(article.category),
    sectionTopic: section === "novinky" ? `${portalSectionLabel(section)} · ${topic}` : topic,
    actionLabel: section === "novinky" ? "Čítať novinku" : "Čítať článok",
    date: article.date?.trim() || undefined,
    dateTime: article.date?.trim() && article.dateIso?.trim() ? article.dateIso.trim() : undefined,
    image: article.image
      ? {
          src: article.image,
          alt: article.imageAlt?.trim() || `Ilustračná fotografia k článku: ${article.title}`,
          mode: article.imageDisplay,
          focusX: article.imageFocusX,
          focusY: article.imageFocusY,
          config: article.thumbnailImageDisplay,
        }
      : undefined,
  };
}
