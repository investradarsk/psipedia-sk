import type { Metadata } from "next";
import { SITE_URL } from "../config/public-site.ts";

export { SITE_URL } from "../config/public-site.ts";
export const SITE_NAME = "Psipedia.sk";
export const SITE_DESCRIPTION =
  "Slovenský portál pre psí život. Informácie, služby, podujatia a pomoc pre každodenný život so psom.";
export const SITE_ALTERNATE_NAMES = ["Psipedia", "Psipedia SK"] as const;
export const SOCIAL_PROFILES = {
  facebook: "https://www.facebook.com/p/Psipediask-61593052546349/",
  instagram: "https://www.instagram.com/psipedia.sk/",
} as const;
export const SOCIAL_PROFILE_URLS = Object.values(SOCIAL_PROFILES);
export const SOCIAL_LOCALE = "sk_SK";
export const SOCIAL_FALLBACK_IMAGE = {
  path: "/images/hero-labrador.webp",
  width: 1536,
  height: 1024,
  alt: "Čierny labrador na lúke",
} as const;

export const ORGANIZATION_ID = `${SITE_URL}/#organization`;
export const WEBSITE_ID = `${SITE_URL}/#website`;
export const SITE_LOGO_ID = `${SITE_URL}/#logo`;
export const SITE_LOGO_URL = `${SITE_URL}/pwa/icon-512.png`;

export function publisherJsonLdReference() {
  return { "@id": ORGANIZATION_ID };
}

export function websiteJsonLdReference() {
  return { "@id": WEBSITE_ID };
}

export function buildSiteIdentityJsonLd() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": ORGANIZATION_ID,
        name: SITE_NAME,
        alternateName: [...SITE_ALTERNATE_NAMES],
        url: SITE_URL,
        logo: {
          "@type": "ImageObject",
          "@id": SITE_LOGO_ID,
          url: SITE_LOGO_URL,
          contentUrl: SITE_LOGO_URL,
          width: 512,
          height: 512,
          caption: SITE_NAME,
        },
        image: `${SITE_URL}/images/hero-labrador.webp`,
        description: SITE_DESCRIPTION,
        sameAs: [...SOCIAL_PROFILE_URLS],
      },
      {
        "@type": "WebSite",
        "@id": WEBSITE_ID,
        name: SITE_NAME,
        alternateName: [...SITE_ALTERNATE_NAMES],
        url: SITE_URL,
        description: SITE_DESCRIPTION,
        publisher: { "@id": ORGANIZATION_ID },
        inLanguage: "sk-SK",
        potentialAction: {
          "@type": "SearchAction",
          target: {
            "@type": "EntryPoint",
            urlTemplate: `${SITE_URL}/hladat?q={search_term_string}`,
          },
          "query-input": "required name=search_term_string",
        },
      },
    ],
  };
}

type WebPageJsonLdInput = {
  canonical: string;
  name: string;
  description?: string | null;
  mainEntityId?: string | null;
  breadcrumbId?: string | null;
  datePublished?: string | null;
  dateModified?: string | null;
};

export function buildWebPageJsonLd({
  canonical,
  name,
  description,
  mainEntityId,
  breadcrumbId,
  datePublished,
  dateModified,
}: WebPageJsonLdInput) {
  const url = absoluteUrl(canonical);
  const normalizedDescription = description?.trim();

  return {
    "@type": "WebPage",
    "@id": url,
    url,
    name,
    ...(normalizedDescription ? { description: normalizedDescription } : {}),
    isPartOf: websiteJsonLdReference(),
    publisher: publisherJsonLdReference(),
    ...(mainEntityId ? { mainEntity: { "@id": absoluteUrl(mainEntityId) } } : {}),
    ...(breadcrumbId ? { breadcrumb: { "@id": absoluteUrl(breadcrumbId) } } : {}),
    ...(datePublished ? { datePublished } : {}),
    ...(dateModified ? { dateModified } : {}),
    inLanguage: "sk-SK",
  };
}

export type GenericMainEntityJsonLdInput = {
  canonical: string;
  name: string;
  description?: string | null;
  image?: string | null;
  idSuffix?: string;
};

export function buildGenericMainEntityJsonLd({
  canonical,
  name,
  description,
  image,
  idSuffix = "entity",
}: GenericMainEntityJsonLdInput) {
  const url = absoluteUrl(canonical);
  const normalizedDescription = description?.trim();
  const normalizedImage = image?.trim();
  return {
    "@type": "Thing",
    "@id": `${url}#${idSuffix}`,
    name,
    url,
    mainEntityOfPage: { "@id": url },
    ...(normalizedDescription ? { description: normalizedDescription } : {}),
    ...(normalizedImage ? { image: absoluteUrl(normalizedImage) } : {}),
  };
}

export const INDEXABLE_ROBOTS: Metadata["robots"] = {
  index: true,
  follow: true,
  googleBot: {
    index: true,
    follow: true,
    "max-image-preview": "large",
    "max-snippet": -1,
    "max-video-preview": -1,
  },
};

export const NOINDEX_FOLLOW_ROBOTS: Metadata["robots"] = {
  index: false,
  follow: true,
  googleBot: {
    index: false,
    follow: true,
    "max-image-preview": "large",
    "max-snippet": -1,
    "max-video-preview": -1,
  },
};

export function absoluteUrl(path: string) {
  if (/^https?:\/\//i.test(path)) return path;
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

const SITE_TITLE_SUFFIX = /\s*(?:\||–|—|-)\s*Psipedia(?:\.sk)?\s*$/iu;

export function pageTitleWithoutBrand(value: string) {
  let title = value.trim().replace(/\s+/g, " ");
  while (SITE_TITLE_SUFFIX.test(title)) title = title.replace(SITE_TITLE_SUFFIX, "").trim();
  return title || SITE_NAME;
}

type PageMetadataInput = {
  title: string;
  description: string;
  path: string;
  canonical?: string;
  image?: string | null;
  imageAlt?: string;
  socialTitle?: string;
  socialDescription?: string;
  type?: "website" | "article";
  publishedTime?: string;
  modifiedTime?: string;
  authors?: string[];
  section?: string;
  tags?: string[];
  robots?: Metadata["robots"];
};

/** Build one canonical Open Graph + Twitter contract for public pages. */
export function buildPageMetadata({
  title,
  description,
  path,
  canonical,
  image,
  imageAlt,
  socialTitle,
  socialDescription,
  type = "website",
  publishedTime,
  modifiedTime,
  authors,
  section,
  tags,
  robots = INDEXABLE_ROBOTS,
}: PageMetadataInput): Metadata {
  const pageTitle = pageTitleWithoutBrand(title);
  const url = absoluteUrl(canonical?.trim() || path);
  const customImage = image?.trim();
  const imageUrl = absoluteUrl(customImage || SOCIAL_FALLBACK_IMAGE.path);
  const resolvedImage = customImage
    ? { url: imageUrl, alt: imageAlt?.trim() || pageTitle }
    : {
        url: imageUrl,
        width: SOCIAL_FALLBACK_IMAGE.width,
        height: SOCIAL_FALLBACK_IMAGE.height,
        alt: SOCIAL_FALLBACK_IMAGE.alt,
      };
  const resolvedSocialTitle = socialTitle?.trim()
    || (pageTitle.includes(SITE_NAME) ? pageTitle : `${pageTitle} | ${SITE_NAME}`);
  const resolvedSocialDescription = socialDescription?.trim() || description;
  const sharedOpenGraph = {
    title: resolvedSocialTitle,
    description: resolvedSocialDescription,
    url,
    siteName: SITE_NAME,
    locale: SOCIAL_LOCALE,
    images: [resolvedImage],
  };
  const openGraph = type === "article"
    ? {
        ...sharedOpenGraph,
        type: "article" as const,
        publishedTime,
        modifiedTime,
        authors,
        section,
        tags,
      }
    : {
        ...sharedOpenGraph,
        type: "website" as const,
      };

  return {
    title: pageTitle,
    description,
    alternates: { canonical: url },
    openGraph,
    twitter: {
      card: "summary_large_image",
      title: resolvedSocialTitle,
      description: resolvedSocialDescription,
      images: [imageUrl],
    },
    robots,
  };
}

/**
 * Keep document titles useful in search results without changing the visible
 * article heading. The root layout adds " | Psipedia.sk" afterwards.
 */
export const SEARCH_TITLE_MAX_LENGTH = 60;
export const SEARCH_DESCRIPTION_MAX_LENGTH = 155;
export const PAGE_TITLE_BRAND_SUFFIX = ` | ${SITE_NAME}`;
export const FALLBACK_PAGE_TITLE_MAX_LENGTH = SEARCH_TITLE_MAX_LENGTH - PAGE_TITLE_BRAND_SUFFIX.length;

export function searchResultTitle(title: string, maxLength = 52) {
  const normalized = title.trim().replace(/\s+/g, " ");
  if (normalized.length <= maxLength) return normalized;

  const available = Math.max(1, maxLength - 1);
  const candidate = normalized.slice(0, available + 1);
  const lastSpace = candidate.lastIndexOf(" ");
  const shortened = lastSpace >= Math.floor(available * 0.7)
    ? candidate.slice(0, lastSpace)
    : normalized.slice(0, available);
  const clean = shortened.replace(/[\s,:;.!?–—-]+$/u, "").trim();

  return `${clean || normalized.slice(0, available)}…`;
}

/**
 * Fallback page titles are sized for the root "%s | Psipedia.sk" template.
 * Explicit custom SEO titles remain authoritative and are not shortened here.
 */
export function compactPageTitle(title: string, maxDocumentLength = SEARCH_TITLE_MAX_LENGTH) {
  const normalized = pageTitleWithoutBrand(title);
  const maxPageLength = Math.max(24, maxDocumentLength - PAGE_TITLE_BRAND_SUFFIX.length);
  return searchResultTitle(normalized, maxPageLength);
}

export function searchResultDescription(description: string, maxLength = SEARCH_DESCRIPTION_MAX_LENGTH) {
  const normalized = description.trim().replace(/\s+/g, " ");
  if (normalized.length <= maxLength) return normalized;

  const available = Math.max(1, maxLength - 1);
  const candidate = normalized.slice(0, available + 1);
  const lastSpace = candidate.lastIndexOf(" ");
  const shortened = lastSpace >= Math.floor(available * 0.7)
    ? candidate.slice(0, lastSpace)
    : normalized.slice(0, available);
  const clean = shortened.replace(/[\s,:;.!?–—-]+$/u, "").trim();

  return `${clean || normalized.slice(0, available)}…`;
}

export function articleAuthorJsonLd(author: string) {
  const name = author.trim();
  if (name.toLocaleLowerCase("sk-SK") === "redakcia psipedia") {
    return publisherJsonLdReference();
  }
  return { "@type": "Person", name };
}

export function serializeJsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
