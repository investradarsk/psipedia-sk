import type { LostFoundStatus } from "@/lib/lost-found-lifecycle.js";

export const dogReportTypes = ["LOST", "FOUND"] as const;
export const dogSexes = ["MALE", "FEMALE", "UNKNOWN"] as const;
export const dogSizes = ["SMALL", "MEDIUM", "LARGE", "UNKNOWN"] as const;
export const chipStates = ["YES", "NO", "UNKNOWN"] as const;
export const publicLocationPrecisions = ["MUNICIPALITY", "NEIGHBORHOOD", "APPROXIMATE"] as const;

export type DogReportType = (typeof dogReportTypes)[number];
export type DogSex = (typeof dogSexes)[number];
export type DogSize = (typeof dogSizes)[number];
export type ChipState = (typeof chipStates)[number];
export type PublicLocationPrecision = (typeof publicLocationPrecisions)[number];
export type { LostFoundStatus };

export type BreedOption = { id: number; name: string; slug: string };

export type PublicDogReport = {
  id: number;
  type: DogReportType;
  status: LostFoundStatus;
  slug: string;
  dogName: string | null;
  sex: DogSex;
  breedId: number | null;
  breed: string;
  breedUnknown: boolean;
  breedSlug: string | null;
  color: string;
  approximateAge: string;
  size: DogSize;
  description: string;
  distinguishingMarks: string;
  collarDescription: string;
  chipped: ChipState;
  mainImage: string | null;
  gallery: string[];
  eventDate: string;
  lastSeenDateTime: string | null;
  region: string;
  district: string;
  city: string;
  locationDescription: string;
  publicLatitude: number | null;
  publicLongitude: number | null;
  publicLocationPrecision: PublicLocationPrecision;
  publicContactNote: string;
  source: string;
  sourceUrl: string | null;
  updatedAt: string;
  publishedAt: string | null;
  expiresAt: string | null;
  resolvedAt: string | null;
};

export type AdminDogReport = PublicDogReport & {
  mainImageKey: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  duplicateOfId: number | null;
  duplicateReason: string;
  internalNote: string;
  createdAt: string;
  archivedAt: string | null;
  createdBy: string;
  updatedBy: string;
};

export type DogReportFilters = {
  q?: string;
  region?: string;
  locality?: string;
  date?: string;
  sex?: DogSex | "";
  size?: DogSize | "";
  breedId?: number | null;
  page?: number;
  pageSize?: number;
};

export type AdminDogReportFilters = DogReportFilters & {
  type?: DogReportType | "";
  status?: LostFoundStatus | "";
};

export const dogReportTypeLabel = (type: DogReportType) => type === "LOST" ? "STRATENÝ PES" : "NÁJDENÝ PES";
export const dogReportTypeShortLabel = (type: DogReportType) => type === "LOST" ? "Stratený" : "Nájdený";
export const dogReportStatusLabel: Record<LostFoundStatus, string> = {
  DRAFT: "Koncept", PENDING: "Čaká na kontrolu", ACTIVE: "Aktívne", RESOLVED: "Vyriešené", EXPIRED: "Expirované", REJECTED: "Zamietnuté", ARCHIVED: "Archivované",
};
export const dogSexLabel: Record<DogSex, string> = { MALE: "Pes", FEMALE: "Sučka", UNKNOWN: "Neznáme" };
export const dogSizeLabel: Record<DogSize, string> = { SMALL: "Malý", MEDIUM: "Stredný", LARGE: "Veľký", UNKNOWN: "Neznáma" };
export const chipStateLabel: Record<ChipState, string> = { YES: "Áno", NO: "Nie", UNKNOWN: "Neznáme" };

export function dogReportBasePath(type: DogReportType) {
  return type === "LOST" ? "/pomoc-psom/stratene-psy" : "/pomoc-psom/najdene-psy";
}

export function dogReportHref(report: Pick<PublicDogReport, "type" | "slug">) {
  return `${dogReportBasePath(report.type)}/${report.slug}`;
}

export function dogReportTitle(report: Pick<PublicDogReport, "type" | "dogName" | "city" | "breed">) {
  const subject = report.dogName?.trim() || report.breed?.trim() || "pes";
  return `${dogReportTypeShortLabel(report.type)} ${subject}${report.city ? ` – ${report.city}` : ""}`;
}

export function formatDogReportDate(value: string | null | undefined, includeTime = false) {
  if (!value) return "Neuvedené";
  const date = new Date(value.length === 10 ? `${value}T12:00:00+02:00` : value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("sk-SK", {
    timeZone: "Europe/Bratislava",
    day: "numeric", month: "long", year: "numeric",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(date);
}
