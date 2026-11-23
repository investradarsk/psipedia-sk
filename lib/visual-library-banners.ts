import { articlePromoKeys, articlePromoRegistry, type ArticlePromoKey, type ArticlePromoTarget } from "@/lib/article-promo";
import type { PublicMagazineBannerPhotoTone } from "@/components/public-visual-system/public-magazine-banner";
import {
  ARTICLE_LISTING_PROMO_ANCHOR,
  CTA_DIRECTORY_MAP_ANCHOR,
  HOME_PROFILE_BANNER_ANCHOR,
  BREED_CLUBS_BANNER_ANCHOR,
  HELP_LOST_FOUND_BANNER_ANCHOR,
  HELP_CLOSING_BANNER_ANCHOR,
  helpOverviewBannerAnchor,
} from "@/lib/visual-library-anchors";
import { helpOverviewPromos, helpClosingPromo, lostFoundSubmitPromo, type HelpBannerPreset } from "@/lib/help-banner-presets";

/**
 * Owner-facing catalogue of REAL existing public banners.
 *
 * Confirmed URL = manually audited concrete route in the current source.
 * Conditional article promos are enumerated from published data at request time.
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
    dynamicNote: "Banner v článkoch môže byť vložený ručne alebo vybraný automaticky. Presné URL publikovaných článkov sa načítavajú pri otvorení administrácie.",
  };
});

const pageBanners: VisualBanner[] = [
  {
    id: "adresar:mapa",
    label: "Banner – Nájdi služby na mape",
    group: "stranky",
    eyebrow: "Služby v okolí",
    title: "Nájdi služby na mape",
    description: "Prezri si verejne zobraziteľné miesta podľa kategórie a zvolenej lokality.",
    ctaLabel: "Zobraziť na mape",
    ctaHref: "/mapa?category=services",
    uses: [{
      url: "https://psipedia.sk/adresar",
      label: "Adresár – služby pre psov",
      placement: "Pravý bočný panel · prechod na mapu",
      evidence: "verified-in-code",
      anchorId: CTA_DIRECTORY_MAP_ANCHOR,
    }],
    dynamicNote: "Odkaz na mapu na verejnom webe priebežne zachováva filtre kategórie a lokality. Náhľad knižnice ukazuje základné umiestnenie.",
  },
  {
    id: "adresar:poskytovatelia",
    label: "Banner – Poskytuješ služby pre psov?",
    group: "stranky",
    eyebrow: "Pre poskytovateľov",
    title: "Poskytuješ služby pre psov?",
    description: "Požiadaj o pridanie alebo úpravu údajov svojho profilu.",
    ctaLabel: "Pridať alebo upraviť profil",
    ctaHref: "/o-nas#kontakt",
    uses: [{
      url: "https://psipedia.sk/adresar",
      label: "Adresár – služby pre psov",
      placement: "Pravý bočný panel · pre poskytovateľov",
      evidence: "verified-in-code",
    }],
  },
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

function publicHelpBanner(
  id: string, label: string, promo: HelpBannerPreset, placement: string, anchorId: string,
): VisualBanner {
  return {
    id,
    label,
    group: "stranky",
    eyebrow: promo.eyebrow,
    title: promo.title,
    description: promo.text,
    ctaLabel: promo.action,
    ctaHref: promo.href,
    photoTone: promo.tone,
    uses: [{
      url: "https://psipedia.sk/pomoc-psom",
      label: "Pomoc psom – úvod",
      placement,
      evidence: "verified-in-code",
      anchorId,
    }],
  };
}

const helpBanners: VisualBanner[] = [
  publicHelpBanner(
    "help:lost-found", "Banner – Nahlásiť strateného alebo nájdeného psa",
    lostFoundSubmitPromo, "Pod navigáciou kategórií Pomoc psom", HELP_LOST_FOUND_BANNER_ANCHOR,
  ),
  ...([
    { index: 0, label: "Banner – Príprava na adopciu", placement: "Po sekcii Psy na adopciu" },
    { index: 2, label: "Banner – Pes v núdzi", placement: "Po sekcii Dočasná opatera" },
    { index: 4, label: "Banner – Pomoc dobrovoľníkov", placement: "Po sekcii Stratené a nájdené psy" },
  ] as const).flatMap(({ index, label, placement }) => {
    const promo = helpOverviewPromos[index];
    return promo ? [publicHelpBanner(
      `help:overview:${index}`, label, promo, placement, helpOverviewBannerAnchor(index),
    )] : [];
  }),
  publicHelpBanner(
    "help:closing", "Banner – Pomáhajme spolu",
    helpClosingPromo, "Na konci stránky Pomoc psom", HELP_CLOSING_BANNER_ANCHOR,
  ),
];

export const visualLibraryBanners: readonly VisualBanner[] = [
  ...editorialBanners,
  ...pageBanners,
  ...helpBanners,
];
