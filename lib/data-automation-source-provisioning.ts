import {
  canonicalizeSourceUrl,
  isSafeAutomationSourceUrl,
  type AutomationEntityType,
  type AutomationSourceConfig,
} from "./data-automation.ts";
import {
  helpCandidateProvisioningConfigFor,
  isAutomationHelpEntityType,
} from "./data-automation-help-source-readiness.ts";

export const ORGANIZATION_OFFICIAL_SITE_ADAPTER = "organization-official-site";
export const ORGANIZATION_PSIADUSA_DIRECTORY_ADAPTER = "psiadusa-organization-directory";
export const GENERIC_DIRECTORY_PROFILE_ADAPTER = "generic-directory-profile";
export const GENERIC_HELP_ITEM_PAGE_ADAPTER = "generic-help-item-page";

export const SUPPORTED_DIRECTORY_CATEGORIES = [
  "veterinari",
  "treneri",
  "kynologicke-kluby",
  "chovatelske-kluby",
  "chovatelske-stanice",
  "salony-a-sluzby",
  "hotely-a-opatrovanie",
  "vencenie",
  "fyzioterapia",
  "dalsie-sluzby",
] as const;

const DIRECTORY_CATEGORIES = new Set<string>(SUPPORTED_DIRECTORY_CATEGORIES);

const CLUB_DIRECTORY_CATEGORIES = new Set(["kynologicke-kluby", "chovatelske-kluby"]);
const HELP_ITEM_CATEGORIES = new Set(["zbierky", "dobrovolnictvo"]);

export function qualifiedDirectoryCategory(metadata: Record<string, unknown>) {
  const value = typeof metadata.directoryCategory === "string" ? metadata.directoryCategory.trim() : "";
  return DIRECTORY_CATEGORIES.has(value) ? value : null;
}

export function qualifiedClubDirectoryCategory(metadata: Record<string, unknown>) {
  const value = qualifiedDirectoryCategory(metadata);
  return value && CLUB_DIRECTORY_CATEGORIES.has(value) ? value : null;
}

export function qualifiedHelpItemCategory(metadata: Record<string, unknown>) {
  const value = typeof metadata.helpCategory === "string" ? metadata.helpCategory.trim() : "";
  return HELP_ITEM_CATEGORIES.has(value) ? value : null;
}

export function isPsiaDusaOrganizationDirectoryUrl(value: unknown) {
  const canonical = canonicalizeSourceUrl(value);
  if (!canonical) return false;
  try {
    const url = new URL(canonical);
    return url.hostname === "psiadusa.sk" && /^\/zoznam-utulkov(?:\/)?$/i.test(url.pathname);
  } catch {
    return false;
  }
}

function looksLikeUnknownOrganizationDirectory(value: string) {
  try {
    const url = new URL(value);
    return /(?:^|[-_/])(zoznam|utulky|organizacie|register|adresar|directory|list)(?:[-_/]|$)/i.test(url.pathname);
  } catch {
    return true;
  }
}

export function organizationHtmlAdapterKeyForSourceUrl(value: unknown): string | null {
  const canonical = canonicalizeSourceUrl(value);
  if (!canonical || !isSafeAutomationSourceUrl(canonical)) return null;
  if (isPsiaDusaOrganizationDirectoryUrl(canonical)) return ORGANIZATION_PSIADUSA_DIRECTORY_ADAPTER;
  if (looksLikeUnknownOrganizationDirectory(canonical)) return null;
  return ORGANIZATION_OFFICIAL_SITE_ADAPTER;
}

export function candidateProvisioningConfigFor(input: {
  entityType: AutomationEntityType;
  canonicalUrl: string;
  metadata: Record<string, unknown>;
}): AutomationSourceConfig {
  if (input.entityType === "ORGANIZATION") {
    const htmlAdapterKey = organizationHtmlAdapterKeyForSourceUrl(input.canonicalUrl);
    return htmlAdapterKey ? { htmlAdapterKey } : {};
  }

  if (isAutomationHelpEntityType(input.entityType)) {
    return helpCandidateProvisioningConfigFor({
      entityType: input.entityType,
      canonicalUrl: input.canonicalUrl,
    });
  }

  if (input.entityType === "HELP_ITEM") {
    const helpCategory = qualifiedHelpItemCategory(input.metadata);
    if (!helpCategory) return {};
    return {
      sourceShape: "SINGLE_ITEM",
      htmlAdapterKey: GENERIC_HELP_ITEM_PAGE_ADAPTER,
      expectedMinRecords: 1,
      staticFields: {
        category: helpCategory,
      },
    };
  }

  if (input.entityType !== "DIRECTORY") return {};
  const directoryCategory = qualifiedDirectoryCategory(input.metadata);
  if (!directoryCategory) return {};
  return {
    sourceShape: "SINGLE_ITEM",
    htmlAdapterKey: GENERIC_DIRECTORY_PROFILE_ADAPTER,
    expectedMinRecords: 1,
    staticFields: {
      category: directoryCategory,
      semanticKind: "FACILITY_OR_SERVICE_PROFILE",
    },
  };
}
