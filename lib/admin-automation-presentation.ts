import type { AutomationEntityType } from "./data-automation";
import type { AutomationSourceAdminRow, AutomationSourceCandidateRow } from "./data-automation-source-store";
import type { AutomationDiscoveryRoot } from "./data-automation-discovery-store";
import { automationProductCategoryBySlug, automationProductCategoryForEntity, type AutomationCategoryMode } from "./data-automation-product-model";
import type { AutomationFindingSummary } from "./data-automation-store";

export type AutomationUxCategory = {
  slug: string;
  title: string;
  description: string;
  entityTypes: AutomationEntityType[];
  mode: AutomationCategoryMode;
  draftsHref: string;
};

export const automationUxCategories: AutomationUxCategory[] = [
  { slug: "podujatia", title: "Podujatia", description: "Kalendáre, preteky, výstavy a ďalšie psie podujatia.", entityTypes: ["EVENT"], mode: "FEED_SOURCE", draftsHref: "/admin/podujatia" },
  { slug: "veterinari", title: "Veterinári", description: "Veterinárne ambulancie, kliniky a pracoviská.", entityTypes: ["DIRECTORY"], mode: "DIRECT_ENTITY", draftsHref: "/admin/adresar?category=veterinari&status=DRAFT" },
  { slug: "utulky-organizacie", title: "Útulky a organizácie", description: "Útulky, karanténne stanice a organizácie pomáhajúce psom.", entityTypes: ["ORGANIZATION"], mode: "DIRECT_ENTITY", draftsHref: "/admin/organizacie" },
  { slug: "psie-sluzby", title: "Psie služby", description: "Hotely, tréneri, salóny, škôlky a ďalšie služby.", entityTypes: ["DIRECTORY"], mode: "DIRECT_ENTITY", draftsHref: "/admin/adresar?status=DRAFT" },
  { slug: "adopcie", title: "Adopcie", description: "Psy a ponuky určené na adopciu.", entityTypes: ["ADOPTION"], mode: "FEED_SOURCE", draftsHref: "/admin/adopcie?status=DRAFT" },
  { slug: "docasna-opatera", title: "Dočasná opatera", description: "Výzvy a ponuky dočasnej opatery.", entityTypes: ["FOSTER"], mode: "FEED_SOURCE", draftsHref: "/admin/pomoc?category=docasna-opatera&status=DRAFT" },
  { slug: "stratene-najdene", title: "Stratené / nájdené", description: "Hlásenia o stratených a nájdených psoch.", entityTypes: ["LOST_FOUND"], mode: "FEED_SOURCE", draftsHref: "/admin/stratene-najdene?status=DRAFT" },
];

export const automationCadenceOptions = Object.freeze([
  { minutes: 360, label: "Každých 6 hodín" },
  { minutes: 720, label: "Každých 12 hodín" },
  { minutes: 1440, label: "Každý deň" },
  { minutes: 2880, label: "Každé 2 dni" },
  { minutes: 10080, label: "Každý týždeň" },
  { minutes: 20160, label: "Každé 2 týždne" },
  { minutes: 43200, label: "Každý mesiac" },
]);

export function isAutomationCadenceOption(value: number) {
  return automationCadenceOptions.some((option) => option.minutes === value);
}

export function automationDiscoveryMinimumCadenceMinutes(slug: string) {
  if (slug === "podujatia") return 2880;
  if (["adopcie", "docasna-opatera", "stratene-najdene"].includes(slug)) return 1440;
  return 10080;
}

function automationCategoryForEntity(entityType: AutomationEntityType, _searchable: string, directoryCategory?: unknown) {
  return automationProductCategoryForEntity(entityType, directoryCategory);
}

export function automationCategoryForSource(source: Pick<AutomationSourceAdminRow, "entityType" | "sourceKey" | "label" | "sourceUrl" | "config">) {
  return automationCategoryForEntity(
    source.entityType,
    [source.sourceKey, source.label, source.sourceUrl ?? ""].join(" "),
    source.config?.staticFields?.category,
  );
}

export function automationCategoryForCandidate(candidate: Pick<AutomationSourceCandidateRow, "entityType" | "label" | "sourceUrl" | "reason" | "metadata">) {
  return automationCategoryForEntity(
    candidate.entityType,
    [candidate.label, candidate.sourceUrl, candidate.reason].join(" "),
    candidate.metadata?.directoryCategory ?? candidate.metadata?.category,
  );
}

export function automationCategoryForDiscoveryRoot(root: Pick<AutomationDiscoveryRoot, "entityType" | "rootKey" | "label" | "sourceUrl" | "config">) {
  return automationCategoryForEntity(
    root.entityType,
    [root.rootKey, root.label, root.sourceUrl ?? ""].join(" "),
    root.config?.directoryCategory,
  );
}

export function automationCategoryBySlug(slug: string) {
  if (!automationProductCategoryBySlug(slug)) return null;
  return automationUxCategories.find((category) => category.slug === slug) ?? null;
}

export function automationSourcesForCategory(sources: AutomationSourceAdminRow[], slug: string) {
  return sources.filter((source) => automationCategoryForSource(source) === slug);
}

export function automationCandidatesForCategory(candidates: AutomationSourceCandidateRow[], slug: string) {
  return candidates.filter((candidate) => automationCategoryForCandidate(candidate) === slug);
}

export function automationDiscoveryRootsForCategory(roots: AutomationDiscoveryRoot[], slug: string) {
  return roots.filter((root) => automationCategoryForDiscoveryRoot(root) === slug);
}

export function automationCandidateAttentionCount(candidates: AutomationSourceCandidateRow[]) {
  return candidates.filter((candidate) => candidate.reviewStatus === "NEW" && candidate.lifecycle === "ACTIVE").length;
}

export function automationSourceAttentionCount(sources: AutomationSourceAdminRow[]) {
  return sources.filter((source) =>
    source.reviewStatus === "PENDING"
    || source.lastRunStatus === "FAILED"
    || Boolean(source.lastErrorCode)
  ).length;
}

export function automationCategoryStatus(sources: AutomationSourceAdminRow[]) {
  if (sources.some((source) => source.lastRunStatus === "FAILED" || Boolean(source.lastErrorCode))) return "Problém";
  if (sources.some((source) => source.reviewStatus === "PENDING")) return "Vyžaduje kontrolu";
  if (sources.some((source) => source.enabled)) return "V poriadku";
  return "Vypnuté";
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
    NEW_ENTITY: "Nový návrh",
    POSSIBLE_UPDATE: "Navrhovaná zmena",
    POSSIBLE_INACTIVE: "Možná neaktivita",
    POSSIBLE_CANCELLED: "Možné zrušenie",
    DUPLICATE_CANDIDATE: "Možná duplicita",
    SOURCE_ERROR: "Problém so zdrojom",
  };
  return labels[value] ?? value;
}

export function automationSourceDomain(url: string | null) {
  if (!url) return "—";
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return "—"; }
}

export function automationSourceOnlyErrorMessage(
  value: unknown,
  fallback = "Operáciu sa nepodarilo dokončiť.",
) {
  const message = typeof value === "string" ? value.trim() : "";
  if (/^automation_source_technical_verification_failed$/i.test(message)) {
    return "Tento zdroj sa momentálne nepodarilo bezpečne overiť. Skús to neskôr.";
  }
  if (
    /^automation_source_not_ready(?::.*)?$/i.test(message)
    || /^automation_source_governance_blocked(?::.*)?$/i.test(message)
    || /^automation_source_activation_blocked(?::.*)?$/i.test(message)
    || /^automation_candidate_source_not_ready:/i.test(message)
    || /^automation_candidate_source_provisioning_conflict$/i.test(message)
  ) {
    return "Tento zdroj zatiaľ nemožno automaticky kontrolovať.";
  }
  if (/^automation_[a-z0-9_.:,-]+$/i.test(message)) return fallback;
  return message || fallback;
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
