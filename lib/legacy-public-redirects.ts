export const legacyArticleSlugRedirects = {
  "co-pes-nco-pes-nesmie-jestesmie-jest-25-potravin-ktore-mu-mozu-vazne-ublizit": {
    section: "starostlivost",
    slug: "co-pes-nesmie-jest-25-potravin-ktore-mu-mozu-vazne-ublizit",
  },
  "zakladny-vycvik-psat": {
    section: "aktivity",
    slug: "zakladny-vycvik-psa",
  },
  "ako-vybrat-dobreho-chovatela-zdravie-podmienky-chovu-a-otazk": {
    section: "steniatka",
    slug: "ako-vybrat-dobreho-chovatela",
  },
  "viac-chronickych-ochoreni-moze-vyrazne-skratit-zivot-psa-uka": {
    section: "novinky",
    slug: "viac-chronickych-ochoreni-moze-skratit-zivot-psa",
  },
  "banska-bystrica-riesi-nove-pravidla-pre-psov-majitelia-sa-py": {
    section: "novinky",
    slug: "banska-bystrica-pravidla-pre-psov-bez-vodzky",
  },
} as const;

export function legacyArticleRedirectPath(slug: string) {
  const target = legacyArticleSlugRedirects[slug as keyof typeof legacyArticleSlugRedirects];
  return target ? `/${target.section}/${target.slug}` : null;
}
