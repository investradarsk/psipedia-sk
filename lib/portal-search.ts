import type { Article } from "@/lib/content";
import { getPublishedArticles } from "@/lib/article-store";
import { listPublishedBreedIndex, type ManagedBreedIndexItem } from "@/lib/breed-store";
import { getPublishedDirectoryProfiles } from "@/lib/directory-store";
import { directoryProfileHref, getDirectoryCategory } from "@/lib/directory";
import { getPublishedEvents } from "@/lib/event-store";
import { eventHref, formatEventDate } from "@/lib/events";
import { getPublishedHelpCases } from "@/lib/help-store";
import { getHelpCategory, helpCaseHref } from "@/lib/help";
import { getNewsCategory } from "@/lib/news";
import { articleHref, articlePortalSection, portalSubpageHref, type PortalSection } from "@/lib/portal";
import { listManagedPortalSections } from "@/lib/section-store";
import { articleBlockPlainText, legacyArticleBlocks } from "@/lib/article-blocks";

export type PortalSearchItem = {
  href: string;
  title: string;
  type: string;
  description: string;
  keywords: string;
};

export function normalizePortalSearch(value: string) {
  return value.toLocaleLowerCase("sk").normalize("NFD").replace(/\p{Diacritic}/gu, "").trim();
}

export function filterPortalSearch(items: PortalSearchItem[], query: string, limit = 100) {
  const needle = normalizePortalSearch(query);
  if (needle.length < 2) return [];
  return items
    .map((item) => {
      const title = normalizePortalSearch(item.title);
      const haystack = normalizePortalSearch(`${item.title} ${item.description} ${item.keywords} ${item.type}`);
      const score = title === needle ? 0 : title.startsWith(needle) ? 1 : title.includes(needle) ? 2 : haystack.includes(needle) ? 3 : 99;
      return { item, score };
    })
    .filter((match) => match.score < 99)
    .sort((a, b) => a.score - b.score || a.item.title.localeCompare(b.item.title, "sk"))
    .slice(0, limit)
    .map((match) => match.item);
}

function baseSearchItems(articles: Article[], sections: PortalSection[], breeds: ManagedBreedIndexItem[]): PortalSearchItem[] {
  return [
    ...sections.flatMap((section) => [
      { href: `/${section.slug}`, title: section.label, type: "Sekcia", description: section.description, keywords: `${section.eyebrow} ${section.intro}` },
      ...section.subpages.map((subpage) => ({ href: portalSubpageHref(section, subpage), title: subpage.label, type: section.label, description: subpage.description, keywords: `${section.label} ${section.description}` })),
    ]),
    ...breeds.map((breed) => ({ href: `/plemena/${breed.slug}`, title: breed.name, type: "Plemeno", description: breed.intro || `${breed.officialFciName} · FCI skupina ${breed.fciGroup}`, keywords: `${breed.officialFciName} ${breed.group} ${breed.fciSection} ${breed.origin} ${breed.searchText}` })),
    ...articles.map((article) => ({
      href: articleHref(article),
      title: article.title,
      type: articlePortalSection(article) === "novinky" ? "Novinka" : "Článok",
      description: article.excerpt,
      keywords: `${article.category} ${getNewsCategory(article.newsCategory)?.label ?? ""} ${article.intro} ${article.takeaway} ${article.seo?.focusKeyword ?? ""} ${articleBlockPlainText(article.blocks?.length ? article.blocks : legacyArticleBlocks(article.sections, article.sources))}`,
    })),
  ];
}

function uniqueItems(items: PortalSearchItem[]) {
  return [...new Map(items.map((item) => [item.href, item])).values()];
}

export async function getHeaderSearchIndex() {
  return getPortalSearchIndex();
}

export async function getPortalSearchIndex() {
  const [articles, events, profiles, helpCases, sections, breeds] = await Promise.all([
    getPublishedArticles(),
    getPublishedEvents(),
    getPublishedDirectoryProfiles(),
    getPublishedHelpCases(),
    listManagedPortalSections(),
    listPublishedBreedIndex(),
  ]);

  const items: PortalSearchItem[] = [
    ...baseSearchItems(articles, sections.filter((section) => section.visible), breeds),
    ...events.map((event) => ({ href: eventHref(event), title: event.title, type: "Podujatie", description: `${formatEventDate(event)} · ${event.city}`, keywords: `${event.eventType} ${event.organizer} ${event.region} ${event.venue}` })),
    ...profiles.map((profile) => {
      const type = profile.category === "veterinari" ? "Veterinár" : profile.category === "treneri" ? "Psí tréner" : profile.category === "utulky-a-zachrana" ? "Útulok" : "Služba pre psov";
      return { href: directoryProfileHref(profile), title: profile.name, type, description: `${profile.excerpt} · ${profile.city}`, keywords: `${getDirectoryCategory(profile.category)?.label ?? ""} ${profile.region} ${profile.address} ${profile.description} ${profile.services.join(" ")} ${profile.qualifications.join(" ")}` };
    }),
    ...helpCases.map((item) => ({ href: helpCaseHref(item), title: item.title, type: item.category === "utulky" ? "Útulok" : "Pomoc psom", description: `${item.excerpt} · ${item.city}`, keywords: `${getHelpCategory(item.category)?.label ?? ""} ${item.organization} ${item.region} ${item.dogName} ${item.breed} ${item.description}` })),
  ];

  return uniqueItems(items);
}
