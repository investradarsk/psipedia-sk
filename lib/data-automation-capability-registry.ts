import type { ControlledHtmlAdapter } from "./data-automation-connectors.ts";
import type { AutomationEntityType, AutomationSource } from "./data-automation.ts";
import {
  GENERIC_DIRECTORY_PROFILE_ADAPTER,
  GENERIC_HELP_ITEM_PAGE_ADAPTER,
  ORGANIZATION_OFFICIAL_SITE_ADAPTER,
  ORGANIZATION_PSIADUSA_DIRECTORY_ADAPTER,
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

export function resolveAutomationCapability(
  source: Pick<AutomationSource, "entityType" | "connectorType" | "config">,
  registry = productionAutomationCapabilityRegistry,
) {
  if (source.connectorType !== "CONTROLLED_HTML") return null;
  const adapterKey = source.config.htmlAdapterKey?.trim();
  if (!adapterKey) return null;
  const capability = registry[adapterKey];
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
  | "ADAPTER_SHAPE_MISMATCH"
  | "MISSING_PARSER";

export function automationSourceReadiness(
  source: Pick<AutomationSource, "entityType" | "connectorType" | "config">,
  registry = productionAutomationCapabilityRegistry,
): { ready: boolean; reason: AutomationSourceReadinessReason; adapterKey: string | null } {
  if (source.connectorType !== "CONTROLLED_HTML") {
    return { ready: source.connectorType === "STRUCTURED_JSON", reason: source.connectorType === "STRUCTURED_JSON" ? "READY" : "UNSUPPORTED_CONNECTOR", adapterKey: null };
  }
  const adapterKey = source.config.htmlAdapterKey?.trim() || null;
  if (!adapterKey) return { ready: false, reason: "MISSING_ADAPTER", adapterKey: null };
  const capability = registry[adapterKey];
  if (!capability) return { ready: false, reason: "UNSUPPORTED_ADAPTER", adapterKey };
  if (capability.entityType !== source.entityType) return { ready: false, reason: "ADAPTER_ENTITY_MISMATCH", adapterKey };
  const configuredShape = source.config.sourceShape;
  if (configuredShape && capability.sourceShape !== "SOURCE_DEFINED" && configuredShape !== capability.sourceShape) {
    return { ready: false, reason: "ADAPTER_SHAPE_MISMATCH", adapterKey };
  }
  if (typeof capability.parser !== "function") return { ready: false, reason: "MISSING_PARSER", adapterKey };
  return { ready: true, reason: "READY", adapterKey };
}
