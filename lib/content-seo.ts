import type { Metadata } from "next";
import type { ArticleSeo } from "@/lib/content";
import { absoluteUrl, buildPageMetadata, SITE_NAME, SITE_URL } from "@/lib/seo";

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
  return `${SITE_URL}${url.pathname}${url.search}`;
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
  const image = input.seo?.ogImage?.trim() || input.image || null;
  const imageUrl = image ? absoluteUrl(image) : null;
  const socialTitle = input.seo?.ogTitle?.trim() || title;
  const socialDescription = input.seo?.ogDescription?.trim() || description;
  const base = buildPageMetadata({
    title,
    description,
    path: input.path,
    image,
    imageAlt: input.imageAlt,
    type: input.type,
    publishedTime: input.publishedTime,
    modifiedTime: input.modifiedTime,
    authors: input.type === "article" ? ["Redakcia Psipedia"] : undefined,
    section: input.section,
    tags: input.seo?.focusKeyword ? [input.seo.focusKeyword] : undefined,
    robots: input.seo?.noindex ? { index: false, follow: true } : { index: true, follow: true },
  });
  return {
    ...base,
    title: { absolute: title },
    keywords: input.seo?.focusKeyword ? [input.seo.focusKeyword] : undefined,
    alternates: { canonical },
    openGraph: { ...base.openGraph, title: socialTitle, description: socialDescription, url: canonical,
      siteName: SITE_NAME, images: imageUrl ? [{ url: imageUrl, alt: input.imageAlt }] : [] },
    twitter: { card: "summary_large_image", title: socialTitle, description: socialDescription, images: imageUrl ? [imageUrl] : [] },
  };
}

export function breedSeoFallback(name: string) {
  return {
    title: `${name} – povaha, zdravie a výcvik | Psipedia`,
    description: `${name}: povaha, veľkosť, zdravie, potreba pohybu, výcvik a praktické informácie pre majiteľov.`,
  };
}

export function directorySeoFallback(name: string, city: string, category: string) {
  const primaryCity = city.split(/[–—,/]/u)[0]?.trim() || city;
  const place = primaryCity && !name.toLocaleLowerCase("sk").includes(primaryCity.toLocaleLowerCase("sk")) ? ` ${primaryCity}` : "";
  if (category === "kynologicke-kluby") return {
    title: `${name}${place} – kynologický klub | Psipedia`,
    description: `Informácie o kynologickom klube ${name}${city ? ` v lokalite ${city}` : ""}. Kontakt, lokalita, výcvik a ďalšie praktické údaje.`,
  };
  if (category === "veterinari") return {
    title: `${name}${place} – kontakt a služby | Psipedia`,
    description: `${name}${city ? ` v lokalite ${city}` : ""}: kontakt, veterinárne služby, adresa a ďalšie praktické informácie.`,
  };
  return {
    title: `${name}${place} – služby pre psov | Psipedia`,
    description: `${name}${city ? ` v lokalite ${city}` : ""}: ponuka služieb pre psov, kontakt, lokalita a ďalšie praktické informácie.`,
  };
}

export function eventSeoFallback(title: string, type: string, city: string) {
  return {
    title: `${title}${type ? ` – ${type}` : ""}${city ? `, ${city}` : ""} | Psipedia`,
    description: `${type || "Podujatie"} ${title}${city ? ` v lokalite ${city}` : ""}. Termín, miesto, organizátor a praktické informácie pre návštevníkov so psami.`,
  };
}

export function helpSeoFallback(title: string, category: string, city: string) {
  return {
    title: `${title}${category ? ` – ${category}` : ""}${city ? `, ${city}` : ""} | Psipedia`,
    description: `${title}${city ? ` v lokalite ${city}` : ""}. Overené informácie, kontakt a možnosti pomoci na Psipedia.sk.`,
  };
}
