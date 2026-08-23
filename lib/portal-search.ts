import { breeds, type Article } from "@/lib/content";
import { getPublishedArticles } from "@/lib/article-store";
import { getPublishedDirectoryProfiles } from "@/lib/directory-store";
import { directoryProfileHref, getDirectoryCategory } from "@/lib/directory";
import { getPublishedEvents } from "@/lib/event-store";
import { eventHref, formatEventDate } from "@/lib/events";
import { getPublishedHelpCases } from "@/lib/help-store";
import { getHelpCategory, helpCaseHref } from "@/lib/help";
import { getNewsCategory } from "@/lib/news";
import { articleHref, articlePortalSection, portalSections, portalSubpageHref } from "@/lib/portal";

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

function baseSearchItems(articles: Article[]): PortalSearchItem[] {
  return [
    ...portalSections.flatMap((section) => [
      { href: `/${section.slug}`, title: section.label, type: "Sekcia", description: section.description, keywords: `${section.eyebrow} ${section.intro}` },
      ...section.subpages.map((subpage) => ({ href: portalSubpageHref(section, subpage), title: subpage.label, type: section.label, description: subpage.description, keywords: `${section.label} ${section.description}` })),
    ]),
    ...breeds.map((breed) => ({ href: `/plemena/${breed.slug}`, title: breed.name, type: "Plemeno", description: breed.intro, keywords: `${breed.group} ${breed.size} energia ${breed.energy} výcvik ${breed.trainability} rodina ${breed.family} ${breed.character} ${breed.needs} ${breed.goodFor.join(" ")} ${breed.consider.join(" ")}` })),
    ...articles.map((article) => ({
      href: articleHref(article),
      title: article.title,
      type: articlePortalSection(article) === "novinky" ? "Novinka" : "Článok",
      description: article.excerpt,
      keywords: `${article.category} ${getNewsCategory(article.newsCategory)?.label ?? ""} ${article.intro}`,
    })),
  ];
}

function uniqueItems(items: PortalSearchItem[]) {
  return [...new Map(items.map((item) => [item.href, item])).values()];
}

export async function getHeaderSearchIndex() {
  return uniqueItems(baseSearchItems(await getPublishedArticles()));
}

export async function getPortalSearchIndex() {
  const [articles, events, profiles, helpCases] = await Promise.all([
    getPublishedArticles(),
    getPublishedEvents(),
    getPublishedDirectoryProfiles(),
    getPublishedHelpCases(),
  ]);

  const items: PortalSearchItem[] = [
    ...baseSearchItems(articles),
    ...events.map((event) => ({ href: eventHref(event), title: event.title, type: "Podujatie", description: `${formatEventDate(event)} · ${event.city}`, keywords: `${event.eventType} ${event.organizer} ${event.region} ${event.venue}` })),
    ...profiles.map((profile) => ({ href: directoryProfileHref(profile), title: profile.name, type: getDirectoryCategory(profile.category)?.singular ?? "Adresár", description: `${profile.excerpt} · ${profile.city}`, keywords: `${profile.region} ${profile.services.join(" ")} ${profile.qualifications.join(" ")}` })),
    ...helpCases.map((item) => ({ href: helpCaseHref(item), title: item.title, type: getHelpCategory(item.category)?.singular ?? "Pomoc psom", description: `${item.excerpt} · ${item.city}`, keywords: `${item.organization} ${item.region} ${item.dogName} ${item.breed}` })),
  ];

  return uniqueItems(items);
}
