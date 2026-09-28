import type { ControlledHtmlAdapter } from "./data-automation-connectors.ts";
import type { AutomationEntityType, AutomationSource } from "./data-automation.ts";
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
  const eventConfig = source.entityType === "EVENT"
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

export type AutomationSourceReadinessReason =
  | "READY"
  | "UNSUPPORTED_CONNECTOR"
  | "MISSING_ADAPTER"
  | "UNSUPPORTED_ADAPTER"
  | "ADAPTER_ENTITY_MISMATCH"
  | "ADAPTER_SOURCE_MISMATCH"
  | "ADAPTER_SHAPE_MISMATCH"
  | "MISSING_PARSER";

export type AutomationSourceReadiness = {
  applicable: boolean;
  ready: boolean;
  reason: AutomationSourceReadinessReason;
  adapterKey: string | null;
  adapterLabel: string | null;
  sourceShape: AutomationCapabilitySourceShape | null;
};

export function automationSourceReadiness(
  source: Pick<AutomationSource, "entityType" | "connectorType" | "config" | "sourceUrl">,
  registry = productionAutomationCapabilityRegistry,
): AutomationSourceReadiness {
  if (source.connectorType === "MANUAL_IMPORT") {
    return { applicable: false, ready: true, reason: "READY", adapterKey: null, adapterLabel: null, sourceShape: null };
  }
  if (source.connectorType === "STRUCTURED_JSON") {
    return { applicable: true, ready: true, reason: "READY", adapterKey: null, adapterLabel: "Structured JSON mapping", sourceShape: "SOURCE_DEFINED" };
  }
  if (source.connectorType !== "CONTROLLED_HTML") {
    return { applicable: true, ready: false, reason: "UNSUPPORTED_CONNECTOR", adapterKey: null, adapterLabel: null, sourceShape: null };
  }
  const resolution = sourceAdapterResolution(source);
  const adapterKey = resolution.adapterKey;
  if (resolution.sourceMismatch) {
    const configuredCapability = adapterKey ? registry[adapterKey] : null;
    return {
      applicable: true,
      ready: false,
      reason: "ADAPTER_SOURCE_MISMATCH",
      adapterKey,
      adapterLabel: configuredCapability?.label ?? null,
      sourceShape: source.config.sourceShape ?? null,
    };
  }
  if (!adapterKey) return { applicable: true, ready: false, reason: "MISSING_ADAPTER", adapterKey: null, adapterLabel: null, sourceShape: source.config.sourceShape ?? null };
  const capability = registry[adapterKey];
  if (!capability) return { applicable: true, ready: false, reason: "UNSUPPORTED_ADAPTER", adapterKey, adapterLabel: null, sourceShape: source.config.sourceShape ?? null };
  if (capability.entityType !== source.entityType) return { applicable: true, ready: false, reason: "ADAPTER_ENTITY_MISMATCH", adapterKey, adapterLabel: capability.label, sourceShape: capability.sourceShape };
  const configuredShape = source.config.sourceShape;
  if (configuredShape && capability.sourceShape !== "SOURCE_DEFINED" && configuredShape !== capability.sourceShape) {
    return { applicable: true, ready: false, reason: "ADAPTER_SHAPE_MISMATCH", adapterKey, adapterLabel: capability.label, sourceShape: capability.sourceShape };
  }
  if (typeof capability.parser !== "function") return { applicable: true, ready: false, reason: "MISSING_PARSER", adapterKey, adapterLabel: capability.label, sourceShape: capability.sourceShape };
  return { applicable: true, ready: true, reason: "READY", adapterKey, adapterLabel: capability.label, sourceShape: capability.sourceShape };
}
