import {
  automationConnectorTypes,
  isAutomationEntityType,
  isSafeAutomationSourceUrl,
  type AutomationConnectorType,
  type AutomationEntityType,
  type AutomationSourceConfig,
} from "./data-automation.ts";

export type AutomationSourceAdminInput = {
  sourceKey: string;
  label: string;
  entityType: AutomationEntityType;
  connectorType: AutomationConnectorType;
  sourceUrl: string | null;
  cadenceMinutes: number;
  throttleMs: number;
  timeoutMs: number;
  retryMaxAttempts: number;
  retryBackoffMs: number;
  maxRecordsPerRun: number;
  config: AutomationSourceConfig;
};

function integer(value: unknown, min: number, max: number, fallback: number) {
  const number = Number(value);
  return Number.isInteger(number) && number >= min && number <= max ? number : fallback;
}

export function parseAutomationSourceAdminInput(value: unknown): { value?: AutomationSourceAdminInput; error?: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { error: "Neplatný payload zdroja." };
  const input = value as Record<string, unknown>;
  const sourceKey = String(input.sourceKey ?? "").trim().toLowerCase();
  const label = String(input.label ?? "").trim();
  const entityType = input.entityType;
  const connectorType = String(input.connectorType ?? "") as AutomationConnectorType;
  const sourceUrlRaw = String(input.sourceUrl ?? "").trim();
  const sourceUrl = sourceUrlRaw || null;

  if (!/^[a-z0-9][a-z0-9-]{2,79}$/.test(sourceKey)) return { error: "Source key musí mať 3–80 znakov: a-z, 0-9 a pomlčka." };
  if (!label || label.length > 160) return { error: "Názov zdroja je povinný a môže mať najviac 160 znakov." };
  if (!isAutomationEntityType(entityType)) return { error: "Neplatný entity type." };
  if (!(automationConnectorTypes as readonly string[]).includes(connectorType)) return { error: "Neplatný connector type." };
  if (connectorType !== "MANUAL_IMPORT" && (!sourceUrl || !isSafeAutomationSourceUrl(sourceUrl))) {
    return { error: "Zdroj musí používať bezpečnú verejnú HTTPS URL." };
  }
  if (sourceUrl && !isSafeAutomationSourceUrl(sourceUrl)) return { error: "URL zdroja nie je bezpečná." };

  let config: AutomationSourceConfig = {};
  if (typeof input.config === "string") {
    try {
      const parsed = JSON.parse(input.config);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("bad");
      config = parsed as AutomationSourceConfig;
    } catch {
      return { error: "Mapping/config musí byť platný JSON objekt." };
    }
  } else if (input.config && typeof input.config === "object" && !Array.isArray(input.config)) {
    config = input.config as AutomationSourceConfig;
  }

  return {
    value: {
      sourceKey,
      label,
      entityType,
      connectorType,
      sourceUrl,
      cadenceMinutes: integer(input.cadenceMinutes, 60, 43_200, 1440),
      throttleMs: integer(input.throttleMs, 0, 60_000, 1000),
      timeoutMs: integer(input.timeoutMs, 1000, 30_000, 8000),
      retryMaxAttempts: integer(input.retryMaxAttempts, 0, 4, 2),
      retryBackoffMs: integer(input.retryBackoffMs, 100, 30_000, 1000),
      maxRecordsPerRun: integer(input.maxRecordsPerRun, 1, 500, 100),
      config,
    },
  };
}
