import { env } from "cloudflare:workers";
import type { MetadataRoute } from "next";
import type { AdoptionD1Database } from "@/lib/adoption-store";
import { categories } from "@/lib/content";
import { listPublishedCanonicalBreedSitemapIndex } from "@/lib/breed-store";
import { eventHref } from "@/lib/events";
import { directoryCategories, isDirectoryCategory } from "@/lib/directory";
import { getPublishedDirectorySitemapRecords } from "@/lib/directory-sitemap";
import { getPublishedArticleSitemapRecords, getPublishedEventSitemapRecords, getPublishedHelpSitemapRecords } from "@/lib/entity-sitemap";
import { helpCaseHref } from "@/lib/help";
import { listPublishedOrganizationsForSitemap } from "@/lib/help-organization-store";
import { listSitemapDogReports } from "@/lib/lost-found-dog-store";
import { dogReportHref } from "@/lib/lost-found-dogs";
import { adoptionDetailPath } from "@/lib/adoption-detail";
import { listIndexableAdoptionsForSitemap } from "@/lib/adoption-sitemap";
import { buildOrganizationSitemapEntries, isCanonicalOrganizationSlug } from "@/lib/organization-sitemap";
import { articleHref, portalSubpageHref } from "@/lib/portal";
import { portalSubpageHasEditorialValue } from "@/lib/reviews";
import { listManagedPortalSectionsForSitemap } from "@/lib/section-store";
import { SITE_URL } from "@/lib/seo";
import { assertSitemapEntityParity, type SitemapParityCandidate } from "@/lib/sitemap-parity";
import { assertValidSitemap, isSelfCanonical, latestModified, sitemapEntry, SITEMAP_REDIRECT_SOURCES } from "@/lib/sitemap-seo";
import { loadSitemapStages, runSitemapStageSync } from "@/lib/sitemap-runtime";

function absoluteSitemapUrl(path: string) {
  return `${SITE_URL}${path}`;
}

function parityCandidate(input: SitemapParityCandidate) {
  return input;
}

type SitemapDatasets = {
  articles: Awaited<ReturnType<typeof getPublishedArticleSitemapRecords>>;
  events: Awaited<ReturnType<typeof getPublishedEventSitemapRecords>>;
  directoryProfiles: Awaited<ReturnType<typeof getPublishedDirectorySitemapRecords>>;
  helpCases: Awaited<ReturnType<typeof getPublishedHelpSitemapRecords>>;
  managedSections: Awaited<ReturnType<typeof listManagedPortalSectionsForSitemap>>;
  breeds: Awaited<ReturnType<typeof listPublishedCanonicalBreedSitemapIndex>>;
  lostFoundReports: Awaited<ReturnType<typeof listSitemapDogReports>>;
  adoptions: Awaited<ReturnType<typeof listIndexableAdoptionsForSitemap>>;
  organizations: Awaited<ReturnType<typeof listPublishedOrganizationsForSitemap>>;
};

async function loadSitemapDatasets(): Promise<SitemapDatasets> {
  const organizationDatabase = (env as unknown as { DB?: AdoptionD1Database }).DB;
  const datasets = await loadSitemapStages([
    { key: "articles", stage: "load-articles", load: () => getPublishedArticleSitemapRecords() },
    { key: "events", stage: "load-events", load: () => getPublishedEventSitemapRecords() },
    { key: "directoryProfiles", stage: "load-directory", load: () => getPublishedDirectorySitemapRecords() },
    { key: "helpCases", stage: "load-help-cases", load: () => getPublishedHelpSitemapRecords() },
    { key: "managedSections", stage: "load-managed-sections", load: () => listManagedPortalSectionsForSitemap() },
    { key: "breeds", stage: "load-breeds", load: () => listPublishedCanonicalBreedSitemapIndex() },
    { key: "lostFoundReports", stage: "load-lost-found", load: () => listSitemapDogReports() },
    { key: "adoptions", stage: "load-adoptions", load: () => listIndexableAdoptionsForSitemap() },
    {
      key: "organizations",
      stage: "load-organizations",
      load: () => organizationDatabase
        ? listPublishedOrganizationsForSitemap(organizationDatabase)
        : Promise.resolve([]),
    },
  ]);
  return datasets as unknown as SitemapDatasets;
}

function buildSitemapEntries(datasets: SitemapDatasets): MetadataRoute.Sitemap {
  const { articles, events, directoryProfiles, helpCases, managedSections, breeds, lostFoundReports, adoptions, organizations } = datasets;
  const portalSections = managedSections.filter((section) => section.visible);
  const articleModified = (article: (typeof articles)[number]) => article.updatedAt;
  const latestArticles = latestModified(articles.map(articleModified));
  const latestEvents = latestModified(events.map((event) => event.updatedAt));
  const latestDirectory = latestModified(directoryProfiles.map((profile) => profile.updatedAt));
  const latestHelp = latestModified(helpCases.map((item) => item.updatedAt));
  const latestLostFound = latestModified(lostFoundReports.map((item) => item.updatedAt));
  const latestAdoptions = latestModified(adoptions.map((item) => item.updatedAt));
  const latestBreeds = latestModified(breeds.map((breed) => breed.updatedAt));
  const latestSections = latestModified(portalSections.map((section) => section.updatedAt));
  const homepageModified = latestModified([
    latestArticles?.toISOString(), latestEvents?.toISOString(), latestDirectory?.toISOString(),
    latestHelp?.toISOString(), latestLostFound?.toISOString(), latestAdoptions?.toISOString(), latestBreeds?.toISOString(), latestSections?.toISOString(),
  ]);

  const articleEntries = runSitemapStageSync("build-article-entries", () => articles
    .filter((article) => {
      const path = articleHref(article);
      return article.slug?.trim() && !SITEMAP_REDIRECT_SOURCES.has(path) && isSelfCanonical(article.seo, path);
    })
    .map((article) => sitemapEntry(articleHref(article), {
      lastModified: latestModified([articleModified(article)]), changeFrequency: "monthly", priority: 0.8,
      images: article.imageUrl ? [article.imageUrl.startsWith("https://") ? article.imageUrl : `${SITE_URL}${article.imageUrl}`] : undefined,
    })));
  runSitemapStageSync("parity-articles", () => assertSitemapEntityParity("articles", articles.map((article) => {
    const path = articleHref(article);
    const redirectSource = SITEMAP_REDIRECT_SOURCES.has(path);
    const selfCanonical = isSelfCanonical(article.seo, path);
    const indexable = !redirectSource && selfCanonical;
    return parityCandidate({
      slug: article.slug,
      url: absoluteSitemapUrl(path),
      indexable,
      validStatus: true,
      exclusionReason: redirectSource ? "redirect-source" : indexable ? null : "noindex-or-noncanonical",
    });
  }), articleEntries.map((entry) => entry.url)));

  const eventEntries = runSitemapStageSync("build-event-entries", () => events
    .filter((event) => {
      const path = eventHref(event);
      return event.slug?.trim() && !SITEMAP_REDIRECT_SOURCES.has(path) && isSelfCanonical(event.seo, path);
    })
    .map((event) => sitemapEntry(eventHref(event), {
      lastModified: latestModified([event.updatedAt]), changeFrequency: "weekly", priority: 0.7,
      images: event.imageUrl ? [event.imageUrl.startsWith("https://") ? event.imageUrl : `${SITE_URL}${event.imageUrl}`] : undefined,
    })));
  runSitemapStageSync("parity-events", () => assertSitemapEntityParity("events", events.map((event) => {
    const path = eventHref(event);
    const redirectSource = SITEMAP_REDIRECT_SOURCES.has(path);
    const selfCanonical = isSelfCanonical(event.seo, path);
    const indexable = !redirectSource && selfCanonical;
    return parityCandidate({
      slug: event.slug,
      url: absoluteSitemapUrl(path),
      indexable,
      validStatus: true,
      exclusionReason: redirectSource ? "redirect-source" : indexable ? null : "noindex-or-noncanonical",
    });
  }), eventEntries.map((entry) => entry.url)));

  const directoryCandidates = runSitemapStageSync("build-directory-candidates", () => directoryProfiles.map((profile) => {
    const hasKnownCategory = isDirectoryCategory(profile.category);
    const path = hasKnownCategory && profile.slug?.trim()
      ? `/adresar/${profile.category}/${profile.slug}`
      : null;
    const legacyRedirect = profile.category === "psie-skoly";
    const redirectSource = Boolean(path) && SITEMAP_REDIRECT_SOURCES.has(path!);
    const selfCanonical = Boolean(path) && isSelfCanonical(profile.seo, path!);
    const indexable = !legacyRedirect && !redirectSource && hasKnownCategory && selfCanonical;
    const exclusionReason = legacyRedirect || redirectSource
      ? "redirect-source"
      : !hasKnownCategory
        ? "unknown-directory-category"
        : !selfCanonical && profile.slug?.trim()
          ? "noindex-or-noncanonical"
          : null;
    return {
      profile,
      path,
      parity: parityCandidate({
        slug: profile.slug,
        url: path ? absoluteSitemapUrl(path) : null,
        indexable: profile.slug?.trim() ? indexable : true,
        validStatus: profile.status === "published",
        exclusionReason,
      }),
    };
  }));
  const directoryEntries = runSitemapStageSync("build-directory-entries", () => directoryCandidates.flatMap(({ profile, path, parity }) => {
    if (!path || !parity.indexable) return [];
    return [sitemapEntry(path, {
      lastModified: latestModified([profile.updatedAt]), changeFrequency: "monthly", priority: 0.6,
    })];
  }));
  runSitemapStageSync("parity-directory", () => assertSitemapEntityParity(
    "directory",
    directoryCandidates.map((candidate) => candidate.parity),
    directoryEntries.map((entry) => entry.url),
  ));

  const helpCandidates = runSitemapStageSync("build-help-candidates", () => helpCases.map((item) => {
    const path = helpCaseHref(item);
    const representedElsewhere = item.category === "adopcia" || item.category === "utulky";
    const selfCanonical = isSelfCanonical(item.seo, path);
    const indexable = !representedElsewhere && selfCanonical;
    return {
      item,
      path,
      parity: parityCandidate({
        slug: item.slug,
        url: absoluteSitemapUrl(path),
        indexable: item.slug?.trim() ? indexable : true,
        validStatus: true,
        exclusionReason: representedElsewhere
          ? "dedicated-canonical-entity"
          : selfCanonical
            ? null
            : "noindex-or-noncanonical",
      }),
    };
  }));
  const helpEntries = runSitemapStageSync("build-help-entries", () => helpCandidates.flatMap(({ item, path, parity }) => parity.indexable && item.slug?.trim()
    ? [sitemapEntry(path, {
        lastModified: latestModified([item.updatedAt]), changeFrequency: "daily", priority: 0.8,
        images: item.imageUrl ? [item.imageUrl.startsWith("https://") ? item.imageUrl : `${SITE_URL}${item.imageUrl}`] : undefined,
      })]
    : []));
  runSitemapStageSync("parity-help", () => assertSitemapEntityParity("help", helpCandidates.map((candidate) => candidate.parity), helpEntries.map((entry) => entry.url)));

  const adoptionEntries = runSitemapStageSync("build-adoption-entries", () => adoptions
    .filter((item) => item.slug?.trim())
    .map((item) => sitemapEntry(adoptionDetailPath(item.slug), {
      lastModified: latestModified([item.updatedAt]), changeFrequency: "daily", priority: 0.8,
      images: item.mainImage ? [item.mainImage.startsWith("https://") ? item.mainImage : `${SITE_URL}${item.mainImage}`] : undefined,
    })));
  runSitemapStageSync("parity-adoptions", () => assertSitemapEntityParity("adoptions", adoptions.map((item) => parityCandidate({
    slug: item.slug,
    url: item.slug?.trim() ? absoluteSitemapUrl(adoptionDetailPath(item.slug)) : null,
    indexable: true,
    validStatus: true,
  })), adoptionEntries.map((entry) => entry.url)));

  const organizationEntries = runSitemapStageSync("build-organization-entries", () => buildOrganizationSitemapEntries(organizations));
  runSitemapStageSync("parity-organizations", () => assertSitemapEntityParity("organizations", organizations.map((organization) => {
    const hasSlug = Boolean(organization.slug?.trim());
    const canonicalSlug = hasSlug && isCanonicalOrganizationSlug(organization.slug);
    return parityCandidate({
      slug: organization.slug,
      url: canonicalSlug ? absoluteSitemapUrl(`/organizacie/${organization.slug}`) : null,
      indexable: hasSlug ? canonicalSlug : true,
      validStatus: true,
      exclusionReason: hasSlug && !canonicalSlug ? "noncanonical-slug" : null,
    });
  }), organizationEntries.map((entry) => entry.url)));

  const lostFoundEntries = runSitemapStageSync("build-lost-found-entries", () => lostFoundReports
    .filter((item) => item.slug?.trim())
    .map((item) => sitemapEntry(dogReportHref(item), {
      lastModified: latestModified([item.updatedAt]), changeFrequency: "daily", priority: 0.85,
      images: item.mainImage ? [item.mainImage.startsWith("https://") ? item.mainImage : `${SITE_URL}${item.mainImage}`] : undefined,
    })));
  runSitemapStageSync("parity-lost-found", () => assertSitemapEntityParity("lost-found", lostFoundReports.map((item) => parityCandidate({
    slug: item.slug,
    url: item.slug?.trim() ? absoluteSitemapUrl(dogReportHref(item)) : null,
    indexable: true,
    validStatus: true,
  })), lostFoundEntries.map((entry) => entry.url)));

  const breedEntries = runSitemapStageSync("build-breed-entries", () => breeds
    .filter((breed) => breed.slug?.trim() && isSelfCanonical(breed.seo, `/plemena/${breed.slug}`))
    .map((breed) => sitemapEntry(`/plemena/${breed.slug}`, {
      lastModified: latestModified([breed.updatedAt]), changeFrequency: "monthly", priority: 0.8,
      images: breed.image ? [breed.image.startsWith("https://") ? breed.image : `${SITE_URL}${breed.image}`] : undefined,
    })));
  runSitemapStageSync("parity-breeds", () => assertSitemapEntityParity("breeds", breeds.map((breed) => {
    const path = `/plemena/${breed.slug}`;
    const indexable = isSelfCanonical(breed.seo, path);
    return parityCandidate({
      slug: breed.slug,
      url: absoluteSitemapUrl(path),
      indexable,
      validStatus: true,
      exclusionReason: indexable ? null : "noindex-or-noncanonical",
    });
  }), breedEntries.map((entry) => entry.url)));

  const landingEntries: MetadataRoute.Sitemap = runSitemapStageSync("build-landing-entries", () => [
    sitemapEntry("", { lastModified: homepageModified, changeFrequency: "daily", priority: 1 }),
    sitemapEntry("/clanky", { lastModified: latestArticles, changeFrequency: "weekly", priority: 0.7 }),
    sitemapEntry("/plemena", { lastModified: latestBreeds, changeFrequency: "weekly", priority: 0.7 }),
    sitemapEntry("/plemena/vyber-plemena", { lastModified: latestBreeds, changeFrequency: "weekly", priority: 0.7 }),
    sitemapEntry("/porovnat-plemena", { lastModified: latestBreeds, changeFrequency: "weekly", priority: 0.7 }),
    sitemapEntry("/pomoc-psom/adopcia", { lastModified: latestAdoptions, changeFrequency: "daily", priority: 0.85 }),
    sitemapEntry("/pomoc-psom/stratene-psy", { lastModified: latestLostFound, changeFrequency: "daily", priority: 0.85 }),
    sitemapEntry("/pomoc-psom/najdene-psy", { lastModified: latestLostFound, changeFrequency: "daily", priority: 0.85 }),
    ...["/o-nas", "/zasady-obsahu", "/sukromie", "/cookies", "/podmienky-pouzivania", "/pravne-informacie", "/opravy-a-podnety"]
      .map((path) => sitemapEntry(path, { changeFrequency: "monthly", priority: 0.5 })),
    ...portalSections.flatMap((section) => {
      const sectionArticles = articles.filter((article) => article.portalSection === section.slug);
      const relevantModified = latestModified([
        section.updatedAt,
        ...sectionArticles.map(articleModified),
        ...(section.slug === "podujatia" ? events.map((event) => event.updatedAt) : []),
        ...(section.slug === "adresar" ? directoryProfiles.map((profile) => profile.updatedAt) : []),
        ...(section.slug === "pomoc-psom" ? [...helpCases.map((item) => item.updatedAt), ...lostFoundReports.map((item) => item.updatedAt), ...adoptions.map((item) => item.updatedAt)] : []),
        ...(section.slug === "plemena" ? breeds.map((breed) => breed.updatedAt) : []),
      ]);
      const sectionPath = `/${section.slug}`;
      return [
        ...(SITEMAP_REDIRECT_SOURCES.has(sectionPath)
          ? []
          : [sitemapEntry(sectionPath, { lastModified: relevantModified, changeFrequency: section.slug === "novinky" ? "daily" : "weekly", priority: section.slug === "novinky" ? 0.9 : 0.7 })]),
        ...section.subpages.filter((subpage) => {
          if (subpage.visible === false || SITEMAP_REDIRECT_SOURCES.has(portalSubpageHref(section, subpage))) return false;
          if (section.slug !== "recenzie") return true;
          return portalSubpageHasEditorialValue(subpage) || sectionArticles.some((article) => article.portalSubpage === subpage.slug);
        }).map((subpage) => {
          const path = portalSubpageHref(section, subpage);
          const subpageModified = latestModified([
            section.updatedAt,
            ...sectionArticles.filter((article) => article.portalSubpage === subpage.slug).map(articleModified),
            ...(section.slug === "podujatia" ? events.map((event) => event.updatedAt) : []),
          ]);
          return sitemapEntry(path, { lastModified: subpageModified, changeFrequency: "weekly", priority: 0.7 });
        }),
      ];
    }),
    ...directoryCategories.map((category) => sitemapEntry(`/adresar/${category.slug}`, {
      lastModified: latestModified(directoryProfiles.filter((profile) => profile.category === category.slug).map((profile) => profile.updatedAt)),
      changeFrequency: "weekly", priority: 0.7,
    })),
    ...categories.map((category) => sitemapEntry(`/tema/${category.slug}`, {
      lastModified: latestModified(articles.filter((article) => article.category === category.label).map(articleModified)),
      changeFrequency: "weekly", priority: 0.6,
    })),
  ]);

  // Some landing routes are intentionally described by both the managed portal
  // hierarchy and a specialized landing builder. Coalesce those known landing
  // representations only; detail-entity arrays above are never de-duplicated.
  const uniqueLandingEntries = [...new Map(landingEntries.map((entry) => [entry.url, entry])).values()];
  runSitemapStageSync("static-landing-parity", () => assertSitemapEntityParity(
    "static-landings",
    uniqueLandingEntries.map((entry) => parityCandidate({
      slug: new URL(entry.url).pathname || "/",
      url: entry.url,
      indexable: true,
      validStatus: true,
    })),
    uniqueLandingEntries.map((entry) => entry.url),
  ));

  const entries: MetadataRoute.Sitemap = [
    ...uniqueLandingEntries,
    ...articleEntries,
    ...eventEntries,
    ...directoryEntries,
    ...helpEntries,
    ...adoptionEntries,
    ...organizationEntries,
    ...lostFoundEntries,
    ...breedEntries,
  ];

  return runSitemapStageSync("global-validation", () => assertValidSitemap(entries));
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const datasets = await loadSitemapDatasets();
  return buildSitemapEntries(datasets);
}
