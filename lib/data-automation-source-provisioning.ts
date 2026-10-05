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

const EVENT_SOURCE_PROVISIONING = [
  {
    hostname: "skj.sk",
    pathname: "/sk/vystavy/kalendar",
    config: {
      sourceShape: "MULTI_ITEM_LIST",
      htmlAdapterKey: "skj-exhibition-calendar",
      expectedMinRecords: 1,
    },
  },
  {
    hostname: "agility.sk",
    pathname: "/preteky",
    config: {
      sourceShape: "MULTI_ITEM_LIST",
      htmlAdapterKey: "agility-sk-events",
      expectedMinRecords: 1,
    },
  },
  {
    hostname: "zsksr.sk",
    pathname: "/kalendar",
    config: {
      sourceShape: "MULTI_ITEM_LIST",
      htmlAdapterKey: "zsk-sr-events",
      expectedMinRecords: 1,
    },
  },
  {
    hostname: "mushing.sk",
    pathname: "/preteky",
    config: {
      sourceShape: "MULTI_ITEM_LIST",
      htmlAdapterKey: "szpz-mushing-events",
      expectedMinRecords: 1,
    },
  },
] as const satisfies ReadonlyArray<{
  hostname: string;
  pathname: string;
  config: AutomationSourceConfig;
}>;

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

export function eventHtmlAdapterConfigForSourceUrl(value: unknown): AutomationSourceConfig {
  const canonical = canonicalizeSourceUrl(value);
  if (!canonical || !isSafeAutomationSourceUrl(canonical)) return {};
  const url = new URL(canonical);
  if (url.search) return {};
  const rule = EVENT_SOURCE_PROVISIONING.find((item) =>
    item.hostname === url.hostname && item.pathname === url.pathname
  );
  return rule ? { ...rule.config } : {};
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

  if (input.entityType === "EVENT") {
    return eventHtmlAdapterConfigForSourceUrl(input.canonicalUrl);
  }

  if (isAutomationHelpEntityType(input.entityType)) {
    const dedicated = helpCandidateProvisioningConfigFor({
      entityType: input.entityType,
      canonicalUrl: input.canonicalUrl,
    });
    if (
      Object.keys(dedicated).length > 0
      || (input.entityType !== "ADOPTION" && input.entityType !== "FOSTER")
    ) return dedicated;

    const sourceShape = input.metadata.sourceShape === "SINGLE_ITEM" || input.metadata.sourceShape === "MULTI_ITEM_LIST"
      ? input.metadata.sourceShape
      : null;
    const organizationName = typeof input.metadata.organizationName === "string"
      ? input.metadata.organizationName.trim().slice(0, 500)
      : "";
    if (!sourceShape || !organizationName) return {};
    return {
      sourceShape,
      staticFields: { organizationName },
    };
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
