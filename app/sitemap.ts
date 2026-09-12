import type { MetadataRoute } from "next";
import { categories } from "@/lib/content";
import { listPublishedCanonicalBreedIndex } from "@/lib/breed-store";
import { getPublishedArticleIndex } from "@/lib/article-store";
import { getPublishedEvents } from "@/lib/event-store";
import { eventHref } from "@/lib/events";
import { getPublishedDirectoryProfiles } from "@/lib/directory-store";
import { directoryCategories, directoryProfileHref } from "@/lib/directory";
import { getPublishedHelpCases } from "@/lib/help-store";
import { helpCaseHref } from "@/lib/help";
import { listIndexableAdoptions } from "@/lib/adoption-store";
import { articleHref, portalSubpageHref } from "@/lib/portal";
import { portalSubpageHasEditorialValue } from "@/lib/reviews";
import { listManagedPortalSections } from "@/lib/section-store";
import { SITE_URL } from "@/lib/seo";
import { assertValidSitemap, isSelfCanonical, latestModified, sitemapEntry, SITEMAP_REDIRECT_SOURCES } from "@/lib/sitemap-seo";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [articles, events, directoryProfiles, helpCases, managedSections, breeds, adoptions] = await Promise.all([
    getPublishedArticleIndex(), getPublishedEvents(), getPublishedDirectoryProfiles(),
    getPublishedHelpCases(), listManagedPortalSections(), listPublishedCanonicalBreedIndex(), listIndexableAdoptions(),
  ]);
  const portalSections = managedSections.filter((section) => section.visible);
  const articleModified = (article: (typeof articles)[number]) => article.updatedDateIso;
  const latestArticles = latestModified(articles.map(articleModified));
  const latestEvents = latestModified(events.map((event) => event.updatedAt));
  const latestDirectory = latestModified(directoryProfiles.map((profile) => profile.updatedAt));
  const latestHelp = latestModified(helpCases.map((item) => item.updatedAt));
  const latestAdoptions = latestModified(adoptions.map((item) => item.updatedAt));
  const latestBreeds = latestModified(breeds.map((breed) => breed.updatedAt));
  const latestSections = latestModified(portalSections.map((section) => section.updatedAt));
  const homepageModified = latestModified([
    latestArticles?.toISOString(), latestEvents?.toISOString(), latestDirectory?.toISOString(),
    latestHelp?.toISOString(), latestAdoptions?.toISOString(), latestBreeds?.toISOString(), latestSections?.toISOString(),
  ]);

  const entries: MetadataRoute.Sitemap = [
    sitemapEntry("", { lastModified: homepageModified, changeFrequency: "daily", priority: 1 }),
    sitemapEntry("/clanky", { lastModified: latestArticles, changeFrequency: "weekly", priority: 0.7 }),
    sitemapEntry("/plemena", { lastModified: latestBreeds, changeFrequency: "weekly", priority: 0.7 }),
    sitemapEntry("/plemena/vyber-plemena", { lastModified: latestBreeds, changeFrequency: "weekly", priority: 0.7 }),
    sitemapEntry("/porovnat-plemena", { lastModified: latestBreeds, changeFrequency: "weekly", priority: 0.7 }),
    ...["/o-nas", "/zasady-obsahu", "/sukromie", "/cookies", "/podmienky-pouzivania", "/pravne-informacie", "/opravy-a-podnety"]
      .map((path) => sitemapEntry(path, { changeFrequency: "monthly", priority: 0.5 })),
    ...portalSections.flatMap((section) => {
      const sectionArticles = articles.filter((article) => article.portalSection === section.slug);
      const relevantModified = latestModified([
        section.updatedAt,
        ...sectionArticles.map(articleModified),
        ...(section.slug === "podujatia" ? events.map((event) => event.updatedAt) : []),
        ...(section.slug === "adresar" ? directoryProfiles.map((profile) => profile.updatedAt) : []),
        ...(section.slug === "pomoc-psom" ? [...helpCases.map((item) => item.updatedAt), ...adoptions.map((item) => item.updatedAt)] : []),
        ...(section.slug === "plemena" ? breeds.map((breed) => breed.updatedAt) : []),
      ]);
      return [
        sitemapEntry(`/${section.slug}`, { lastModified: relevantModified, changeFrequency: section.slug === "novinky" ? "daily" : "weekly", priority: section.slug === "novinky" ? 0.9 : 0.7 }),
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
            ...(section.slug === "pomoc-psom" && subpage.slug === "adopcia" ? adoptions.map((item) => item.updatedAt) : []),
          ]);
          return sitemapEntry(path, { lastModified: subpageModified, changeFrequency: "weekly", priority: 0.7 });
        }),
      ];
    }),
    ...articles.filter((article) => isSelfCanonical(article.seo, articleHref(article))).map((article) => sitemapEntry(articleHref(article), {
      lastModified: latestModified([articleModified(article)]), changeFrequency: "monthly", priority: 0.8,
      images: article.image ? [article.image.startsWith("https://") ? article.image : `${SITE_URL}${article.image}`] : undefined,
    })),
    ...events.filter((event) => isSelfCanonical(event.seo, eventHref(event))).map((event) => sitemapEntry(eventHref(event), {
      lastModified: latestModified([event.updatedAt]), changeFrequency: "weekly", priority: 0.7,
      images: event.imageUrl ? [event.imageUrl.startsWith("https://") ? event.imageUrl : `${SITE_URL}${event.imageUrl}`] : undefined,
    })),
    ...directoryCategories.map((category) => sitemapEntry(`/adresar/${category.slug}`, {
      lastModified: latestModified(directoryProfiles.filter((profile) => profile.category === category.slug).map((profile) => profile.updatedAt)),
      changeFrequency: "weekly", priority: 0.7,
    })),
    ...directoryProfiles.filter((profile) => profile.category !== "psie-skoly" && isSelfCanonical(profile.seo, directoryProfileHref(profile))).map((profile) => sitemapEntry(directoryProfileHref(profile), {
      lastModified: latestModified([profile.updatedAt]), changeFrequency: "monthly", priority: 0.6,
      images: profile.imageUrl ? [profile.imageUrl.startsWith("https://") ? profile.imageUrl : `${SITE_URL}${profile.imageUrl}`] : undefined,
    })),
    ...helpCases.filter((item) => isSelfCanonical(item.seo, helpCaseHref(item))).map((item) => sitemapEntry(helpCaseHref(item), {
      lastModified: latestModified([item.updatedAt]), changeFrequency: "daily", priority: 0.8,
      images: item.imageUrl ? [item.imageUrl.startsWith("https://") ? item.imageUrl : `${SITE_URL}${item.imageUrl}`] : undefined,
    })),
    ...adoptions.map((item) => sitemapEntry(`/pomoc-psom/adopcia/${item.slug}`, {
      lastModified: latestModified([item.updatedAt]), changeFrequency: "weekly", priority: 0.8,
      images: item.mainImage ? [item.mainImage.startsWith("https://") ? item.mainImage : `${SITE_URL}${item.mainImage}`] : undefined,
    })),
    ...breeds.filter((breed) => isSelfCanonical(breed.seo, `/plemena/${breed.slug}`)).map((breed) => sitemapEntry(`/plemena/${breed.slug}`, {
      lastModified: latestModified([breed.updatedAt]), changeFrequency: "monthly", priority: 0.8,
      images: breed.image ? [breed.image.startsWith("https://") ? breed.image : `${SITE_URL}${breed.image}`] : undefined,
    })),
    ...categories.map((category) => sitemapEntry(`/tema/${category.slug}`, {
      lastModified: latestModified(articles.filter((article) => article.category === category.label).map(articleModified)),
      changeFrequency: "weekly", priority: 0.6,
    })),
  ];

  return assertValidSitemap([...new Map(entries.map((entry) => [entry.url, entry])).values()]);
}
