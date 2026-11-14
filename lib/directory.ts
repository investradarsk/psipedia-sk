import type { ArticleSeo } from "@/lib/content";
import type {
  DirectoryAddressFormat,
  DirectoryServiceAddressConfirmation,
} from "@/lib/directory-service-address";
import type { DirectoryQualityMetadata } from "@/lib/directory-profile-metadata";

export const directoryCategories = [
  {
    slug: "veterinari",
    searchObject: "veterinára",
    label: "Veterinári",
    singular: "Veterinárne pracovisko",
    heroTitle: "Veterinári a veterinárne ambulancie",
    seoTitle: "Veterinári a veterinárne ambulancie",
    description: "Ambulancie, kliniky, pohotovosti a špecializovaná starostlivosť.",
    intro:
      "Nájdi veterinárov, ambulancie a kliniky pre starostlivosť o psy na Slovensku. Profily môžeš filtrovať podľa lokality a dostupných služieb.",
    resultsTitle: "Zoznam veterinárov a veterinárnych ambulancií",
    icon: "🩺",
  },
  {
    slug: "treneri",
    searchObject: "trénera alebo psiu školu",
    label: "Psí tréneri a psie školy",
    singular: "Tréner / psia škola",
    heroTitle: "Tréneri psov a psie školy",
    seoTitle: "Tréneri psov a psie školy – adresár",
    description:
      "Individuálny aj skupinový výcvik, socializácia, poslušnosť, riešenie správania a tréningové programy.",
    intro:
      "Nájdi trénerov psov a psie školy pre výcvik, socializáciu, poslušnosť či riešenie správania. Profily môžeš filtrovať podľa lokality a služieb.",
    resultsTitle: "Zoznam trénerov psov a psích škôl",
    icon: "🎯",
  },
  {
    slug: "kynologicke-kluby",
    searchObject: "kynologický klub",
    label: "Kynologické kluby",
    singular: "Kynologický klub",
    heroTitle: "Kynologické kluby",
    seoTitle: "Kynologické kluby – adresár",
    description: "Miestne cvičiská, športové kluby, skúšky a kynologické organizácie.",
    intro:
      "Nájdi kynologické kluby, cvičiská a športové organizácie pre výcvik, skúšky a aktivity so psom. Profily môžeš filtrovať podľa lokality a služieb.",
    resultsTitle: "Zoznam kynologických klubov",
    icon: "🏅",
  },
  {
    slug: "chovatelske-kluby",
    searchObject: "chovateľský klub",
    label: "Chovateľské kluby",
    singular: "Chovateľský klub",
    heroTitle: "Chovateľské kluby",
    seoTitle: "Chovateľské kluby – adresár",
    description: "Kluby zastrešujúce plemená, ich chov, podmienky a členské aktivity.",
    intro:
      "Nájdi chovateľské kluby so zameraním na plemená, chov a členské aktivity. Profily môžeš filtrovať podľa lokality a dostupných údajov.",
    resultsTitle: "Zoznam chovateľských klubov",
    icon: "🐕",
  },
  {
    slug: "chovatelske-stanice",
    searchObject: "chovateľskú stanicu",
    label: "Chovateľské stanice",
    singular: "Chovateľská stanica",
    heroTitle: "Chovateľské stanice",
    seoTitle: "Chovateľské stanice – adresár",
    description: "Chovateľské stanice s dostupnými údajmi o plemene, zameraní a chove.",
    intro:
      "Nájdi chovateľské stanice s údajmi o plemene, zameraní a chove. Profily môžeš filtrovať podľa lokality a dostupných údajov.",
    resultsTitle: "Zoznam chovateľských staníc",
    icon: "🏡",
  },
  {
    slug: "salony-a-sluzby",
    searchObject: "psí salón",
    label: "Salóny",
    singular: "Psí salón",
    heroTitle: "Psie salóny",
    seoTitle: "Psie salóny na Slovensku – adresár",
    description: "Úprava srsti, kúpanie a ďalšia pravidelná starostlivosť.",
    intro:
      "Nájdi psie salóny a grooming služby na Slovensku. Profily môžu uvádzať strihanie, kúpanie, trimovanie či vyčesávanie a môžeš ich filtrovať podľa lokality.",
    resultsTitle: "Zoznam psích salónov",
    icon: "✂️",
  },
  {
    slug: "hotely-a-opatrovanie",
    searchObject: "hotel alebo opatrovanie",
    label: "Hotely a opatrovanie",
    singular: "Hotel alebo opatrovanie",
    heroTitle: "Hotely pre psov a opatrovanie",
    seoTitle: "Hotely pre psov a opatrovanie",
    description: "Ubytovanie a starostlivosť o psa počas tvojej neprítomnosti.",
    intro:
      "Nájdi hotely pre psov a služby opatrovania počas tvojej neprítomnosti. Profily môžeš filtrovať podľa lokality a dostupných služieb.",
    resultsTitle: "Zoznam hotelov pre psov a opatrovania",
    icon: "🛏️",
  },
  {
    slug: "vencenie",
    searchObject: "venčenie",
    label: "Venčenie",
    singular: "Venčenie psov",
    heroTitle: "Venčenie psov",
    seoTitle: "Venčenie psov – adresár",
    description: "Pravidelné aj jednorazové venčenie podľa potrieb psa.",
    intro:
      "Nájdi pravidelné aj jednorazové venčenie psov podľa potrieb psa. Profily môžeš filtrovať podľa lokality a dostupných služieb.",
    resultsTitle: "Zoznam služieb venčenia psov",
    icon: "🦮",
  },
  {
    slug: "fyzioterapia",
    searchObject: "fyzioterapiu",
    label: "Fyzioterapia",
    singular: "Psia fyzioterapia",
    heroTitle: "Fyzioterapia pre psov",
    seoTitle: "Fyzioterapia pre psov – adresár",
    description: "Rehabilitácia, regenerácia a podpora zdravého pohybu.",
    intro:
      "Nájdi fyzioterapiu a rehabilitáciu pre psov na podporu pohybu, regenerácie a návratu do kondície. Profily môžeš filtrovať podľa lokality.",
    resultsTitle: "Zoznam fyzioterapie pre psov",
    icon: "🐾",
  },
  {
    slug: "dalsie-sluzby",
    searchObject: "službu pre psa",
    label: "Ďalšie služby",
    singular: "Služba pre psov",
    heroTitle: "Ďalšie služby pre psov",
    seoTitle: "Ďalšie služby pre psov – adresár",
    description: "Ďalšie praktické služby pre psov a ich ľudí.",
    intro:
      "Nájdi ďalšie praktické služby pre psov, ktoré nepatria do hlavných kategórií adresára. Profily môžeš filtrovať podľa lokality a dostupných služieb.",
    resultsTitle: "Zoznam ďalších služieb pre psov",
    icon: "➕",
  },
] as const;

const legacyDirectoryCategories = [
  {
    slug: "psie-skoly",
    searchObject: "psiu školu",
    label: "Psie školy",
    singular: "Psia škola",
    heroTitle: "Psie školy",
    seoTitle: "Psie školy – adresár",
    description: "Pôvodná kategória presmerovaná na Psí tréneri a psie školy.",
    intro: "Pôvodná kategória presmerovaná na Psí tréneri a psie školy.",
    resultsTitle: "Psie školy",
    icon: "🎓",
  },
  {
    slug: "utulky-a-zachrana",
    searchObject: "útulok alebo organizáciu",
    label: "Útulky a záchrana",
    singular: "Útulok alebo organizácia",
    heroTitle: "Útulky a záchrana",
    seoTitle: "Útulky a záchrana – adresár",
    description: "Pôvodná kategória zachovaná pre existujúce profily.",
    intro: "Pôvodná kategória zachovaná pre existujúce profily.",
    resultsTitle: "Útulky a záchrana",
    icon: "❤️",
  },
] as const;

export const allDirectoryCategories = [
  ...directoryCategories,
  ...legacyDirectoryCategories,
] as const;
export type DirectoryCategorySlug = (typeof allDirectoryCategories)[number]["slug"];
import type { ImageDisplayConfig } from "./image-display.ts";

export type DirectoryProfileStatus = "draft" | "published" | "archived";
export type DirectoryInquiryStatus = "new" | "read" | "resolved";
export type DirectoryProfileChangeRequestStatus = "new" | "approved" | "rejected";

export type DirectoryProfileEditableData = {
  name: string;
  serviceType: string;
  city: string;
  district: string;
  region: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  facebook: string;
  instagram: string;
  description: string;
  services: string[];
  priceNote: string;
  coverage: string;
  specialized: Record<string, string>;
};

export type PublicDirectoryProfile = {
  id: number;
  slug: string;
  name: string;
  category: DirectoryCategorySlug;
  /** Additional listing memberships; never change the canonical category/URL. */
  additionalCategories?: DirectoryCategorySlug[];
  excerpt: string;
  description: string;
  services: string[];
  qualifications: string[];
  sources?: string[];
  city: string;
  district: string;
  region: string;
  address: string;
  postalCode: string;
  street: string;
  houseNumber: string;
  addressFormat: DirectoryAddressFormat | "";
  serviceAddressConfirmation: DirectoryServiceAddressConfirmation;
  formattedServiceAddress?: string | null;
  priceNote: string;
  websiteUrl: string | null;
  imageUrl: string | null;
  galleryUrls?: string[];
  /** Published breed names for breeder preview cards only; no invented defaults. */
  breedSummary?: string;
  thumbnailImageDisplay?: ImageDisplayConfig | null;
  detailImageDisplay?: ImageDisplayConfig | null;
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
  qualityMetadata: DirectoryQualityMetadata;
  reviewed?: boolean;
  reviewedAt?: string;
  reviewedBy?: string;
  internalEmail: string | null;
  imageKey: string | null;
  createdAt: string;
  publishedAt: string | null;
  archivedAt: string | null;
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

export type DirectoryProfileChangeRequest = {
  id: number;
  profileId: number;
  profileName: string;
  profileSlug: string;
  profileCategory: DirectoryCategorySlug;
  requesterName: string;
  requesterEmail: string;
  requesterPhone: string;
  requesterRole: string;
  proposedData: DirectoryProfileEditableData;
  currentData: DirectoryProfileEditableData | null;
  note: string;
  authorized: boolean;
  consent: boolean;
  status: DirectoryProfileChangeRequestStatus;
  createdAt: string;
  updatedAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
};

export function getDirectoryCategory(slug: string) {
  return allDirectoryCategories.find((category) => category.slug === slug) ?? null;
}

export function directoryCategoryListingMetadata(
  category: (typeof allDirectoryCategories)[number],
  page: number | null,
) {
  const pageNumber = page && page > 1 ? page : null;
  return {
    title: pageNumber ? `${category.seoTitle}, strana ${pageNumber}` : category.seoTitle,
    description: pageNumber
      ? `${category.description} Strana ${pageNumber} zo zoznamu profilov v tejto kategórii.`
      : category.intro,
  };
}

export function isDirectoryCategory(value: string): value is DirectoryCategorySlug {
  return allDirectoryCategories.some((category) => category.slug === value);
}

export function directoryProfileHref(profile: Pick<PublicDirectoryProfile, "category" | "slug">) {
  return `/adresar/${profile.category}/${profile.slug}`;
}

export function directoryCategoryHref(
  category: Pick<(typeof directoryCategories)[number], "slug">,
) {
  return `/adresar/${category.slug}`;
}

export function directoryCategoryLabel(slug: DirectoryCategorySlug) {
  return getDirectoryCategory(slug)?.label ?? "Služby pre psov";
}

/** The same canonical-first category names on every public card and detail. */
export function directoryProfileCategoryLabels(
  profile: Pick<PublicDirectoryProfile, "category" | "additionalCategories">,
): string[] {
  const categories = [profile.category, ...(profile.additionalCategories ?? [])];
  const labels = [...new Set(categories)]
    .filter(isDirectoryCategory)
    .map((slug) => getDirectoryCategory(slug)?.singular ?? "Služba pre psov");
  return labels.length ? labels : ["Služba pre psov"];
}
