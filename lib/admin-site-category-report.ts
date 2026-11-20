import { env } from "cloudflare:workers";
import { articleReadHourBucket } from "@/lib/article-popularity";
import { contentAnalyticsWindowStart, type ContentAnalyticsWindow } from "@/lib/content-analytics";
import { breedProfileHref, canonicalBreedIdsForRead } from "@/lib/breed-canonical";
import { allDirectoryCategories, directoryProfileHref, type DirectoryCategorySlug } from "@/lib/directory";
import { eventTypes, eventTypePortalHref, type EventType } from "@/lib/events";
import { allHelpCategories } from "@/lib/help";
import { newsCategories } from "@/lib/news";
import { articleHref, articlePortalSectionOptions, type ArticlePortalSection } from "@/lib/portal";

export type SiteCategoryMetric = {
  key: string;
  label: string;
  href: string;
  views: number;
  landingViews: number;
};
export type SiteProfileMetric = { name: string; href: string; views: number };
export type SiteBreedMetric = { name: string; href: string; group: number; views: number };
export type SiteCategoryReport = {
  available: boolean;
  window: ContentAnalyticsWindow;
  totalProfiles: number | null;
  totalArticles: number | null;
  totalEvents: number | null;
  totalHelp: number | null;
  totalBreeds: number | null;
  articles: SiteCategoryMetric[];
  directory: SiteCategoryMetric[];
  events: SiteCategoryMetric[];
  help: SiteCategoryMetric[];
  news: SiteCategoryMetric[];
  profileTop: SiteProfileMetric[];
  breeds: SiteBreedMetric[];
  breedAtlasViews: number;
};

type PageRow = { path: string; views: number };
type ArticleRow = { slug: string; title: string; portal_section: string; news_category?: string | null };
type ProfileRow = { slug: string; name: string; category: string };
type EventRow = { slug: string; title: string; event_type: string };
type BreedRow = { slug: string; name: string; fci_group: number };
type Bindings = { DB?: D1Database; SITE_ANALYTICS_ENABLED?: string };

const numberOrZero = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
};
const byViewsThenName = <T extends { views: number; name: string }>(a: T, b: T) =>
  b.views - a.views || a.name.localeCompare(b.name, "sk");

const articleKeys = articlePortalSectionOptions.map((item) => ({
  key: item.slug, label: item.label, href: "/" + item.slug,
}));
const profileKeys = allDirectoryCategories.map((item) => ({
  key: item.slug, label: item.label, href: "/adresar/" + item.slug,
}));
const eventKeys = eventTypes.map((type) => ({
  key: type, label: type === "Iné" ? "Ostatné" : type, href: eventTypePortalHref(type as EventType) ?? "/podujatia",
}));
const helpKeys = allHelpCategories.map((item) => ({
  key: item.slug, label: item.label, href: "/pomoc-psom/" + item.slug,
}));
const newsKeys = newsCategories.map((item) => ({
  key: item.slug, label: item.label, href: "/novinky/" + item.slug,
}));

function emptyMetricRows(keys: Array<{ key: string; label: string; href: string }>) {
  return keys.map((item) => ({ ...item, views: 0, landingViews: 0 }));
}
export function emptySiteCategoryReport(window: ContentAnalyticsWindow): SiteCategoryReport {
  return {
    available: false, window,
    totalProfiles: null, totalArticles: null, totalEvents: null, totalHelp: null, totalBreeds: null,
    articles: [], directory: [], events: [], help: [], news: [], profileTop: [], breeds: [], breedAtlasViews: 0,
  };
}

/**
 * Pure mapping from already-aggregated public path counts to canonical content.
 * Category landing pages never masquerade as article/profile/event detail views.
 * A direct visit and a navigation click both count as a page opening.
 */
export function summarizeSiteCategoryPageviews(input: {
  window: ContentAnalyticsWindow;
  pages: PageRow[];
  articles: ArticleRow[];
  profiles: ProfileRow[];
  events: EventRow[];
  breeds: BreedRow[];
  helpPaths: string[];
}): SiteCategoryReport {
  const viewsByPath = new Map<string, number>();
  for (const row of input.pages) {
    if (typeof row.path !== "string" || !row.path.startsWith("/")) continue;
    viewsByPath.set(row.path, (viewsByPath.get(row.path) ?? 0) + numberOrZero(row.views));
  }
  const views = (href: string) => viewsByPath.get(href) ?? 0;
  const articles = emptyMetricRows(articleKeys);
  const directory = emptyMetricRows(profileKeys);
  const events = emptyMetricRows(eventKeys);
  const help = emptyMetricRows(helpKeys);
  const news = emptyMetricRows(newsKeys);
  const articleMetrics = new Map(articles.map((x) => [x.key, x]));
  const directoryMetrics = new Map(directory.map((x) => [x.key, x]));
  const eventMetrics = new Map(events.map((x) => [x.key, x]));
  const helpMetrics = new Map(help.map((x) => [x.key, x]));
  const newsMetrics = new Map(news.map((x) => [x.key, x]));
  const validHelpPaths = new Set(input.helpPaths);
  for (const row of articles) row.landingViews = views(row.href);
  for (const row of directory) row.landingViews = views(row.href);
  for (const row of events) row.landingViews = views(row.href);
  for (const row of help) row.landingViews = views(row.href);
  for (const row of news) row.landingViews = views(row.href);

  const visited = new Set<string>();
  const profileTop: SiteProfileMetric[] = [];
  for (const profile of input.profiles) {
    const metric = directoryMetrics.get(profile.category);
    if (!metric || !profile.slug) continue;
    const href = directoryProfileHref({ slug: profile.slug, category: profile.category as DirectoryCategorySlug });
    const value = views(href);
    if (visited.has(href)) continue;
    visited.add(href);
    metric.views += value;
    if (value > 0) profileTop.push({ name: profile.name, href, views: value });
  }

  for (const event of input.events) {
    const metric = eventMetrics.get(event.event_type);
    if (!metric || !event.slug) continue;
    const href = "/podujatia/" + event.slug;
    if (visited.has(href)) continue;
    visited.add(href);
    metric.views += views(href);
  }

  const breeds: SiteBreedMetric[] = [];
  for (const breed of input.breeds) {
    const href = breedProfileHref(breed.slug, Number(breed.fci_group));
    if (visited.has(href)) continue;
    visited.add(href);
    breeds.push({ name: breed.name, href, group: Number(breed.fci_group), views: views(href) });
  }
  breeds.sort(byViewsThenName);

  for (const article of input.articles) {
    const metric = articleMetrics.get(article.portal_section);
    if (!metric || !article.slug) continue;
    const href = articleHref({
      slug: article.slug,
      portalSection: article.portal_section as ArticlePortalSection,
    });
    if (visited.has(href) || href === metric.href) continue;
    visited.add(href);
    const value = views(href);
    metric.views += value;
    if (article.portal_section === "novinky" && article.news_category) {
      const newsMetric = newsMetrics.get(article.news_category);
      if (newsMetric) newsMetric.views += value;
    }
  }

  // Public help cases/adoptions use /pomoc-psom/{category}/{slug}.
  // Help organizations use /organizacie/{slug}.
  for (const [path, value] of viewsByPath) {
    if (visited.has(path) || !validHelpPaths.has(path)) continue;
    const parts = path.split("/").filter(Boolean);
    if (parts[0] === "pomoc-psom" && parts.length === 3) {
      const category = ["stratene-psy", "najdene-psy"].includes(parts[1])
        ? "stratene-a-najdene" : parts[1];
      const metric = helpMetrics.get(category);
      if (metric) metric.views += value;
    } else if (parts[0] === "organizacie" && parts.length === 2) {
      const shelters = helpMetrics.get("utulky");
      if (shelters) shelters.views += value;
    }
  }

  const total = (rows: SiteCategoryMetric[]) =>
    rows.reduce((sum, row) => sum + row.views, 0);
  return {
    available: true, window: input.window,
    totalProfiles: total(directory), totalArticles: total(articles),
    totalEvents: total(events), totalHelp: total(help),
    totalBreeds: breeds.reduce((sum, row) => sum + row.views, 0),
    articles, directory, events, help, news,
    profileTop: profileTop.sort(byViewsThenName).slice(0, 10),
    breeds, breedAtlasViews: views("/plemena"),
  };
}

/** Admin-only server read; always call after requireAdminPageUser. */
export async function loadSiteCategoryReport(input: {
  window: ContentAnalyticsWindow;
  now?: Date;
  database?: D1Database | null;
}): Promise<SiteCategoryReport> {
  const runtime = env as unknown as Bindings;
  if (input.database === undefined && runtime.SITE_ANALYTICS_ENABLED !== "true") {
    return emptySiteCategoryReport(input.window);
  }
  const database = input.database === undefined ? runtime.DB : input.database;
  if (!database || typeof database.prepare !== "function") return emptySiteCategoryReport(input.window);

  const now = input.now ?? new Date();
  const end = articleReadHourBucket(now);
  const start = contentAnalyticsWindowStart(input.window, now);
  const timeWhere = start ? "bucket_hour >= ? AND bucket_hour <= ?" : "bucket_hour <= ?";
  const bindings = start ? [start, end] : [end];

  try {
    const sql = [
      "SELECT path, SUM(pageviews) AS views FROM site_analytics_pages_hourly",
      "WHERE " + timeWhere,
      "AND (path LIKE '/clanky/%' OR path LIKE '/novinky/%' OR path LIKE '/steniatka/%'",
      "OR path LIKE '/starostlivost/%' OR path LIKE '/aktivity/%'",
      "OR path LIKE '/adresar/%' OR path LIKE '/podujatia/%'",
      "OR path LIKE '/pomoc-psom/%' OR path LIKE '/organizacie/%'",
      "OR path LIKE '/plemena/%' OR path LIKE '/recenzie/%'",
      "OR path IN ('/clanky','/novinky','/steniatka','/starostlivost',",
      "'/aktivity','/adresar','/podujatia','/pomoc-psom','/plemena','/recenzie'))",
      "GROUP BY path",
    ].join(" ");
    const [pageResult, articleResult, profileResult, eventResult, breedResult, helpCaseResult, adoptionResult, lostFoundResult, organizationResult] = await Promise.all([
      database.prepare(sql).bind(...bindings).all<PageRow>(),
      database.prepare(
        "SELECT slug, title, portal_section, news_category FROM managed_articles " +
        "WHERE status = 'published' OR (status = 'scheduled' AND published_at <= ?)",
      ).bind(now.toISOString()).all<ArticleRow>(),
      database.prepare(
        "SELECT slug, name, category FROM directory_profiles WHERE status = 'published'",
      ).all<ProfileRow>(),
      database.prepare(
        "SELECT slug, title, event_type FROM managed_events WHERE status = 'published'",
      ).all<EventRow>(),
      database.prepare(
        "SELECT slug, name, fci_group FROM managed_breeds WHERE id IN (" +
        canonicalBreedIdsForRead(env) + ") ORDER BY name COLLATE NOCASE",
      ).all<BreedRow>(),
      database.prepare(
        "SELECT '/pomoc-psom/' || category || '/' || slug AS path FROM help_cases " +
        "WHERE status = 'published' AND category NOT IN ('utulky', 'adopcia')",
      ).all<{ path: string }>(),
      database.prepare(
        "SELECT '/pomoc-psom/adopcia/' || slug AS path FROM adoption_dogs " +
        "WHERE status IN ('ACTIVE', 'RESERVED') AND published_at IS NOT NULL",
      ).all<{ path: string }>(),
      database.prepare(
        "SELECT CASE WHEN type = 'LOST' THEN '/pomoc-psom/stratene-psy/' || slug " +
        "ELSE '/pomoc-psom/najdene-psy/' || slug END AS path " +
        "FROM lost_found_dog_reports WHERE type IN ('LOST', 'FOUND') " +
        "AND status IN ('ACTIVE','RESOLVED','EXPIRED','ARCHIVED') " +
        "AND published_at IS NOT NULL AND duplicate_of_id IS NULL",
      ).all<{ path: string }>(),
      database.prepare(
        "SELECT '/organizacie/' || slug AS path FROM help_organizations " +
        "WHERE status = 'PUBLISHED' AND published_at IS NOT NULL AND archived_at IS NULL",
      ).all<{ path: string }>(),
    ]);
    return summarizeSiteCategoryPageviews({
      window: input.window,
      pages: pageResult.results ?? [],
      articles: articleResult.results ?? [],
      profiles: profileResult.results ?? [],
      events: eventResult.results ?? [],
      breeds: breedResult.results ?? [],
      helpPaths: [helpCaseResult, adoptionResult, lostFoundResult, organizationResult]
        .flatMap((result) => result.results ?? []).map((row) => row.path),
    });
  } catch (error) {
    console.error("Admin category pageview breakdown unavailable", {
      error: error instanceof Error ? error.message : String(error),
    });
    return emptySiteCategoryReport(input.window);
  }
}
