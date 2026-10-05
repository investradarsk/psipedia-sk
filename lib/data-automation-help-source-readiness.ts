import type {
  AutomationConnectorType,
  AutomationEntityType,
  AutomationHelpSourceShape,
  AutomationSourceConfig,
} from "./data-automation.ts";

export const automationHelpEntityTypes = ["ADOPTION", "FOSTER", "LOST_FOUND"] as const;
export type AutomationHelpEntityType = (typeof automationHelpEntityTypes)[number];

export type AutomationHelpAdapterDefinition = {
  entityType: AutomationHelpEntityType;
  sourceShape: AutomationHelpSourceShape;
  label: string;
};

export type AutomationHelpAdapterRegistry = Readonly<Record<string, AutomationHelpAdapterDefinition>>;

/**
 * Production HELP adapters are registered only together with their concrete
 * parser support so readiness can never get ahead of ingestion capability.
 */
export const productionAutomationHelpAdapterRegistry: AutomationHelpAdapterRegistry = Object.freeze({
  "trnava-adoption-detail": {
    entityType: "ADOPTION",
    sourceShape: "SINGLE_ITEM",
    label: "Útulok Trnava — detail psa na adopciu",
  },
  "zatulane-psiky-sala-foster-detail": {
    entityType: "FOSTER",
    sourceShape: "SINGLE_ITEM",
    label: "Zatúlané psíky Šaľa — detail dočasnej opatery",
  },
  "kosice-found-dog-detail": {
    entityType: "LOST_FOUND",
    sourceShape: "SINGLE_ITEM",
    label: "Mesto Košice — detail nájdeného psa",
  },
});

export type AutomationHelpSourceReadinessReason =
  | "NOT_HELP_SOURCE"
  | "READY"
  | "UNSUPPORTED_SOURCE"
  | "MISSING_SOURCE_SHAPE"
  | "MISSING_ADAPTER"
  | "MISSING_ORGANIZATION_IDENTITY"
  | "UNSUPPORTED_ADAPTER"
  | "ADAPTER_ENTITY_MISMATCH"
  | "ADAPTER_SHAPE_MISMATCH";

export type AutomationHelpSourceReadiness = {
  applicable: boolean;
  ready: boolean;
  sourceShape: AutomationHelpSourceShape | null;
  adapterKey: string | null;
  adapterLabel: string | null;
  reason: AutomationHelpSourceReadinessReason;
};

export const automationHelpStableSourceRecordIdPriority = [
  "EXPLICIT_EXTERNAL_ID",
  "CANONICAL_DETAIL_URL",
  "DETERMINISTIC_SITE_STABLE_KEY",
] as const;

export function isAutomationHelpEntityType(value: unknown): value is AutomationHelpEntityType {
  return typeof value === "string" && (automationHelpEntityTypes as readonly string[]).includes(value);
}

function configuredSourceShape(config: AutomationSourceConfig): AutomationHelpSourceShape | null {
  return config.sourceShape === "SINGLE_ITEM" || config.sourceShape === "MULTI_ITEM_LIST"
    ? config.sourceShape
    : null;
}

export function automationHelpSourceReadiness(
  source: {
    entityType: AutomationEntityType;
    connectorType: AutomationConnectorType;
    config: AutomationSourceConfig;
  },
  registry: AutomationHelpAdapterRegistry = productionAutomationHelpAdapterRegistry,
): AutomationHelpSourceReadiness {
  if (!isAutomationHelpEntityType(source.entityType)) {
    return {
      applicable: false,
      ready: true,
      sourceShape: null,
      adapterKey: null,
      adapterLabel: null,
      reason: "NOT_HELP_SOURCE",
    };
  }

  const sourceShape = configuredSourceShape(source.config);
  const adapterKey = source.config.htmlAdapterKey?.trim() || null;

  if (source.connectorType !== "CONTROLLED_HTML") {
    return { applicable: true, ready: false, sourceShape, adapterKey, adapterLabel: null, reason: "UNSUPPORTED_SOURCE" };
  }
  if (!sourceShape) {
    return { applicable: true, ready: false, sourceShape: null, adapterKey, adapterLabel: null, reason: "MISSING_SOURCE_SHAPE" };
  }
  if (!adapterKey) {
    if (source.entityType === "ADOPTION" || source.entityType === "FOSTER") {
      const organizationName = typeof source.config.staticFields?.organizationName === "string"
        ? source.config.staticFields.organizationName.trim()
        : "";
      if (!organizationName) {
        return {
          applicable: true,
          ready: false,
          sourceShape,
          adapterKey: null,
          adapterLabel: null,
          reason: "MISSING_ORGANIZATION_IDENTITY",
        };
      }
    }
    if (source.entityType === "ADOPTION" || source.entityType === "FOSTER" || source.entityType === "LOST_FOUND") {
      // Legacy HELP readiness is no longer adapter-only for source-scoped dynamic HELP entities.
      // Entity-specific normalization and ingestion gates remain authoritative.
      return {
        applicable: true,
        ready: true,
        sourceShape,
        adapterKey: null,
        adapterLabel: null,
        reason: "READY",
      };
    }
    return { applicable: true, ready: false, sourceShape, adapterKey: null, adapterLabel: null, reason: "MISSING_ADAPTER" };
  }

  const definition = registry[adapterKey];
  if (!definition) {
    return { applicable: true, ready: false, sourceShape, adapterKey, adapterLabel: null, reason: "UNSUPPORTED_ADAPTER" };
  }
  if (definition.entityType !== source.entityType) {
    return {
      applicable: true,
      ready: false,
      sourceShape,
      adapterKey,
      adapterLabel: definition.label,
      reason: "ADAPTER_ENTITY_MISMATCH",
    };
  }
  if (definition.sourceShape !== sourceShape) {
    return {
      applicable: true,
      ready: false,
      sourceShape,
      adapterKey,
      adapterLabel: definition.label,
      reason: "ADAPTER_SHAPE_MISMATCH",
    };
  }
  return {
    applicable: true,
    ready: true,
    sourceShape,
    adapterKey,
    adapterLabel: definition.label,
    reason: "READY",
  };
}

export function automationHelpRecordShapeError(
  source: { entityType: AutomationEntityType; config: AutomationSourceConfig },
  recordCount: number,
) {
  if (!isAutomationHelpEntityType(source.entityType)) return null;
  if (source.config.sourceShape === "SINGLE_ITEM" && recordCount > 1) {
    return "help_single_item_multiple_records";
  }
  if (source.config.sourceShape === "MULTI_ITEM_LIST" && recordCount < 1) {
    return "help_multi_item_no_records";
  }
  return null;
}

export type AutomationHelpProvisioningRule = {
  entityType: AutomationHelpEntityType;
  hostname: string;
  pathPattern: RegExp;
  sourceShape: AutomationHelpSourceShape;
  adapterKey: string;
  expectedMinRecords?: number;
};

/**
 * Host/path provisioning is intentionally allow-listed and must be backed by
 * a production adapter with matching entity/shape metadata.
 */
export const productionAutomationHelpProvisioningRules: readonly AutomationHelpProvisioningRule[] = [
  {
    entityType: "ADOPTION",
    hostname: "trnava.utulok.sk",
    pathPattern: /^\/psy\/[^/]+\/?$/,
    sourceShape: "SINGLE_ITEM",
    adapterKey: "trnava-adoption-detail",
    expectedMinRecords: 1,
  },
  {
    entityType: "FOSTER",
    hostname: "zatulanepsikysala.sk",
    pathPattern: /^\/pomoc\/[^/]+\/?$/,
    sourceShape: "SINGLE_ITEM",
    adapterKey: "zatulane-psiky-sala-foster-detail",
    expectedMinRecords: 1,
  },
  {
    entityType: "LOST_FOUND",
    hostname: "kosice.sk",
    pathPattern: /^\/clanok\/(?:najden[yae]|opusten[yae])-[a-z0-9-]+\/?$/i,
    sourceShape: "SINGLE_ITEM",
    adapterKey: "kosice-found-dog-detail",
    expectedMinRecords: 1,
  },
];

export function helpCandidateProvisioningConfigFor(input: {
  entityType: AutomationEntityType;
  canonicalUrl: string;
  registry?: AutomationHelpAdapterRegistry;
  rules?: readonly AutomationHelpProvisioningRule[];
}): AutomationSourceConfig {
  if (!isAutomationHelpEntityType(input.entityType)) return {};
  const registry = input.registry ?? productionAutomationHelpAdapterRegistry;
  const rules = input.rules ?? productionAutomationHelpProvisioningRules;

  let url: URL;
  try {
    url = new URL(input.canonicalUrl);
  } catch {
    return {};
  }

  const rule = rules.find((candidate) =>
    candidate.entityType === input.entityType
    && url.hostname.toLowerCase().replace(/^www\./, "") === candidate.hostname.toLowerCase().replace(/^www\./, "")
    && candidate.pathPattern.test(url.pathname),
  );
  if (!rule) return {};

  const adapter = registry[rule.adapterKey];
  if (!adapter || adapter.entityType !== rule.entityType || adapter.sourceShape !== rule.sourceShape) return {};
  return {
    sourceShape: rule.sourceShape,
    htmlAdapterKey: rule.adapterKey,
    ...(rule.expectedMinRecords ? { expectedMinRecords: rule.expectedMinRecords } : {}),
  };
}
