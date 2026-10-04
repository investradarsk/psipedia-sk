import type { ControlledHtmlAdapter } from "./data-automation-connectors.ts";
import type {
  AutomationEntityType,
  AutomationExtractionStrategy,
  AutomationSource,
  AutomationSourceConfig,
} from "./data-automation.ts";
import {
  GENERIC_DIRECTORY_PROFILE_ADAPTER,
  GENERIC_HELP_ITEM_PAGE_ADAPTER,
  ORGANIZATION_OFFICIAL_SITE_ADAPTER,
  ORGANIZATION_PSIADUSA_DIRECTORY_ADAPTER,
  eventHtmlAdapterConfigForSourceUrl,
  organizationHtmlAdapterKeyForSourceUrl,
} from "./data-automation-source-provisioning.ts";
import { TRNAVA_ADOPTION_DETAIL_ADAPTER } from "./data-automation-adoption-adapters.ts";
import { ZATULANE_PSIKY_SALA_FOSTER_DETAIL_ADAPTER } from "./data-automation-foster-adapters.ts";
import { KOSICE_FOUND_DOG_DETAIL_ADAPTER } from "./data-automation-lost-found-adapters.ts";
import { productionAutomationHtmlAdapters } from "./data-automation-real-sources.ts";
import { automationSourceScopedStrategyOrder } from "./data-automation-source-scoped-extraction.ts";

export type AutomationCapabilitySourceShape = "SINGLE_ITEM" | "MULTI_ITEM_LIST" | "SOURCE_DEFINED";

export type AutomationAdapterCapability = {
  adapterKey: string;
  entityType: AutomationEntityType;
  sourceShape: AutomationCapabilitySourceShape;
  parser: ControlledHtmlAdapter;
  productionReady: true;
  label: string;
};

type CapabilityMetadata = Omit<AutomationAdapterCapability, "parser" | "productionReady">;

const capabilityMetadata: CapabilityMetadata[] = [
  { adapterKey: "skj-exhibition-calendar", entityType: "EVENT", sourceShape: "MULTI_ITEM_LIST", label: "SKJ exhibition calendar" },
  { adapterKey: "agility-sk-events", entityType: "EVENT", sourceShape: "MULTI_ITEM_LIST", label: "Agility SK events" },
  { adapterKey: "zsk-sr-events", entityType: "EVENT", sourceShape: "MULTI_ITEM_LIST", label: "ZŠK SR events" },
  { adapterKey: "szpz-mushing-events", entityType: "EVENT", sourceShape: "MULTI_ITEM_LIST", label: "SZPZ mushing events" },
  { adapterKey: "svps-shelters-register", entityType: "ORGANIZATION", sourceShape: "MULTI_ITEM_LIST", label: "ŠVPS shelters register" },
  { adapterKey: ORGANIZATION_OFFICIAL_SITE_ADAPTER, entityType: "ORGANIZATION", sourceShape: "SINGLE_ITEM", label: "Organization official site" },
  { adapterKey: ORGANIZATION_PSIADUSA_DIRECTORY_ADAPTER, entityType: "ORGANIZATION", sourceShape: "MULTI_ITEM_LIST", label: "Psia duša organization directory" },
  { adapterKey: TRNAVA_ADOPTION_DETAIL_ADAPTER, entityType: "ADOPTION", sourceShape: "SINGLE_ITEM", label: "Útulok Trnava adoption detail" },
  { adapterKey: ZATULANE_PSIKY_SALA_FOSTER_DETAIL_ADAPTER, entityType: "FOSTER", sourceShape: "SINGLE_ITEM", label: "Zatúlané psíky Šaľa foster detail" },
  { adapterKey: KOSICE_FOUND_DOG_DETAIL_ADAPTER, entityType: "LOST_FOUND", sourceShape: "SINGLE_ITEM", label: "Mesto Košice found dog detail" },
  { adapterKey: GENERIC_DIRECTORY_PROFILE_ADAPTER, entityType: "DIRECTORY", sourceShape: "SINGLE_ITEM", label: "Schema.org directory profile" },
  { adapterKey: GENERIC_HELP_ITEM_PAGE_ADAPTER, entityType: "HELP_ITEM", sourceShape: "SINGLE_ITEM", label: "Explicit HELP_ITEM page" },
];

export function buildAutomationCapabilityRegistry(
  metadata: readonly CapabilityMetadata[],
  parsers: Readonly<Record<string, ControlledHtmlAdapter>>,
) {
  const entries: Record<string, AutomationAdapterCapability> = {};
  for (const definition of metadata) {
    if (entries[definition.adapterKey]) throw new Error("duplicate_automation_adapter_key:" + definition.adapterKey);
    const parser = parsers[definition.adapterKey];
    if (!parser) throw new Error("automation_adapter_parser_missing:" + definition.adapterKey);
    entries[definition.adapterKey] = Object.freeze({
      ...definition,
      parser,
      productionReady: true as const,
    });
  }
  return Object.freeze(entries);
}

export const productionAutomationCapabilityRegistry = buildAutomationCapabilityRegistry(
  capabilityMetadata,
  productionAutomationHtmlAdapters,
);

function sourceAdapterResolution(
  source: Pick<AutomationSource, "entityType" | "config" | "sourceUrl">,
) {
  const configuredAdapterKey = source.config.htmlAdapterKey?.trim() || null;
  const eventConfig: AutomationSourceConfig = source.entityType === "EVENT"
    ? eventHtmlAdapterConfigForSourceUrl(source.sourceUrl)
    : {};
  const expectedEventAdapterKey = eventConfig.htmlAdapterKey?.trim() || null;
  if (configuredAdapterKey && expectedEventAdapterKey && configuredAdapterKey !== expectedEventAdapterKey) {
    return { adapterKey: configuredAdapterKey, sourceMismatch: true };
  }
  return {
    adapterKey: configuredAdapterKey
      || expectedEventAdapterKey
      || (source.entityType === "ORGANIZATION" ? organizationHtmlAdapterKeyForSourceUrl(source.sourceUrl) : null),
    sourceMismatch: false,
  };
}

export function resolveAutomationCapability(
  source: Pick<AutomationSource, "entityType" | "connectorType" | "config" | "sourceUrl">,
  registry = productionAutomationCapabilityRegistry,
) {
  if (source.connectorType !== "CONTROLLED_HTML") return null;
  const resolution = sourceAdapterResolution(source);
  if (resolution.sourceMismatch || !resolution.adapterKey) return null;
  const capability = registry[resolution.adapterKey];
  if (!capability || capability.entityType !== source.entityType) return null;
  const configuredShape = source.config.sourceShape;
  if (configuredShape && capability.sourceShape !== "SOURCE_DEFINED" && configuredShape !== capability.sourceShape) return null;
  return capability;
}

export type AutomationExtractionCapabilityStatus = "SUPPORTED" | "UNAVAILABLE" | "UNSUPPORTED" | "BLOCKED";

export type AutomationExtractionCapability = {
  strategy: AutomationExtractionStrategy;
  status: AutomationExtractionCapabilityStatus;
  reason: string;
  adapterKey: string | null;
  label: string | null;
  sourceShape: AutomationCapabilitySourceShape | null;
};

export type AutomationGenericExtractionProbe = {
  supported: boolean;
  reason: string;
  sourceShape?: AutomationCapabilitySourceShape | null;
};

function withGovernanceStatus(
  capabilities: AutomationExtractionCapability[],
  governanceAllowed: boolean | undefined,
) {
  if (governanceAllowed !== false) return capabilities;
  return capabilities.map((capability) => ({
    ...capability,
    status: "BLOCKED" as const,
    reason: "GOVERNANCE_BLOCKED",
  }));
}

export function automationExtractionCapabilities(
  source: Pick<AutomationSource, "entityType" | "connectorType" | "config" | "sourceUrl">,
  registry = productionAutomationCapabilityRegistry,
  options: {
    governanceAllowed?: boolean;
    genericProbe?: AutomationGenericExtractionProbe | null;
    tavilyCredentialConfigured?: boolean;
  } = {},
): AutomationExtractionCapability[] {
  if (source.connectorType === "MANUAL_IMPORT") return [];
  if (source.connectorType === "STRUCTURED_JSON") {
    return withGovernanceStatus([{
      strategy: "STRUCTURED_FEED",
      status: "SUPPORTED",
      reason: "STRUCTURED_JSON_MAPPING",
      adapterKey: null,
      label: "Structured JSON mapping",
      sourceShape: "SOURCE_DEFINED",
    }], options.governanceAllowed);
  }
  if (source.connectorType !== "CONTROLLED_HTML") {
    return withGovernanceStatus([{
      strategy: "STRUCTURED_FEED",
      status: "UNSUPPORTED",
      reason: "UNSUPPORTED_CONNECTOR",
      adapterKey: null,
      label: null,
      sourceShape: null,
    }], options.governanceAllowed);
  }

  const resolution = sourceAdapterResolution(source);
  const adapterKey = resolution.adapterKey;
  let dedicated: AutomationExtractionCapability;
  if (resolution.sourceMismatch) {
    const configuredCapability = adapterKey ? registry[adapterKey] : null;
    dedicated = {
      strategy: "DEDICATED_ADAPTER",
      status: "UNSUPPORTED",
      reason: "ADAPTER_SOURCE_MISMATCH",
      adapterKey,
      label: configuredCapability?.label ?? null,
      sourceShape: source.config.sourceShape ?? null,
    };
  } else if (!adapterKey) {
    dedicated = {
      strategy: "DEDICATED_ADAPTER",
      status: "UNAVAILABLE",
      reason: "MISSING_ADAPTER",
      adapterKey: null,
      label: null,
      sourceShape: source.config.sourceShape ?? null,
    };
  } else {
    const capability = registry[adapterKey];
    if (!capability) {
      dedicated = {
        strategy: "DEDICATED_ADAPTER",
        status: "UNSUPPORTED",
        reason: "UNSUPPORTED_ADAPTER",
        adapterKey,
        label: null,
        sourceShape: source.config.sourceShape ?? null,
      };
    } else if (capability.entityType !== source.entityType) {
      dedicated = {
        strategy: "DEDICATED_ADAPTER",
        status: "UNSUPPORTED",
        reason: "ADAPTER_ENTITY_MISMATCH",
        adapterKey,
        label: capability.label,
        sourceShape: capability.sourceShape,
      };
    } else if (
      source.config.sourceShape
      && capability.sourceShape !== "SOURCE_DEFINED"
      && source.config.sourceShape !== capability.sourceShape
    ) {
      dedicated = {
        strategy: "DEDICATED_ADAPTER",
        status: "UNSUPPORTED",
        reason: "ADAPTER_SHAPE_MISMATCH",
        adapterKey,
        label: capability.label,
        sourceShape: capability.sourceShape,
      };
    } else if (typeof capability.parser !== "function") {
      dedicated = {
        strategy: "DEDICATED_ADAPTER",
        status: "UNAVAILABLE",
        reason: "MISSING_PARSER",
        adapterKey,
        label: capability.label,
        sourceShape: capability.sourceShape,
      };
    } else {
      dedicated = {
        strategy: "DEDICATED_ADAPTER",
        status: "SUPPORTED",
        reason: "READY",
        adapterKey,
        label: capability.label,
        sourceShape: capability.sourceShape,
      };
    }
  }

  return withGovernanceStatus([
    dedicated,
    {
      strategy: "GENERIC_FIRST_PARTY",
      status: options.genericProbe?.supported ? "SUPPORTED" : "UNAVAILABLE",
      reason: options.genericProbe?.supported
        ? "PROBE_CONFIRMED"
        : options.genericProbe?.reason || "PROBE_REQUIRED",
      adapterKey: null,
      label: "Generic first-party extraction",
      sourceShape: options.genericProbe?.sourceShape ?? source.config.sourceShape ?? "SOURCE_DEFINED",
    },
    {
      strategy: "TAVILY_CRAWL",
      status: !options.tavilyCredentialConfigured
        ? "UNAVAILABLE"
        : source.config.sourceShape === "SINGLE_ITEM"
          ? "UNSUPPORTED"
          : "SUPPORTED",
      reason: !options.tavilyCredentialConfigured
        ? "TAVILY_KEY_MISSING"
        : source.config.sourceShape === "SINGLE_ITEM"
          ? "DETAIL_SOURCE_PREFERS_EXTRACT"
          : "READY",
      adapterKey: null,
      label: "Tavily scoped crawl",
      sourceShape: source.config.sourceShape ?? "SOURCE_DEFINED",
    },
    {
      strategy: "TAVILY_EXTRACT",
      status: !options.tavilyCredentialConfigured
        ? "UNAVAILABLE"
        : source.config.sourceShape === "SINGLE_ITEM" && Boolean(source.sourceUrl)
          ? "SUPPORTED"
          : "UNSUPPORTED",
      reason: !options.tavilyCredentialConfigured
        ? "TAVILY_KEY_MISSING"
        : source.config.sourceShape === "SINGLE_ITEM" && Boolean(source.sourceUrl)
          ? "READY"
          : "KNOWN_DETAIL_URL_REQUIRED",
      adapterKey: null,
      label: "Tavily scoped extract",
      sourceShape: source.config.sourceShape ?? "SOURCE_DEFINED",
    },
  ], options.governanceAllowed);
}

export function selectAutomationExtractionStrategy(capabilities: readonly AutomationExtractionCapability[]) {
  for (const strategy of automationSourceScopedStrategyOrder) {
    const capability = capabilities.find((item) => item.strategy === strategy && item.status === "SUPPORTED");
    if (capability) return capability;
  }
  return null;
}

export type AutomationSourceReadinessReason =
  | "READY"
  | "UNSUPPORTED_CONNECTOR"
  | "NO_RELIABLE_EXTRACTION_STRATEGY"
  | "UNSUPPORTED_ADAPTER"
  | "ADAPTER_ENTITY_MISMATCH"
  | "ADAPTER_SOURCE_MISMATCH"
  | "ADAPTER_SHAPE_MISMATCH"
  | "MISSING_PARSER";

export type AutomationSourceReadiness = {
  applicable: boolean;
  ready: boolean;
  reason: AutomationSourceReadinessReason;
  strategy: AutomationExtractionStrategy | null;
  capabilities: AutomationExtractionCapability[];
  adapterKey: string | null;
  adapterLabel: string | null;
  sourceShape: AutomationCapabilitySourceShape | null;
};

export function automationSourceReadiness(
  source: Pick<AutomationSource, "entityType" | "connectorType" | "config" | "sourceUrl">,
  registry = productionAutomationCapabilityRegistry,
  options: {
    governanceAllowed?: boolean;
    genericProbe?: AutomationGenericExtractionProbe | null;
    tavilyCredentialConfigured?: boolean;
  } = {},
): AutomationSourceReadiness {
  if (source.connectorType === "MANUAL_IMPORT") {
    return {
      applicable: false,
      ready: true,
      reason: "READY",
      strategy: null,
      capabilities: [],
      adapterKey: null,
      adapterLabel: null,
      sourceShape: null,
    };
  }

  const capabilities = automationExtractionCapabilities(source, registry, options);
  const selected = selectAutomationExtractionStrategy(capabilities);
  if (selected) {
    return {
      applicable: true,
      ready: true,
      reason: "READY",
      strategy: selected.strategy,
      capabilities,
      adapterKey: selected.adapterKey,
      adapterLabel: selected.label,
      sourceShape: selected.sourceShape,
    };
  }

  const dedicated = capabilities.find((item) => item.strategy === "DEDICATED_ADAPTER");
  const diagnosticReason = dedicated?.reason;
  const reason: AutomationSourceReadinessReason =
    diagnosticReason === "ADAPTER_SOURCE_MISMATCH"
      || diagnosticReason === "UNSUPPORTED_ADAPTER"
      || diagnosticReason === "ADAPTER_ENTITY_MISMATCH"
      || diagnosticReason === "ADAPTER_SHAPE_MISMATCH"
      || diagnosticReason === "MISSING_PARSER"
      ? diagnosticReason
      : capabilities.some((item) => item.reason === "UNSUPPORTED_CONNECTOR")
        ? "UNSUPPORTED_CONNECTOR"
        : "NO_RELIABLE_EXTRACTION_STRATEGY";

  return {
    applicable: true,
    ready: false,
    reason,
    strategy: null,
    capabilities,
    adapterKey: dedicated?.adapterKey ?? null,
    adapterLabel: dedicated?.label ?? null,
    sourceShape: dedicated?.sourceShape ?? source.config.sourceShape ?? null,
  };
}
