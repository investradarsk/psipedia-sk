import type { PartnerRole } from "@/lib/partner-platform";

const ROLE_LABELS: Record<PartnerRole, string> = {
  OWNER: "Vlastník",
  MANAGER: "Manažér",
  EDITOR: "Editor",
};

const RESOURCE_STATUS_LABELS: Record<string, string> = {
  published: "Zverejnené",
  PUBLISHED: "Zverejnené",
  draft: "Koncept",
  DRAFT: "Koncept",
  archived: "Archivované",
  ARCHIVED: "Archivované",
  ACTIVE: "Aktívne",
  PAUSED: "Pozastavené",
  EXPIRED: "Ukončené",
  CANCELLED: "Zrušené",
};

const COMMERCIAL_TYPE_LABELS: Record<string, string> = {
  PREMIUM_PROFILE: "Premium profil",
  PROMOTED_PROFILE: "Sponzorované zvýraznenie",
  AD_CAMPAIGN: "Reklamná kampaň",
  OTHER: "Iný záujem",
};

const COMMERCIAL_STATUS_LABELS: Record<string, string> = {
  NEW: "Nové",
  CONTACTED: "Kontaktované",
  INTERESTED: "Záujem potvrdený",
  NOT_NOW: "Odložené",
  CLOSED: "Uzavreté",
  DRAFT: "Koncept",
  OFFERED: "Ponuka odoslaná",
  AGREED: "Dohodnuté",
  ACTIVE: "Aktívne",
  PAUSED: "Pozastavené",
  SCHEDULED: "Naplánované",
  EXPIRED: "Ukončené",
  CANCELLED: "Zrušené",
  PENDING: "Čaká na spracovanie",
  APPROVED: "Schválené",
  REJECTED: "Zamietnuté",
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  BANK_TRANSFER: "Bankový prevod",
  BY_AGREEMENT: "Podľa dohody",
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  NOT_REQUIRED: "Platba sa nevyžaduje",
  AWAITING_PAYMENT: "Čaká na platbu",
  PAID: "Zaplatené",
  WAIVED: "Platba sa nevyžaduje",
};

const EVENT_OPERATION_LABELS: Record<string, string> = {
  CREATE: "Nové podujatie",
  UPDATE: "Úprava podujatia",
};

export const partnerOrganizationTypeOptions = [
  ["SHELTER", "Útulok"],
  ["CIVIC_ASSOCIATION", "Občianske združenie"],
  ["RESCUE_ORGANIZATION", "Záchranná organizácia"],
  ["MUNICIPAL_ORGANIZATION", "Mestská / obecná organizácia"],
  ["NONPROFIT", "Nezisková organizácia"],
  ["OTHER", "Iný typ organizácie"],
] as const;

function label(value: string, labels: Record<string, string>) {
  return labels[value] ?? value;
}

export function partnerRoleLabel(value: PartnerRole | string) {
  return ROLE_LABELS[value as PartnerRole] ?? value;
}

export function partnerResourceStatusLabel(value: string) {
  return label(value, RESOURCE_STATUS_LABELS);
}

export function partnerCommercialTypeLabel(value: string) {
  return label(value, COMMERCIAL_TYPE_LABELS);
}

export function partnerCommercialStatusLabel(value: string) {
  return label(value, COMMERCIAL_STATUS_LABELS);
}

export function partnerPaymentMethodLabel(value: string) {
  return label(value, PAYMENT_METHOD_LABELS);
}

export function partnerPaymentStatusLabel(value: string) {
  return label(value, PAYMENT_STATUS_LABELS);
}

export function partnerEventOperationLabel(value: string) {
  return label(value, EVENT_OPERATION_LABELS);
}

export function partnerOrganizationTypeLabel(value: string) {
  return partnerOrganizationTypeOptions.find(([type]) => type === value)?.[1] ?? value;
}
