import type { Metadata } from "next";
import type { ArticleSeo } from "@/lib/content";
import { absoluteUrl, buildPageMetadata, compactPageTitle, FALLBACK_PAGE_TITLE_MAX_LENGTH, searchResultDescription, SITE_URL } from "@/lib/seo";

export type EditableSeo = ArticleSeo;

export function cleanEditableSeo(seo: EditableSeo | undefined): EditableSeo {
  const text = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max);
  return {
    title: text(seo?.title, 180),
    focusKeyword: text(seo?.focusKeyword, 180),
    description: text(seo?.description, 320),
    canonicalUrl: normalizeCanonical(text(seo?.canonicalUrl, 700)),
    ogTitle: text(seo?.ogTitle, 180),
    ogDescription: text(seo?.ogDescription, 320),
    ogImage: normalizeImage(text(seo?.ogImage, 700)),
    noindex: Boolean(seo?.noindex),
  };
}

function normalizeImage(value: string) {
  if (!value) return "";
  if (value.startsWith("/media/") || value.startsWith("/images/") || /^https:\/\//i.test(value)) return value;
  throw new Error("Adresa Open Graph obrázka nie je platná.");
}

export function normalizeCanonical(value: string | undefined | null) {
  if (!value?.trim()) return "";
  let url: URL;
  try { url = new URL(value.trim(), SITE_URL); } catch { throw new Error("Canonical URL nie je platná."); }
  if (url.protocol !== "https:" || url.hostname !== "psipedia.sk") {
    throw new Error("Canonical URL musí používať doménu https://psipedia.sk.");
  }
  return `${SITE_URL}${url.pathname}`;
}

export function resolvedCanonical(seo: EditableSeo | undefined, path: string) {
  return normalizeCanonical(seo?.canonicalUrl) || absoluteUrl(path);
}

type ContentMetadataInput = {
  seo?: EditableSeo;
  fallbackTitle: string;
  fallbackDescription: string;
  path: string;
  image?: string | null;
  imageAlt: string;
  type?: "website" | "article";
  publishedTime?: string;
  modifiedTime?: string;
  section?: string;
};

export function buildContentMetadata(input: ContentMetadataInput): Metadata {
  const title = input.seo?.title?.trim() || input.fallbackTitle;
  const description = input.seo?.description?.trim() || input.fallbackDescription;
  const canonical = resolvedCanonical(input.seo, input.path);
  const socialTitle = input.seo?.ogTitle?.trim() || undefined;
  const socialDescription = input.seo?.ogDescription?.trim() || undefined;
  const base = buildPageMetadata({
    title,
    description,
    path: input.path,
    canonical,
    image: input.seo?.ogImage?.trim() || input.image,
    imageAlt: input.imageAlt,
    socialTitle,
    socialDescription,
    type: input.type,
    publishedTime: input.publishedTime,
    modifiedTime: input.modifiedTime,
    authors: input.type === "article" ? ["Redakcia Psipedia"] : undefined,
    section: input.section,
    tags: input.seo?.focusKeyword ? [input.seo.focusKeyword] : undefined,
    robots: input.seo?.noindex ? { index: false, follow: true } : undefined,
  });
  return {
    ...base,
    keywords: input.seo?.focusKeyword ? [input.seo.focusKeyword] : undefined,
  };
}

const directoryFallbackCopy: Record<string, { title: string; description: string }> = {
  veterinari: {
    title: "veterinárne služby",
    description: "Veterinárne služby, kontakt, adresa a praktické údaje pre majiteľov psov.",
  },
  treneri: {
    title: "tréning psov",
    description: "Výcvik a tréning psov, kontakt, lokalita a praktické údaje.",
  },
  "salony-a-sluzby": {
    title: "psí salón",
    description: "Úprava srsti a starostlivosť o psa, kontakt, lokalita a praktické údaje.",
  },
  "hotely-a-opatrovanie": {
    title: "hotel a opatrovanie",
    description: "Ubytovanie alebo opatrovanie psa, kontakt, lokalita a praktické údaje.",
  },
  "kynologicke-kluby": {
    title: "kynologický klub",
    description: "Výcvik, aktivity klubu, kontakt, lokalita a praktické údaje.",
  },
  "chovatelske-kluby": {
    title: "chovateľský klub",
    description: "Informácie o chovateľskom klube, kontakte, lokalite a jeho zameraní.",
  },
  "chovatelske-stanice": {
    title: "chovateľská stanica",
    description: "Informácie o chovateľskej stanici, kontakte, lokalite a zameraní chovu.",
  },
  vencenie: {
    title: "venčenie psov",
    description: "Venčenie psov, kontakt, lokalita a praktické údaje o službe.",
  },
  fyzioterapia: {
    title: "fyzioterapia pre psov",
    description: "Fyzioterapia a rehabilitácia psov, kontakt, lokalita a praktické údaje.",
  },
  "dalsie-sluzby": {
    title: "služby pre psov",
    description: "Služby pre psov, kontakt, lokalita a praktické údaje.",
  },
  "psie-skoly": {
    title: "psia škola",
    description: "Výcvik psov, kontakt, lokalita a praktické údaje o psej škole.",
  },
  "utulky-a-zachrana": {
    title: "pomoc psom",
    description: "Informácie o pomoci psom, kontakte, lokalite a praktických možnostiach podpory.",
  },
};

function primaryLocation(value: string) {
  return value.split(/[–—,/]/u)[0]?.trim() || value.trim();
}

function containsText(value: string, part: string) {
  return Boolean(part) && value.toLocaleLowerCase("sk-SK").includes(part.toLocaleLowerCase("sk-SK"));
}

function compactFallbackTitle(name: string, descriptor: string, city = "") {
  const cleanName = name.trim();
  const cleanDescriptor = descriptor.trim();
  const location = primaryLocation(city);
  const base = cleanDescriptor && !containsText(cleanName, cleanDescriptor)
    ? `${cleanName} – ${cleanDescriptor}`
    : cleanName;
  const withLocation = location && !containsText(cleanName, location)
    ? `${base}, ${location}`
    : base;
  return compactPageTitle(
    withLocation.length <= FALLBACK_PAGE_TITLE_MAX_LENGTH ? withLocation : base,
  );
}

export function breedSeoFallback(name: string) {
  return {
    title: compactFallbackTitle(name, "povaha, zdravie a výcvik"),
    description: searchResultDescription(
      `${name}: povaha, veľkosť, zdravie, potreba pohybu, výcvik a praktické informácie pre život s plemenom.`,
    ),
  };
}

export function directorySeoFallback(name: string, city: string, category: string) {
  const copy = directoryFallbackCopy[category] ?? {
    title: "služby pre psov",
    description: "Služby pre psov, kontakt, lokalita a praktické údaje.",
  };
  const location = city.trim();
  return {
    title: compactFallbackTitle(name, copy.title, location),
    description: searchResultDescription(
      `${name}${location ? ` – ${location}` : ""}. ${copy.description}`,
    ),
  };
}

export function eventSeoFallback(title: string, type: string, city: string) {
  const eventType = type.trim() || "podujatie";
  const location = city.trim();
  return {
    title: compactFallbackTitle(title, eventType, location),
    description: searchResultDescription(
      `${eventType}: ${title}${location ? ` v lokalite ${location}` : ""}. Termín, miesto, organizátor a praktické informácie.`,
    ),
  };
}

export function helpSeoFallback(title: string, category: string, city: string) {
  const helpCategory = category.trim() || "pomoc psom";
  const location = city.trim();
  return {
    title: compactFallbackTitle(title, helpCategory, location),
    description: searchResultDescription(
      `${title}${location ? ` – ${location}` : ""}. ${helpCategory}: kontakt a praktické informácie o možnostiach pomoci.`,
    ),
  };
}
