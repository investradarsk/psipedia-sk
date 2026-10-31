import { articlePromoKeys, articlePromoRegistry, type ArticlePromoKey, type ArticlePromoTarget } from "@/lib/article-promo";
import type { PublicMagazineBannerPhotoTone } from "@/components/public-visual-system/public-magazine-banner";
import { ARTICLE_LISTING_PROMO_ANCHOR, HOME_PROFILE_BANNER_ANCHOR, BREED_CLUBS_BANNER_ANCHOR } from "@/lib/visual-library-anchors";

/**
 * Stage 1: an owner-facing catalogue of REAL, existing banners.
 *
 * Confirmed URL = manually audited concrete route in the current source.
 * Conditional article promotions cannot claim concrete article URLs until a
 * read-only, publication-aware runtime inventory is implemented in stage 2.
 * Never turn '/clanky/[slug]' into an invented public URL.
 */
export type VisualBannerUse = {
  url: string;
  label: string;
  placement: string;
  evidence: "verified-in-code";
  anchorId?: string;
};

export type VisualBanner = {
  id: string;
  label: string;
  group: "clanky" | "stranky";
  eyebrow: string;
  title: string;
  description: string;
  ctaLabel: string;
  ctaHref: string;
  photoTone?: PublicMagazineBannerPhotoTone;
  variants?: readonly { eyebrow: string; title: string; description: string; ctaLabel: string }[];
  uses: readonly VisualBannerUse[];
  dynamicNote?: string;
};

const editorialBanners: VisualBanner[] = articlePromoKeys.map((key: ArticlePromoKey) => {
  const target: ArticlePromoTarget = articlePromoRegistry[key];
  return {
    id: `clanky:${key}`,
    label: `Banner – ${target.label}`,
    group: "clanky",
    eyebrow: target.variants[0].kicker,
    title: target.variants[0].headline,
    description: target.variants[0].body,
    ctaLabel: target.variants[0].ctaLabel ?? target.ctaLabel,
    ctaHref: target.href,
    variants: target.variants.map((variant) => ({
      eyebrow: variant.kicker,
      title: variant.headline,
      description: variant.body,
      ctaLabel: variant.ctaLabel ?? target.ctaLabel,
    })),
    uses: key === "mapa" ? [{
      url: "https://psipedia.sk/clanky",
      label: "Novinky – všetky články",
      placement: "Bočný panel výpisu článkov · automatický banner",
      evidence: "verified-in-code",
      anchorId: ARTICLE_LISTING_PROMO_ANCHOR,
    }] : [],
    dynamicNote: "Banner sa v článkoch môže zobrazovať automaticky podľa obsahu a času, alebo ako vložený blok. Presné URL jednotlivých publikovaných článkov zatiaľ nie sú overené. Zobrazíme ich po doplnení kontroly reálneho obsahu.",
  };
});

const pageBanners: VisualBanner[] = [
  {
    id: "homepage:profil",
    label: "Banner – Pridajte svoj profil",
    group: "stranky",
    eyebrow: "Psipedia spája ľudí so psami",
    title: "Pridajte svoj profil",
    description: "Prevádzkujete službu pre psov? Nech vás majitelia ľahšie nájdu v adresári.",
    ctaLabel: "Pridať profil",
    ctaHref: "/partner/profily/novy",
    uses: [{ url: "https://psipedia.sk/", label: "Úvodná stránka", placement: "Hlavný obsah homepage · banner Pridajte svoj profil", evidence: "verified-in-code", anchorId: HOME_PROFILE_BANNER_ANCHOR }],
  },
  {
    id: "plemena:kluby",
    label: "Banner – Kluby plemien",
    group: "stranky",
    eyebrow: "Kluby plemien",
    title: "Nájdi klub svojho plemena",
    description: "Zisti, ktoré kluby zastrešujú jednotlivé plemená a kde ich môžeš kontaktovať.",
    ctaLabel: "Zobraziť kluby plemien",
    ctaHref: "/adresar/chovatelske-kluby",
    photoTone: "volunteer",
    uses: [{ url: "https://psipedia.sk/plemena", label: "Atlas plemien", placement: "Atlas plemien · pri možnostiach porovnania a klubov", evidence: "verified-in-code", anchorId: BREED_CLUBS_BANNER_ANCHOR }],
  },
];

export const visualLibraryBanners: readonly VisualBanner[] = [...editorialBanners, ...pageBanners];
