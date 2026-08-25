import type { MetadataRoute } from "next";
import { categories } from "@/lib/content";
import { listPublishedBreeds } from "@/lib/breed-store";
import { getPublishedArticles } from "@/lib/article-store";
import { getPublishedEvents } from "@/lib/event-store";
import { eventHref } from "@/lib/events";
import { getPublishedDirectoryProfiles } from "@/lib/directory-store";
import { directoryProfileHref } from "@/lib/directory";
import { getPublishedHelpCases } from "@/lib/help-store";
import { helpCaseHref } from "@/lib/help";
import { articleHref, portalSubpageHref } from "@/lib/portal";
import { listManagedPortalSections } from "@/lib/section-store";
import { SITE_URL } from "@/lib/seo";
import { resolvedCanonical } from "@/lib/content-seo";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [articles, events, directoryProfiles, helpCases, managedSections, breeds] = await Promise.all([getPublishedArticles(), getPublishedEvents(), getPublishedDirectoryProfiles(), getPublishedHelpCases(), listManagedPortalSections(), listPublishedBreeds()]);
  const portalSections = managedSections.filter((section) => section.visible);
  const staticPages = ["", "/clanky", "/plemena", "/porovnat-plemena", "/o-nas", "/zasady-obsahu", "/sukromie", "/cookies", "/podmienky-pouzivania", "/pravne-informacie", "/opravy-a-podnety"];
  const portalPages = portalSections.flatMap((section) => [
    `/${section.slug}`,
    ...section.subpages.map((subpage) => portalSubpageHref(section, subpage)),
  ]);
  return [
    ...[...new Set([...staticPages, ...portalPages])].map((path) => ({
      url: `${SITE_URL}${path}`,
      lastModified: new Date("2026-08-17"),
      changeFrequency: path === "" || path === "/novinky" ? "daily" as const : "weekly" as const,
      priority: path === "" ? 1 : path === "/novinky" ? 0.9 : 0.7,
    })),
    ...articles.filter((article) => !article.seo?.noindex).map((article) => ({
      url: `${SITE_URL}${articleHref(article)}`,
      lastModified: new Date(article.updatedDateIso),
      changeFrequency: "monthly" as const,
      priority: 0.8,
      images: article.image ? [article.image.startsWith("https://") ? article.image : `${SITE_URL}${article.image}`] : undefined,
    })),
    ...events.filter((event) => !event.seo?.noindex).map((event) => ({ url: resolvedCanonical(event.seo,eventHref(event)), lastModified: new Date(event.updatedAt), changeFrequency: "weekly" as const, priority: 0.7, images:event.imageUrl?[event.imageUrl.startsWith("https://")?event.imageUrl:`${SITE_URL}${event.imageUrl}`]:undefined })),
    ...directoryProfiles.filter((profile) => !profile.seo?.noindex).map((profile) => ({ url: resolvedCanonical(profile.seo,directoryProfileHref(profile)), lastModified: new Date(profile.updatedAt), changeFrequency: "monthly" as const, priority: 0.6, images:profile.imageUrl?[profile.imageUrl.startsWith("https://")?profile.imageUrl:`${SITE_URL}${profile.imageUrl}`]:undefined })),
    ...helpCases.filter((item) => !item.seo?.noindex).map((item) => ({ url: resolvedCanonical(item.seo,helpCaseHref(item)), lastModified: new Date(item.updatedAt), changeFrequency: "daily" as const, priority: 0.8, images:item.imageUrl?[item.imageUrl.startsWith("https://")?item.imageUrl:`${SITE_URL}${item.imageUrl}`]:undefined })),
    ...breeds.filter((breed) => !breed.seo?.noindex).map((breed) => ({ url: resolvedCanonical(breed.seo,`/plemena/${breed.slug}`), lastModified: new Date("updatedAt" in breed ? breed.updatedAt : "2026-08-17"), changeFrequency: "monthly" as const, priority: 0.8, images: [breed.image.startsWith("https://") ? breed.image : `${SITE_URL}${breed.image}`] })),
    ...categories.map((category) => ({ url: `${SITE_URL}/tema/${category.slug}`, lastModified: new Date("2026-08-17"), changeFrequency: "weekly" as const, priority: 0.6 })),
  ];
}
