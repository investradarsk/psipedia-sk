import assert from "node:assert/strict";
import test from "node:test";
import { auditConfigurationContract } from "../scripts/check-config-contract.mjs";
import {
  ConfigurationError,
  validateRuntimeEnvironment,
} from "../config/runtime-env.ts";

const productionAuth = {
  AUTH_MODE: "cloudflare-access",
  ACCESS_TEAM_DOMAIN: "https://example.cloudflareaccess.com",
  ACCESS_AUD: "test-audience",
};

const testPiiCrypto = {
  PII_ENCRYPTION_KEY: "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY",
  PII_HASH_KEY: "ZmVkY2JhOTg3NjU0MzIxMGZlZGNiYTk4NzY1NDMyMTA",
};

const validProduction = {
  ...productionAuth,
  ...testPiiCrypto,
};

test("required production auth config missing fails fast", () => {
  assert.throws(
    () => validateRuntimeEnvironment(
      {
        AUTH_MODE: "cloudflare-access",
        ACCESS_TEAM_DOMAIN: validProduction.ACCESS_TEAM_DOMAIN,
        ...testPiiCrypto,
      },
      { profile: "production" },
    ),
    (error) => error instanceof ConfigurationError && error.missing.includes("ACCESS_AUD"),
  );
});

test("production without PII_ENCRYPTION_KEY is rejected even when public submissions are disabled", () => {
  assert.throws(
    () => validateRuntimeEnvironment(
      {
        ...productionAuth,
        PII_HASH_KEY: testPiiCrypto.PII_HASH_KEY,
      },
      { profile: "production" },
    ),
    (error) => error instanceof ConfigurationError
      && error.missing.includes("PII_ENCRYPTION_KEY")
      && !error.missing.includes("PII_HASH_KEY"),
  );
});

test("production without PII_HASH_KEY is rejected even when public submissions are disabled", () => {
  assert.throws(
    () => validateRuntimeEnvironment(
      {
        ...productionAuth,
        PII_ENCRYPTION_KEY: testPiiCrypto.PII_ENCRYPTION_KEY,
      },
      { profile: "production" },
    ),
    (error) => error instanceof ConfigurationError
      && error.missing.includes("PII_HASH_KEY")
      && !error.missing.includes("PII_ENCRYPTION_KEY"),
  );
});

test("production with both LOST/FOUND PII keys is accepted", () => {
  const result = validateRuntimeEnvironment(validProduction, { profile: "production" });
  assert.equal(result.profile, "production");
  assert.equal(result.publicSubmissionEnabled, false);
});

test("enabled public submissions require their security secrets", () => {
  assert.throws(
    () => validateRuntimeEnvironment(
      { LOST_FOUND_SUBMISSIONS_ENABLED: "true" },
      { profile: "runtime" },
    ),
    (error) => error instanceof ConfigurationError
      && error.missing.includes("TURNSTILE_SECRET_KEY")
      && error.missing.includes("PII_ENCRYPTION_KEY")
      && error.missing.includes("PII_HASH_KEY"),
  );
});

test("enabled Notion article sync requires token and exact data source", () => {
  assert.throws(
    () => validateRuntimeEnvironment(
      { NOTION_ARTICLE_SYNC_ENABLED: "true" },
      { profile: "runtime" },
    ),
    (error) => error instanceof ConfigurationError
      && error.missing.includes("NOTION_API_TOKEN")
      && error.missing.includes("NOTION_ARTICLES_DATA_SOURCE_ID"),
  );

  const result = validateRuntimeEnvironment(
    {
      NOTION_ARTICLE_SYNC_ENABLED: "true",
      NOTION_API_TOKEN: "secret-test-token",
      NOTION_ARTICLES_DATA_SOURCE_ID: "ae042534-c878-427e-bc76-ef587a8c61cf",
    },
    { profile: "runtime" },
  );
  assert.equal(result.notionArticleSyncEnabled, true);
});

test("enabled Notion breed sync requires token and exact breed data source", () => {
  assert.throws(
    () => validateRuntimeEnvironment(
      { NOTION_BREED_SYNC_ENABLED: "true" },
      { profile: "runtime" },
    ),
    (error) => error instanceof ConfigurationError
      && error.missing.includes("NOTION_API_TOKEN")
      && error.missing.includes("NOTION_BREEDS_DATA_SOURCE_ID"),
  );

  const result = validateRuntimeEnvironment(
    {
      NOTION_BREED_SYNC_ENABLED: "true",
      NOTION_API_TOKEN: "secret-test-token",
      NOTION_BREEDS_DATA_SOURCE_ID: "2054d277-2e1b-45b5-aeb6-b1a5dcdf2db2",
    },
    { profile: "runtime" },
  );
  assert.equal(result.notionBreedSyncEnabled, true);
});

test("enabled Notion event sync requires token and exact event data source", () => {
  assert.throws(
    () => validateRuntimeEnvironment(
      { NOTION_EVENT_SYNC_ENABLED: "true" },
      { profile: "runtime" },
    ),
    (error) => error instanceof ConfigurationError
      && error.missing.includes("NOTION_API_TOKEN")
      && error.missing.includes("NOTION_EVENTS_DATA_SOURCE_ID"),
  );

  const result = validateRuntimeEnvironment(
    {
      NOTION_EVENT_SYNC_ENABLED: "true",
      NOTION_API_TOKEN: "secret-test-token",
      NOTION_EVENTS_DATA_SOURCE_ID: "76d9ccde-5816-422c-bcfe-863ab69db080",
    },
    { profile: "runtime" },
  );
  assert.equal(result.notionEventSyncEnabled, true);
});

test("CI-only local auth path accepts isolated test PII crypto material", () => {
  const result = validateRuntimeEnvironment(
    {
      AUTH_MODE: "local-e2e-preview",
      PSIPEDIA_E2E_LOCAL_BOOTSTRAP: "1",
      ...testPiiCrypto,
    },
    { profile: "ci" },
  );
  assert.equal(result.profile, "ci");
  assert.equal(result.publicSubmissionEnabled, false);
});

test("repository configuration contract is production-safe and secret-free", async () => {
  const result = await auditConfigurationContract();
  assert.equal(result.siteUrl, "https://psipedia.sk");
  assert.match(result.cloudflareAccountId, /^[a-f0-9]{32}$/);\n  assert.equal(result.d1Binding, "DB");
  assert.equal(result.r2Binding, "BUCKET");
  assert.ok(result.secretEnvNames.includes("PII_ENCRYPTION_KEY"));
  assert.ok(result.secretEnvNames.includes("PII_HASH_KEY"));
  assert.ok(result.secretEnvNames.includes("NOTION_API_TOKEN"));
});

test("local Cloudflare tooling target is explicit and tied to the resolved toolchain", async () => {
  const result = await auditConfigurationContract();
  assert.equal(result.compatibilityDate, "2026-08-23");
  assert.equal(result.localCompatibilityDate, "2026-05-22");
  assert.deepEqual(result.localCloudflareToolchain, {
    vitePlugin: "1.37.1",
    wrangler: "4.92.0",
    miniflare: "4.20260515.0",
    workerd: "1.20260515.1",
  });
});
