export const SECRET_ENV_NAMES = [
  "RESEND_API_KEY",
  "TURNSTILE_SECRET_KEY",
  "PII_ENCRYPTION_KEY",
  "PII_HASH_KEY",
  "NOTION_API_TOKEN",
  "GEOAPIFY_API_KEY",
] as const;

export const OPTIONAL_ENV_NAMES = [
  "ADMIN_EMAILS",
  "EDITORIAL_FROM_EMAIL",
  "LOST_FOUND_SUBMISSIONS_ENABLED",
  "ADOPTION_SUBMISSIONS_ENABLED",
  "ORGANIZATION_SUBMISSIONS_ENABLED",
  "PROFILE_REVIEW_SUBMISSIONS_ENABLED",
  "NOTION_ARTICLE_SYNC_ENABLED",
  "NOTION_ARTICLES_DATA_SOURCE_ID",
  "NOTION_BREED_SYNC_ENABLED",
  "NOTION_BREEDS_DATA_SOURCE_ID",
  "NOTION_EVENT_SYNC_ENABLED",
  "NOTION_EVENTS_DATA_SOURCE_ID",
  "PROGRAMMATIC_ADS_ENABLED",
  "GOOGLE_ADSENSE_CLIENT_ID",
  "GOOGLE_MAPS_BROWSER_API_KEY",
  "GOOGLE_MAPS_MAP_ID",
  "PUBLIC_MAP_ENABLED",
] as const;

export const CI_ONLY_ENV_NAMES = [
  "E2E_BASE_URL",
  "PSIPEDIA_E2E_LOCAL_BOOTSTRAP",
  "PSIPEDIA_ADMIN_EVENTS_E2E",
  "MAP_UI_TEST_RENDERER",
] as const;

export const PRODUCTION_AUTH_ENV_NAMES = [
  "AUTH_MODE",
  "ACCESS_TEAM_DOMAIN",
  "ACCESS_AUD",
] as const;

export type RuntimeConfigProfile = "runtime" | "runtime-admin" | "production" | "ci";

type RuntimeConfig = Partial<Record<
  | (typeof SECRET_ENV_NAMES)[number]
  | (typeof OPTIONAL_ENV_NAMES)[number]
  | (typeof CI_ONLY_ENV_NAMES)[number]
  | (typeof PRODUCTION_AUTH_ENV_NAMES)[number],
  string
>>;

export class ConfigurationError extends Error {
  readonly missing: readonly string[];

  constructor(missing: string[]) {
    super(`Missing required Psipedia configuration: ${missing.join(", ")}`);
    this.name = "ConfigurationError";
    this.missing = Object.freeze([...missing]);
  }
}

function present(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function configFlagEnabled(value: unknown) {
  return typeof value === "string" && (value === "1" || value.toLowerCase() === "true");
}

export function googleMapsRendererConfigured(env: {
  GOOGLE_MAPS_BROWSER_API_KEY?: unknown;
  GOOGLE_MAPS_MAP_ID?: unknown;
}) {
  return present(env.GOOGLE_MAPS_BROWSER_API_KEY)
    && present(env.GOOGLE_MAPS_MAP_ID);
}

export function publicMapLaunchEnabled(env: {
  PUBLIC_MAP_ENABLED?: unknown;
  GOOGLE_MAPS_BROWSER_API_KEY?: unknown;
  GOOGLE_MAPS_MAP_ID?: unknown;
}) {
  return configFlagEnabled(env.PUBLIC_MAP_ENABLED)
    && googleMapsRendererConfigured(env);
}

export function validateRuntimeEnvironment(
  env: RuntimeConfig,
  options: { profile?: RuntimeConfigProfile } = {},
) {
  const profile = options.profile ?? "runtime";
  const missing: string[] = [];
  const requireValue = (name: keyof RuntimeConfig) => {
    if (!present(env[name])) missing.push(String(name));
  };

  const publicSubmissionEnabled =
    configFlagEnabled(env.LOST_FOUND_SUBMISSIONS_ENABLED)
    || configFlagEnabled(env.ADOPTION_SUBMISSIONS_ENABLED)
    || configFlagEnabled(env.ORGANIZATION_SUBMISSIONS_ENABLED)
    || configFlagEnabled(env.PROFILE_REVIEW_SUBMISSIONS_ENABLED);
  const notionArticleSyncEnabled = configFlagEnabled(env.NOTION_ARTICLE_SYNC_ENABLED);
  const notionBreedSyncEnabled = configFlagEnabled(env.NOTION_BREED_SYNC_ENABLED);
  const notionEventSyncEnabled = configFlagEnabled(env.NOTION_EVENT_SYNC_ENABLED);
  const publicMapRequested = configFlagEnabled(env.PUBLIC_MAP_ENABLED);

  // Public submission flags are opt-in. Once enabled, their security material
  // is critical and must fail closed instead of silently running unprotected.
  if (publicSubmissionEnabled) {
    requireValue("TURNSTILE_SECRET_KEY");
    requireValue("PII_ENCRYPTION_KEY");
    requireValue("PII_HASH_KEY");
  }

  // Notion sync is also opt-in. When enabled, both the secret token and the
  // exact data-source ID are required so the sweep cannot drift to another DB.
  if (notionArticleSyncEnabled || notionBreedSyncEnabled || notionEventSyncEnabled) {
    requireValue("NOTION_API_TOKEN");
  }
  if (notionArticleSyncEnabled) {
    requireValue("NOTION_ARTICLES_DATA_SOURCE_ID");
  }
  if (notionBreedSyncEnabled) {
    requireValue("NOTION_BREEDS_DATA_SOURCE_ID");
  }
  if (notionEventSyncEnabled) {
    requireValue("NOTION_EVENTS_DATA_SOURCE_ID");
  }

  if (publicMapRequested) {
    requireValue("GOOGLE_MAPS_BROWSER_API_KEY");
    requireValue("GOOGLE_MAPS_MAP_ID");
  }

  if (profile === "production") {
    if (env.AUTH_MODE !== "cloudflare-access") missing.push("AUTH_MODE=cloudflare-access");
    requireValue("ACCESS_TEAM_DOMAIN");
    requireValue("ACCESS_AUD");

    // LOST/FOUND admin always reads/writes private contact data, regardless of
    // whether public submission is enabled. Production therefore cannot be
    // considered valid without the crypto material required by requirePiiKeys().
    requireValue("PII_ENCRYPTION_KEY");
    requireValue("PII_HASH_KEY");
  } else if (profile === "runtime-admin" && env.AUTH_MODE === "cloudflare-access") {
    requireValue("ACCESS_TEAM_DOMAIN");
    requireValue("ACCESS_AUD");
  } else if (profile === "ci" && present(env.AUTH_MODE) && env.AUTH_MODE !== "local-e2e-preview") {
    missing.push("AUTH_MODE=local-e2e-preview");
  }

  if (missing.length) throw new ConfigurationError([...new Set(missing)]);

  return Object.freeze({
    profile,
    publicSubmissionEnabled,
    notionArticleSyncEnabled,
    notionBreedSyncEnabled,
    notionEventSyncEnabled,
    publicMapEnabled: publicMapLaunchEnabled(env),
  });
}
