import type { AutomationEntityType, AutomationSourceConfig } from "./data-automation";

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
