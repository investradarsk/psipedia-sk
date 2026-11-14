import type { ArticleListingCard } from "./content";
import { getNewsCategory } from "./news.ts";
import { articleHref, articlePortalSection, portalSectionLabel } from "./portal.ts";

/** Editorial section is canonical for public badges; a broad topic is only fallback. */
const editorialSectionHrefs = {
  steniatka: "/steniatka",
  starostlivost: "/starostlivost",
  aktivity: "/aktivity",
  recenzie: "/recenzie",
} as const;
import { articleCategoryHref } from "./article-category-routes.ts";

export function articleTopicLabel(
  article: Pick<ArticleListingCard, "category" | "portalSection" | "newsCategory">,
) {
  const section = articlePortalSection(article);
  if (section === "novinky") return getNewsCategory(article.newsCategory)?.shortLabel ?? "Zo sveta psov";
  if (section in editorialSectionHrefs) return portalSectionLabel(section);
  return article.category;
}

export function articleCardPresentation(article: ArticleListingCard) {
  const section = articlePortalSection(article);
  const news = section === "novinky" ? getNewsCategory(article.newsCategory) : null;
  const topic = articleTopicLabel(article);
  return {
    href: articleHref(article),
    topic,
    topicHref: news ? `/novinky/${news.slug}`
      : section in editorialSectionHrefs
        ? editorialSectionHrefs[section as keyof typeof editorialSectionHrefs]
        : articleCategoryHref(article.category),
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
