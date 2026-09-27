import {
  canonicalizeSourceUrl,
  isSafeAutomationSourceUrl,
  type AutomationEntityType,
  type AutomationSourceConfig,
} from "./data-automation.ts";

export const ORGANIZATION_OFFICIAL_SITE_ADAPTER = "organization-official-site";
export const ORGANIZATION_PSIADUSA_DIRECTORY_ADAPTER = "psiadusa-organization-directory";
export const ORGANIZATION_GENERIC_APPROVED_ADAPTER = "organization-approved-source";

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

  const directoryCategory = input.entityType === "DIRECTORY" && typeof input.metadata.directoryCategory === "string"
    ? input.metadata.directoryCategory.trim()
    : "";
  if (!directoryCategory) return {};
  return {
    staticFields: {
      category: directoryCategory,
      semanticKind: "FACILITY_OR_SERVICE_PROFILE",
    },
  };
}
