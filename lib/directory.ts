import type { ArticleSeo } from "@/lib/content";

export const directoryCategories = [
  { slug: "veterinari", label: "Veterinári", singular: "Veterinárne pracovisko", icon: "🩺", description: "Ambulancie, kliniky, pohotovosti a špecializovaná starostlivosť." },
  {
    slug: "treneri",
    label: "Psí tréneri",
    singular: "Tréner",
    icon: "🎯",
    description: "Individuálny výcvik, riešenie správania, šteniatka aj špecializované tréningy.",
  },
  {
    slug: "psie-skoly",
    label: "Psie školy",
    singular: "Psia škola",
    icon: "🎓",
    description: "Skupinové kurzy, socializácia, poslušnosť a pravidelné tréningové programy.",
  },
  {
    slug: "kynologicke-kluby",
    label: "Kynologické kluby",
    singular: "Kynologický klub",
    icon: "🏅",
    description: "Miestne cvičiská, športové kluby, skúšky a kynologické organizácie.",
  },
  {
    slug: "chovatelske-kluby",
    label: "Chovateľské kluby",
    singular: "Chovateľský klub",
    icon: "🐕",
    description: "Kluby zastrešujúce plemená, ich chov, podmienky a členské aktivity.",
  },
  {
    slug: "chovatelske-stanice",
    label: "Chovateľské stanice",
    singular: "Chovateľská stanica",
    icon: "🏡",
    description: "Preverené chovateľské stanice s jasnými informáciami o plemene a vrhoch.",
  },
  {
    slug: "salony-a-sluzby",
    label: "Salóny",
    singular: "Psí salón",
    icon: "✂️",
    description: "Úprava srsti, kúpanie a ďalšia pravidelná starostlivosť.",
  },
  { slug: "hotely-a-opatrovanie", label: "Hotely a opatrovanie", singular: "Hotel alebo opatrovanie", icon: "🛏️", description: "Ubytovanie a starostlivosť o psa počas tvojej neprítomnosti." },
  { slug: "vencenie", label: "Venčenie", singular: "Venčenie psov", icon: "🦮", description: "Pravidelné aj jednorazové venčenie podľa potrieb psa." },
  { slug: "fyzioterapia", label: "Fyzioterapia", singular: "Psia fyzioterapia", icon: "🐾", description: "Rehabilitácia, regenerácia a podpora zdravého pohybu." },
  { slug: "dalsie-sluzby", label: "Ďalšie služby", singular: "Služba pre psov", icon: "➕", description: "Ďalšie praktické služby pre psov a ich ľudí." },
] as const;

const legacyDirectoryCategories = [
  { slug: "utulky-a-zachrana", label: "Útulky a záchrana", singular: "Útulok alebo organizácia", icon: "❤️", description: "Pôvodná kategória zachovaná pre existujúce profily." },
] as const;

export const allDirectoryCategories = [...directoryCategories, ...legacyDirectoryCategories] as const;
export type DirectoryCategorySlug = (typeof allDirectoryCategories)[number]["slug"];
export type DirectoryProfileStatus = "draft" | "published";
export type DirectoryInquiryStatus = "new" | "read" | "resolved";

export type PublicDirectoryProfile = {
  id: number;
  slug: string;
  name: string;
  category: DirectoryCategorySlug;
  excerpt: string;
  description: string;
  services: string[];
  qualifications: string[];
  city: string;
  district: string;
  region: string;
  address: string;
  online: boolean;
  priceNote: string;
  websiteUrl: string | null;
  imageUrl: string | null;
  verified: boolean;
  featured: boolean;
  updatedAt: string;
  importData: Record<string, string | number | null> | null;
  seo?: ArticleSeo;
};

export const kynologicalClubCategory = "kynologicke-kluby" as const;
export const kynologicalClubPageSize = 24;

export const directoryClubSortOptions = [
  { value: "name-asc", label: "Názov A–Z" },
  { value: "name-desc", label: "Názov Z–A" },
  { value: "city-asc", label: "Mesto A–Z" },
] as const;

export type DirectoryClubSort = (typeof directoryClubSortOptions)[number]["value"];

export type DirectoryClubCardProfile = {
  id: number;
  slug: string;
  name: string;
  category: typeof kynologicalClubCategory;
  city: string;
  district: string;
  region: string;
  websiteUrl: string | null;
  contact: string | null;
};

export type DirectoryClubSearchParams = {
  q: string;
  region: string;
  district: string;
  city: string;
  sort: DirectoryClubSort;
  page: number;
};

export type DirectoryClubSearchResult = {
  profiles: DirectoryClubCardProfile[];
  filters: {
    regions: string[];
    districts: string[];
    cities: string[];
  };
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

export type ManagedDirectoryProfile = PublicDirectoryProfile & {
  status: DirectoryProfileStatus;
  internalEmail: string | null;
  imageKey: string | null;
  createdAt: string;
  publishedAt: string | null;
  createdBy: string;
  updatedBy: string;
};

export type DirectoryInquiry = {
  id: number;
  profileId: number | null;
  profileName: string;
  profileSlug: string;
  profileCategory: DirectoryCategorySlug;
  recipientEmail: string | null;
  senderName: string;
  senderEmail: string;
  senderPhone: string;
  dogInfo: string;
  message: string;
  status: DirectoryInquiryStatus;
  consent: boolean;
  createdAt: string;
  updatedAt: string;
};

export function getDirectoryCategory(slug: string) {
  return allDirectoryCategories.find((category) => category.slug === slug) ?? null;
}

export function isDirectoryCategory(value: string): value is DirectoryCategorySlug {
  return allDirectoryCategories.some((category) => category.slug === value);
}

export function directoryProfileHref(profile: Pick<PublicDirectoryProfile, "category" | "slug">) {
  return `/adresar/${profile.category}/${profile.slug}`;
}

export function directoryCategoryHref(category: Pick<(typeof directoryCategories)[number], "slug">) {
  return `/adresar/${category.slug}`;
}

export function directoryCategoryLabel(slug: DirectoryCategorySlug) {
  return getDirectoryCategory(slug)?.label ?? "Služby pre psov";
}
