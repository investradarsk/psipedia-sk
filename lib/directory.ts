import type { SlovakRegion } from "@/lib/events";

export const directoryCategories = [
  {
    slug: "treneri",
    label: "Tréneri",
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
    slug: "utulky-a-zachrana",
    label: "Útulky a záchrana",
    singular: "Útulok alebo organizácia",
    icon: "❤️",
    description: "Útulky, občianske združenia, záchranné organizácie a dočasné opatery.",
  },
  {
    slug: "chovatelske-stanice",
    label: "Chovateľské stanice",
    singular: "Chovateľská stanica",
    icon: "🏡",
    description: "Preverené chovateľské stanice s jasnými informáciami o plemene a vrhoch.",
  },
  {
    slug: "veterinari",
    label: "Veterinári",
    singular: "Veterinárne pracovisko",
    icon: "🩺",
    description: "Ambulancie, kliniky, pohotovosti a pracoviská so špecializovanou starostlivosťou.",
  },
  {
    slug: "salony-a-sluzby",
    label: "Salóny a služby",
    singular: "Psia služba",
    icon: "✂️",
    description: "Úprava srsti, hotely, opatrovanie, venčenie, fyzioterapia a ďalšie služby.",
  },
] as const;

export type DirectoryCategorySlug = (typeof directoryCategories)[number]["slug"];
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
  region: SlovakRegion;
  address: string;
  online: boolean;
  priceNote: string;
  websiteUrl: string | null;
  imageUrl: string | null;
  verified: boolean;
  featured: boolean;
  updatedAt: string;
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
  return directoryCategories.find((category) => category.slug === slug) ?? null;
}

export function isDirectoryCategory(value: string): value is DirectoryCategorySlug {
  return directoryCategories.some((category) => category.slug === value);
}

export function directoryProfileHref(profile: Pick<PublicDirectoryProfile, "category" | "slug">) {
  return `/adresar/${profile.category}/${profile.slug}`;
}

export function directoryCategoryHref(category: Pick<(typeof directoryCategories)[number], "slug">) {
  return `/adresar/${category.slug}`;
}

export function directoryCategoryLabel(slug: DirectoryCategorySlug) {
  return getDirectoryCategory(slug)?.label ?? "Adresár";
}
