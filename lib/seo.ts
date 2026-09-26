import type { Metadata } from "next";
import { SITE_URL } from "../config/public-site.ts";

export { SITE_URL } from "../config/public-site.ts";
export const SITE_NAME = "Psipedia.sk";
export const SITE_DESCRIPTION =
  "Slovenský portál pre psí život. Overené informácie, služby, podujatia a pomoc pre každodenný život so psom.";
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
          url: `${SITE_URL}/pwa/icon-512.png`,
          width: 512,
          height: 512,
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

export function absoluteUrl(path: string) {
  if (/^https?:\/\//i.test(path)) return path;
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
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
  const url = absoluteUrl(canonical?.trim() || path);
  const customImage = image?.trim();
  const imageUrl = absoluteUrl(customImage || SOCIAL_FALLBACK_IMAGE.path);
  const resolvedImage = customImage
    ? { url: imageUrl, alt: imageAlt?.trim() || title }
    : {
        url: imageUrl,
        width: SOCIAL_FALLBACK_IMAGE.width,
        height: SOCIAL_FALLBACK_IMAGE.height,
        alt: SOCIAL_FALLBACK_IMAGE.alt,
      };
  const resolvedSocialTitle = socialTitle?.trim()
    || (title.includes(SITE_NAME) ? title : `${title} | ${SITE_NAME}`);
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
    title,
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
export function searchResultTitle(title: string, maxLength = 52) {
  const normalized = title.trim().replace(/\s+/g, " ");
  if (normalized.length <= maxLength) return normalized;

  const candidate = normalized.slice(0, maxLength + 1);
  const lastSpace = candidate.lastIndexOf(" ");
  const shortened = lastSpace >= Math.floor(maxLength * 0.7)
    ? candidate.slice(0, lastSpace)
    : normalized.slice(0, maxLength);

  return `${shortened.replace(/[\s,:;.!?–—-]+$/u, "")}…`;
}

export function articleAuthorJsonLd(author: string) {
  const name = author.trim();
  if (name.toLocaleLowerCase("sk-SK") === "redakcia psipedia") {
    return {
      "@type": "Organization",
      "@id": ORGANIZATION_ID,
      name,
      url: SITE_URL,
    };
  }
  return { "@type": "Person", name };
}

export function serializeJsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
