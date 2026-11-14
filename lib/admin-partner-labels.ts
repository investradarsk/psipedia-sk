/** Human-readable admin labels. These never alter query parameters, API
 * payloads, stored status enums, or the underlying approval transitions. */
const statuses: Record<string, string> = {
  PENDING: "Čaká na posúdenie",
  PENDING_VERIFICATION: "Čaká na overenie",
  PENDING_REVIEW: "Čaká na kontrolu",
  SUBMITTED: "Odoslané",
  APPROVED: "Schválené",
  REJECTED: "Zamietnuté",
  WITHDRAWN: "Stiahnuté",
  QUARANTINED: "Pozastavené na kontrolu",
  VERIFIED: "Overené",
  UNVERIFIED: "Neoverené",
  ACTIVE: "Aktívne",
  SUSPENDED: "Pozastavené",
  DEACTIVATED: "Deaktivované",
  ARCHIVED: "Archivované",
  NEW: "Nové",
  NONE: "Bez zhody",
};
const resources: Record<string, string> = {
  DIRECTORY_PROFILE: "Profil služby",
  HELP_ORGANIZATION: "Organizácia pomoci psom",
};
const risks: Record<string, string> = {
  STALE_BASE: "Zastaralý pôvodný údaj",
  NAME_CHANGE: "Zmena názvu",
  ADDRESS_CHANGE: "Zmena adresy",
  WEBSITE_CHANGE: "Zmena webu",
  SENSITIVE_CONTACT_CHANGE: "Zmena kontaktných údajov",
};
const roles: Record<string, string> = {
  OWNER: "Správca profilu",
  EDITOR: "Editor",
  VIEWER: "Pozorovateľ",
};
const duplicateConfidence: Record<string, string> = {
  HIGH: "Vysoká zhoda",
  MEDIUM: "Možná zhoda",
  LOW: "Nízka zhoda",
  NONE: "Bez zhody",
};

export function partnerAdminStatusLabel(status: string | null | undefined) {
  if (!status) return "Neznámy stav";
  return statuses[status] ?? status;
}
export function partnerAdminResourceLabel(type: string | null | undefined) {
  if (!type) return "Neznámy typ";
  return resources[type] ?? type;
}
export function partnerAdminRiskLabel(flag: string) {
  return risks[flag] ?? flag;
}
export function partnerAdminRoleLabel(role: string | null | undefined) {
  if (!role) return "Bez priradenej roly";
  return roles[role] ?? role;
}
export function partnerAdminDuplicateLabel(value: string | null | undefined) {
  if (!value) return "Neznáma zhoda";
  return duplicateConfidence[value] ?? value;
}
