import type { AutomationEntityType } from "./data-automation";
import type { AutomationSourceAdminRow } from "./data-automation-source-store";
import type { AutomationFindingSummary } from "./data-automation-store";

export type AutomationUxCategory = {
  slug: string;
  title: string;
  description: string;
  entityTypes: AutomationEntityType[];
};

export const automationUxCategories: AutomationUxCategory[] = [
  { slug: "podujatia", title: "Podujatia", description: "Kalendáre, preteky, výstavy a ďalšie psie podujatia.", entityTypes: ["EVENT"] },
  { slug: "veterinari", title: "Veterinári", description: "Veterinárne ambulancie, kliniky a pracoviská.", entityTypes: ["DIRECTORY"] },
  { slug: "utulky-organizacie", title: "Útulky a organizácie", description: "Útulky, karanténne stanice a organizácie pomáhajúce psom.", entityTypes: ["ORGANIZATION"] },
  { slug: "psie-sluzby", title: "Psie služby", description: "Hotely, tréneri, salóny, škôlky a ďalšie služby.", entityTypes: ["DIRECTORY"] },
  { slug: "adopcie", title: "Adopcie", description: "Psy a ponuky určené na adopciu.", entityTypes: ["ADOPTION"] },
  { slug: "docasna-opatera", title: "Dočasná opatera", description: "Výzvy a ponuky dočasnej opatery.", entityTypes: ["FOSTER"] },
  { slug: "stratene-najdene", title: "Stratené / nájdené", description: "Hlásenia o stratených a nájdených psoch.", entityTypes: ["LOST_FOUND"] },
];

const directoryVeterinaryHint = /veterin|vet\b|klinika|ambulancia/i;

export function automationCategoryForSource(source: Pick<AutomationSourceAdminRow, "entityType" | "sourceKey" | "label" | "sourceUrl">) {
  if (source.entityType === "DIRECTORY") {
    const searchable = [source.sourceKey, source.label, source.sourceUrl ?? ""].join(" ");
    return directoryVeterinaryHint.test(searchable) ? "veterinari" : "psie-sluzby";
  }
  return automationUxCategories.find((category) => category.entityTypes.includes(source.entityType))?.slug ?? null;
}

export function automationCategoryBySlug(slug: string) {
  return automationUxCategories.find((category) => category.slug === slug) ?? null;
}

export function automationSourcesForCategory(sources: AutomationSourceAdminRow[], slug: string) {
  return sources.filter((source) => automationCategoryForSource(source) === slug);
}

export function automationCategoryStatus(sources: AutomationSourceAdminRow[]) {
  if (sources.length === 0) return "Čaká na nastavenie";
  if (sources.some((source) => source.lastRunStatus === "FAILED" || Boolean(source.lastErrorCode))) return "Problém";
  if (sources.some((source) => source.enabled)) return "Aktívna";
  return "Vypnutá";
}

export function automationCategoryLastCheck(sources: AutomationSourceAdminRow[]) {
  return sources
    .map((source) => source.lastCheckedAt)
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;
}

export function automationFindingsForSources(findings: AutomationFindingSummary[], sources: AutomationSourceAdminRow[]) {
  const sourceIds = new Set(sources.map((source) => source.id));
  return findings.filter((finding) =>
    sourceIds.has(finding.sourceId)
    && (finding.reviewStatus === "NEW" || finding.reviewStatus === "IN_REVIEW")
  );
}

export function automationCategoryFindingCount(findings: AutomationFindingSummary[], sources: AutomationSourceAdminRow[]) {
  return automationFindingsForSources(findings, sources).length;
}

export function automationSourceFindingCount(findings: AutomationFindingSummary[], sourceId: number) {
  return findings.filter((finding) =>
    finding.sourceId === sourceId
    && (finding.reviewStatus === "NEW" || finding.reviewStatus === "IN_REVIEW")
  ).length;
}

export function automationFieldLabel(field: string) {
  const labels: Record<string, string> = {
    title: "Názov",
    name: "Názov",
    startDate: "Dátum začiatku",
    endDate: "Dátum konca",
    startTime: "Čas začiatku",
    endTime: "Čas konca",
    websiteUrl: "Web podujatia",
    registrationUrl: "Registrácia",
    organizer: "Organizátor",
    venue: "Miesto",
    address: "Adresa",
    city: "Obec / mesto",
    district: "Okres",
    region: "Kraj",
    publicEmail: "Verejný e-mail",
    publicPhone: "Verejný telefón",
    facebookUrl: "Facebook",
    instagramUrl: "Instagram",
    status: "Stav",
    cancelled: "Zrušené",
    description: "Popis",
    practicalInfo: "Praktické informácie",
    importKey: "Import identifikátor",
  };
  return labels[field] ?? field;
}

export function automationFindingLabel(value: string) {
  const labels: Record<string, string> = {
    NEW_ENTITY: "Nový záznam",
    POSSIBLE_UPDATE: "Navrhovaná zmena",
    POSSIBLE_INACTIVE: "Možná neaktivita",
    POSSIBLE_CANCELLED: "Možné zrušenie",
    DUPLICATE_CANDIDATE: "Možná duplicita",
    SOURCE_ERROR: "Chyba zdroja",
  };
  return labels[value] ?? value;
}

export function automationSourceDomain(url: string | null) {
  if (!url) return "—";
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return "—"; }
}

export function automationReadableError(code: string | null) {
  if (!code) return null;
  if (/timeout/i.test(code)) return "Zdroj neodpovedal včas.";
  if (/dns/i.test(code)) return "Doménu zdroja sa nepodarilo nájsť.";
  if (/403/.test(code)) return "Zdroj odmietol prístup.";
  if (/404/.test(code)) return "Stránka zdroja sa nenašla.";
  if (/adapter_no_records/i.test(code)) return "Zdroj nevrátil očakávané záznamy.";
  if (/parse/i.test(code)) return "Údaje zdroja sa nepodarilo správne spracovať.";
  return "Posledná kontrola zdroja skončila chybou.";
}


export function automationSourceRoleLabel(value: string) {
  const labels: Record<string, string> = {
    OFFICIAL_ORGANIZER: "Oficiálny zdroj",
    OFFICIAL_REGISTRY: "Register",
    OFFICIAL_CLUB_CALENDAR: "Oficiálny klubový kalendár",
    SECONDARY_DIRECTORY: "Sekundárny zdroj",
    SEARCH_DISCOVERY: "Discovery zdroj",
    SOCIAL_LISTING: "Sociálny listing",
    AGGREGATOR: "Agregátor",
    UNKNOWN: "Zdroj",
  };
  return labels[value] ?? "Zdroj";
}
