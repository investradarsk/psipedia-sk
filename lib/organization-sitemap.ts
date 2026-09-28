import type { MetadataRoute } from "next";

import type { PublicOrganizationSitemapRecord } from "./help-organization-store.ts";
import { latestModified, sitemapEntry } from "./sitemap-seo.ts";

const CANONICAL_ORGANIZATION_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isCanonicalOrganizationSlug(slug: string) {
  return slug === slug.trim() && CANONICAL_ORGANIZATION_SLUG.test(slug);
}

export function buildOrganizationSitemapEntries(
  organizations: PublicOrganizationSitemapRecord[],
): MetadataRoute.Sitemap {
  const entries = new Map<string, MetadataRoute.Sitemap[number]>();

  for (const organization of organizations) {
    if (!isCanonicalOrganizationSlug(organization.slug)) continue;
    const lastModified = latestModified([organization.updatedAt, organization.publishedAt]);
    if (!lastModified) continue;

    const entry = sitemapEntry(`/organizacie/${organization.slug}`, {
      lastModified,
      changeFrequency: "monthly",
      priority: 0.6,
    });
    entries.set(entry.url, entry);
  }

  return [...entries.values()];
}
