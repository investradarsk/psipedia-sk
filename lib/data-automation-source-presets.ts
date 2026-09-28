import type { AutomationEntityType, AutomationSourceConfig } from "./data-automation.ts";

export const defaultAutomationCadenceMinutes: Record<AutomationEntityType, number> = {
  EVENT: 360,
  ORGANIZATION: 10_080,
  HELP_ITEM: 720,
  ADOPTION: 720,
  FOSTER: 720,
  LOST_FOUND: 360,
  DIRECTORY: 10_080,
};

export const referenceAutomationSourceConfigs = {
  eventsStructuredJson: {
    entityType: "EVENT",
    connectorType: "STRUCTURED_JSON",
    cadenceMinutes: defaultAutomationCadenceMinutes.EVENT,
    maxRecordsPerRun: 100,
    config: {
      recordsPath: "items",
      idField: "id",
      urlField: "url",
      timestampField: "updated_at",
      fields: {
        title: "title",
        startDate: "start_date",
        endDate: "end_date",
        organizer: "organizer",
        city: "city",
        region: "region",
        cancelled: "cancelled",
        websiteUrl: "url",
      },
    } satisfies AutomationSourceConfig,
  },
  organizationsStructuredJson: {
    entityType: "ORGANIZATION",
    connectorType: "STRUCTURED_JSON",
    cadenceMinutes: defaultAutomationCadenceMinutes.ORGANIZATION,
    maxRecordsPerRun: 75,
    config: {
      recordsPath: "organizations",
      idField: "id",
      urlField: "url",
      timestampField: "updated_at",
      fields: {
        name: "name",
        registrationNumber: "registration_number",
        city: "city",
        region: "region",
        websiteUrl: "website",
        publicEmail: "email",
        publicPhone: "phone",
      },
    } satisfies AutomationSourceConfig,
  },
  directoryManualImport: {
    entityType: "DIRECTORY",
    connectorType: "MANUAL_IMPORT",
    cadenceMinutes: defaultAutomationCadenceMinutes.DIRECTORY,
    maxRecordsPerRun: 100,
    config: {
      idField: "import_key",
      urlField: "source_url",
      timestampField: "source_timestamp",
      fields: {
        importKey: "import_key",
        name: "name",
        category: "category",
        slug: "slug",
        city: "city",
        region: "region",
        websiteUrl: "website_url",
      },
    } satisfies AutomationSourceConfig,
  },
} as const;


export type AutomationDiscoveryRootPreset = {
  rootKey: string;
  label: string;
  discoveryType: "SEARCH_PROVIDER";
  entityType: AutomationEntityType;
  suggestedConnectorType: "CONTROLLED_HTML";
  cadenceMinutes: number;
  config: Record<string, unknown>;
};

/**
 * Code-level discovery templates for roots that are intentionally not activated
 * or written to production by this implementation PR. They can be provisioned
 * through the existing controlled discovery-root administration flow.
 */
export const universalAutomationDiscoveryRootPresets: readonly AutomationDiscoveryRootPreset[] = [
  {
    rootKey: "tavily-sk-dog-breeders",
    label: "Tavily — slovenské chovateľské stanice psov",
    discoveryType: "SEARCH_PROVIDER",
    entityType: "DIRECTORY",
    suggestedConnectorType: "CONTROLLED_HTML",
    cadenceMinutes: defaultAutomationCadenceMinutes.DIRECTORY,
    config: {
      provider: "tavily",
      directoryCategory: "chovatelske-stanice",
      queries: [
        "chovateľská stanica psov Slovensko oficiálna stránka",
        "FCI chovateľská stanica Slovensko oficiálny web",
        "chovná stanica psov Slovensko oficiálna stránka",
      ],
      country: "SK",
      locale: "sk-SK",
      maxResults: 5,
      maxCandidates: 15,
    },
  },
  {
    rootKey: "tavily-sk-dog-walking",
    label: "Tavily — slovenské venčenie psov",
    discoveryType: "SEARCH_PROVIDER",
    entityType: "DIRECTORY",
    suggestedConnectorType: "CONTROLLED_HTML",
    cadenceMinutes: defaultAutomationCadenceMinutes.DIRECTORY,
    config: {
      provider: "tavily",
      directoryCategory: "vencenie",
      queries: [
        "venčenie psov Slovensko služba oficiálna stránka",
        "dog walking Slovensko oficiálny web",
        "venčiteľ psov Slovensko oficiálna stránka",
      ],
      country: "SK",
      locale: "sk-SK",
      maxResults: 5,
      maxCandidates: 15,
    },
  },
  {
    rootKey: "tavily-sk-dog-other-services",
    label: "Tavily — ďalšie služby pre psov",
    discoveryType: "SEARCH_PROVIDER",
    entityType: "DIRECTORY",
    suggestedConnectorType: "CONTROLLED_HTML",
    cadenceMinutes: defaultAutomationCadenceMinutes.DIRECTORY,
    config: {
      provider: "tavily",
      directoryCategory: "dalsie-sluzby",
      queries: [
        "služby pre psov Slovensko oficiálna stránka",
        "starostlivosť o psy služba Slovensko oficiálny web",
        "služba pre majiteľov psov Slovensko oficiálna stránka",
      ],
      country: "SK",
      locale: "sk-SK",
      maxResults: 5,
      maxCandidates: 15,
    },
  },
  {
    rootKey: "tavily-sk-dog-fundraising",
    label: "Tavily — slovenské zbierky a výzvy pre psy",
    discoveryType: "SEARCH_PROVIDER",
    entityType: "HELP_ITEM",
    suggestedConnectorType: "CONTROLLED_HTML",
    cadenceMinutes: defaultAutomationCadenceMinutes.HELP_ITEM,
    config: {
      provider: "tavily",
      helpCategory: "zbierky",
      queries: [
        "zbierka pomoc psom útulok Slovensko oficiálna stránka",
        "výzva na pomoc psovi Slovensko organizácia oficiálny web",
        "transparentná zbierka psy Slovensko útulok",
      ],
      country: "SK",
      locale: "sk-SK",
      maxResults: 5,
      maxCandidates: 15,
    },
  },
  {
    rootKey: "tavily-sk-dog-volunteering",
    label: "Tavily — dobrovoľníctvo a ako pomôcť psom",
    discoveryType: "SEARCH_PROVIDER",
    entityType: "HELP_ITEM",
    suggestedConnectorType: "CONTROLLED_HTML",
    cadenceMinutes: defaultAutomationCadenceMinutes.HELP_ITEM,
    config: {
      provider: "tavily",
      helpCategory: "dobrovolnictvo",
      queries: [
        "dobrovoľníctvo útulok psy Slovensko oficiálna stránka",
        "ako pomôcť útulku psy Slovensko dobrovoľník",
        "venčenie prevoz materiálna pomoc útulok Slovensko",
      ],
      country: "SK",
      locale: "sk-SK",
      maxResults: 5,
      maxCandidates: 15,
    },
  },
] as const;
