import type { MetadataRoute } from "next";
import type { ArticleSeo } from "./content.ts";
import { SITE_URL } from "./seo.ts";

export const SITEMAP_REDIRECT_SOURCES = new Set([
  "/adresar/psie-skoly",
  "/adresar/veterinari/veterinarna-poliklinka-althea",
  "/aktivity/-vycvik-a-aktivity-trening",
  "/recenzie/vybava",
  "/podujatia/kalendar",
]);

const FORBIDDEN_PREFIXES = ["/admin", "/api", "/hladat", "/oblubene", "/media"];

export function latestModified(values: Array<string | null | undefined>) {
  let latest = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    if (!value) continue;
    const timestamp = Date.parse(value);
    if (Number.isFinite(timestamp) && timestamp > latest) latest = timestamp;
  }
  return Number.isFinite(latest) ? new Date(latest) : undefined;
}

export function isSelfCanonical(seo: ArticleSeo | undefined, path: string) {
  if (seo?.noindex) return false;
  const expected = `${SITE_URL}${path}`;
  if (!seo?.canonicalUrl) return true;
  let canonical: URL;
  try { canonical = new URL(seo.canonicalUrl, SITE_URL); } catch { return false; }
  return canonical.protocol === "https:" && canonical.hostname === "psipedia.sk"
    && `${canonical.origin}${canonical.pathname}${canonical.search}` === expected;
}

export function sitemapEntry(
  path: string,
  options: Omit<MetadataRoute.Sitemap[number], "url" | "lastModified"> & { lastModified?: Date },
): MetadataRoute.Sitemap[number] {
  const { lastModified, ...rest } = options;
  return { url: `${SITE_URL}${path}`, ...rest, ...(lastModified ? { lastModified } : {}) };
}

export function assertValidSitemap(entries: MetadataRoute.Sitemap) {
  const seen = new Set<string>();
  for (const entry of entries) {
    const url = new URL(entry.url);
    if (url.origin !== SITE_URL) throw new Error(`sitemap-external-url:${entry.url}`);
    if (url.search || url.hash) throw new Error(`sitemap-parametric-url:${entry.url}`);
    if (seen.has(entry.url)) throw new Error(`sitemap-duplicate-url:${entry.url}`);
    if (FORBIDDEN_PREFIXES.some((prefix) => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`))) {
      throw new Error(`sitemap-internal-url:${entry.url}`);
    }
    if (SITEMAP_REDIRECT_SOURCES.has(url.pathname)) throw new Error(`sitemap-redirect-source:${entry.url}`);
    seen.add(entry.url);
  }
  return entries;
}
