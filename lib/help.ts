import type { SlovakRegion } from "@/lib/events";

export const helpCategories = [
  {
    slug: "adopcia",
    label: "Adopcia",
    singular: "Pes na adopciu",
    icon: "🏠",
    description: "Psy, ktoré hľadajú bezpečný, zodpovedný a trvalý domov.",
  },
  {
    slug: "utulky",
    label: "Útulky a organizácie",
    singular: "Útulok alebo organizácia",
    icon: "🤝",
    description: "Overené útulky, občianske združenia a ich aktuálne potreby.",
  },
  {
    slug: "stratene-a-najdene",
    label: "Stratené a nájdené",
    singular: "Stratený alebo nájdený pes",
    icon: "🔎",
    description: "Rýchle zdieľanie presnej lokality, času a dôležitých znakov psa.",
  },
  {
    slug: "urgentne-pripady",
    label: "Urgentné prípady",
    singular: "Urgentný prípad",
    icon: "🚨",
    description: "Overená pomoc, pri ktorej rozhoduje čas a konkrétna potreba.",
  },
  {
    slug: "zbierky",
    label: "Overené zbierky",
    singular: "Overená zbierka",
    icon: "💛",
    description: "Transparentné výzvy so známym organizátorom, cieľom a odkazom.",
  },
  {
    slug: "docasna-opatera",
    label: "Dočasná opatera",
    singular: "Hľadá sa dočasná opatera",
    icon: "🛟",
    description: "Pomoc psovi na obmedzený čas, kým sa nájde trvalé riešenie.",
  },
  {
    slug: "dobrovolnictvo",
    label: "Dobrovoľníctvo",
    singular: "Dobrovoľnícka výzva",
    icon: "🐾",
    description: "Venčenie, prevoz, materiálna pomoc, fotografovanie a ďalšie možnosti.",
  },
] as const;

export type HelpCategorySlug = (typeof helpCategories)[number]["slug"];
export type HelpCaseStatus = "draft" | "published";

export type HelpCase = {
  id: number;
  slug: string;
  title: string;
  category: HelpCategorySlug;
  status: HelpCaseStatus;
  excerpt: string;
  description: string;
  organization: string;
  dogName: string;
  breed: string;
  ageNote: string;
  city: string;
  region: SlovakRegion;
  locationNote: string;
  reportedDate: string | null;
  deadlineDate: string | null;
  actionLabel: string;
  actionUrl: string | null;
  contactNote: string;
  goalAmount: number | null;
  raisedAmount: number | null;
  imageUrl: string | null;
  imageKey: string | null;
  verified: boolean;
  urgent: boolean;
  resolved: boolean;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  createdBy: string;
  updatedBy: string;
};

export function getHelpCategory(slug: string) {
  return helpCategories.find((category) => category.slug === slug) ?? null;
}

export function isHelpCategory(value: string): value is HelpCategorySlug {
  return helpCategories.some((category) => category.slug === value);
}

export function helpCategoryHref(category: Pick<(typeof helpCategories)[number], "slug">) {
  return `/pomoc-psom/${category.slug}`;
}

export function helpCaseHref(item: Pick<HelpCase, "category" | "slug">) {
  return `/pomoc-psom/${item.category}/${item.slug}`;
}

export function defaultHelpActionLabel(category: HelpCategorySlug) {
  return ({
    adopcia: "Mám záujem o adopciu",
    utulky: "Pomôcť organizácii",
    "stratene-a-najdene": "Mám informáciu",
    "urgentne-pripady": "Ako môžem pomôcť",
    zbierky: "Otvoriť overenú zbierku",
    "docasna-opatera": "Ponúknuť dočasnú opateru",
    dobrovolnictvo: "Chcem pomôcť",
  } satisfies Record<HelpCategorySlug, string>)[category];
}

export function helpProgress(item: Pick<HelpCase, "goalAmount" | "raisedAmount">) {
  if (!item.goalAmount || item.goalAmount <= 0) return null;
  return Math.min(100, Math.max(0, Math.round(((item.raisedAmount ?? 0) / item.goalAmount) * 100)));
}

export function formatHelpAmount(value: number | null) {
  if (value === null) return null;
  return new Intl.NumberFormat("sk-SK", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
}

export function formatHelpDate(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("sk-SK", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
}
