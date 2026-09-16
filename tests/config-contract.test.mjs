import assert from "node:assert/strict";
import test from "node:test";
import { auditConfigurationContract } from "../scripts/check-config-contract.mjs";
import {
  ConfigurationError,
  validateRuntimeEnvironment,
} from "../config/runtime-env.ts";

const validProduction = {
  AUTH_MODE: "cloudflare-access",
  ACCESS_TEAM_DOMAIN: "https://example.cloudflareaccess.com",
  ACCESS_AUD: "test-audience",
};

test("required production config missing fails fast", () => {
  assert.throws(
    () => validateRuntimeEnvironment({ AUTH_MODE: "cloudflare-access", ACCESS_TEAM_DOMAIN: validProduction.ACCESS_TEAM_DOMAIN }, { profile: "production" }),
    (error) => error instanceof ConfigurationError && error.missing.includes("ACCESS_AUD"),
  );
});

test("valid production config passes without optional feature secrets", () => {
  const result = validateRuntimeEnvironment(validProduction, { profile: "production" });
  assert.equal(result.profile, "production");
  assert.equal(result.publicSubmissionEnabled, false);
});

test("enabled public submissions require their security secrets", () => {
  assert.throws(
    () => validateRuntimeEnvironment({ ...validProduction, LOST_FOUND_SUBMISSIONS_ENABLED: "true" }, { profile: "production" }),
    (error) => error instanceof ConfigurationError
      && error.missing.includes("TURNSTILE_SECRET_KEY")
      && error.missing.includes("PII_ENCRYPTION_KEY")
      && error.missing.includes("PII_HASH_KEY"),
  );
});

test("CI-only local auth path passes without production Access config", () => {
  const result = validateRuntimeEnvironment({ AUTH_MODE: "local-e2e-preview", PSIPEDIA_E2E_LOCAL_BOOTSTRAP: "1" }, { profile: "ci" });
  assert.equal(result.profile, "ci");
  assert.equal(result.publicSubmissionEnabled, false);
});

test("repository configuration contract is production-safe and secret-free", async () => {
  const result = await auditConfigurationContract();
  assert.equal(result.siteUrl, "https://psipedia.sk");
  assert.equal(result.d1Binding, "DB");
  assert.equal(result.r2Binding, "BUCKET");
  assert.ok(result.secretEnvNames.includes("PII_ENCRYPTION_KEY"));
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
