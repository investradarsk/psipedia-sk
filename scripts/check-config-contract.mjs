import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SITE_URL } from "../config/public-site.ts";
import {
  CI_ONLY_ENV_NAMES,
  OPTIONAL_ENV_NAMES,
  PRODUCTION_AUTH_ENV_NAMES,
  SECRET_ENV_NAMES,
} from "../config/runtime-env.ts";

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseEnvFile(source) {
  const entries = new Map();
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    assert.ok(separator > 0, `.env.example contains an invalid line: ${rawLine}`);
    entries.set(line.slice(0, separator), line.slice(separator + 1));
  }
  return entries;
}

async function auditTrackedSecretAssignments(root) {
  const output = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" });
  const files = output.split("\0").filter(Boolean).filter((file) =>
    file.startsWith(".github/workflows/")
    || /^\.env/i.test(path.basename(file))
    || /^wrangler\.(jsonc?|toml)$/i.test(path.basename(file))
    || file.startsWith("config/"),
  );

  for (const file of files) {
    const source = await fs.readFile(path.join(root, file), "utf8");
    for (const secretName of SECRET_ENV_NAMES) {
      const shellAssignment = new RegExp(`^\\s*(?:export\\s+)?${secretName}=([^\\r\\n]*)$`, "m").exec(source)?.[1]?.trim();
      const yamlAssignment = new RegExp(`^\\s*${secretName}:\\s*([^#\\r\\n]+)$`, "m").exec(source)?.[1]?.trim();
      const jsonAssignment = new RegExp(`"${secretName}"\\s*:\\s*"([^"]+)"`).exec(source)?.[1]?.trim();
      const value = shellAssignment || yamlAssignment || jsonAssignment;
      if (!value) continue;

      const intentionalCiFixture = file.startsWith(".github/workflows/")
        && (secretName === "PII_ENCRYPTION_KEY" || secretName === "PII_HASH_KEY")
        && source.includes("Configure CI-only local PII keys");
      assert.equal(intentionalCiFixture, true, `${file} contains a tracked value for ${secretName}`);
    }
  }
}

export async function auditConfigurationContract(root = defaultRoot) {
  const read = (relativePath) => fs.readFile(path.join(root, relativePath), "utf8");
  const [wranglerText, resourcesText, hostingText, envExampleText, packageText, viteText, cleanD1Text, seoText] = await Promise.all([
    read("wrangler.jsonc"),
    read("config/cloudflare-resources.json"),
    read(".openai/hosting.json"),
    read(".env.example"),
    read("package.json"),
    read("vite.config.ts"),
    read("scripts/validate-clean-d1.mjs"),
    read("lib/seo.ts"),
  ]);

  const wrangler = JSON.parse(wranglerText);
  const resources = JSON.parse(resourcesText);
  const hosting = JSON.parse(hostingText);
  const envExample = parseEnvFile(envExampleText);

  assert.equal(typeof wrangler.compatibility_date, "string", "wrangler.jsonc must own compatibility_date");
  assert.ok(wrangler.compatibility_date, "wrangler.jsonc compatibility_date must not be empty");
  assert.equal(wrangler.d1_databases, undefined, "root wrangler.jsonc must not duplicate generated D1 bindings");
  assert.equal(wrangler.r2_buckets, undefined, "root wrangler.jsonc must not duplicate generated R2 bindings");

  const d1 = resources.d1;
  assert.equal(typeof d1?.binding, "string", "canonical resource config must own D1 binding");
  assert.ok(d1.database_name && d1.database_id, "canonical D1 config must include database_name and database_id");
  assert.equal(d1.migrations_dir, "./drizzle", "canonical D1 migrations_dir must be ./drizzle");
  assert.equal(hosting.d1, d1.binding, ".openai/hosting.json must mirror the canonical D1 binding");

  const r2 = resources.r2;
  assert.equal(typeof r2?.binding, "string", "canonical resource config must own R2 binding");
  assert.ok(r2.bucket_name, "canonical R2 config must include bucket_name");
  assert.equal(hosting.r2, r2.binding, ".openai/hosting.json must mirror the canonical R2 binding");

  assert.equal(wrangler.assets?.binding, "ASSETS", "wrangler.jsonc must own ASSETS binding");
  assert.equal(wrangler.images?.binding, "IMAGES", "wrangler.jsonc must own IMAGES binding");
  assert.equal(wrangler.version_metadata?.binding, "CF_VERSION_METADATA", "wrangler.jsonc must own version metadata binding");
  assert.equal(wrangler.vars?.AUTH_MODE, "cloudflare-access", "production AUTH_MODE must fail closed to cloudflare-access");
  assert.ok(wrangler.vars?.ACCESS_TEAM_DOMAIN, "production ACCESS_TEAM_DOMAIN must be declared in wrangler.jsonc");
  assert.ok(wrangler.vars?.ACCESS_AUD, "production ACCESS_AUD must be declared in wrangler.jsonc");

  for (const secretName of SECRET_ENV_NAMES) {
    assert.equal(secretName in (wrangler.vars ?? {}), false, `${secretName} must not be committed in wrangler vars`);
  }

  const documentedEnvNames = [
    ...SECRET_ENV_NAMES,
    ...OPTIONAL_ENV_NAMES,
    ...CI_ONLY_ENV_NAMES,
  ];
  for (const name of documentedEnvNames) {
    assert.ok(envExample.has(name), `.env.example must document ${name}`);
  }
  for (const name of SECRET_ENV_NAMES) {
    assert.equal(envExample.get(name), "", `.env.example must not contain a value for ${name}`);
  }

  for (const name of PRODUCTION_AUTH_ENV_NAMES) {
    assert.equal(envExample.has(name), false, `${name} is canonical wrangler config, not a local secret/example env`);
  }

  // E2E_BASE_URL is intentionally CI/test-specific: localhost jobs and the
  // read-only production smoke use different targets. It is not the site's
  // canonical URL source. The application/package production path uses SITE_URL.
  for (const [file, source] of [["package.json", packageText], ["lib/seo.ts", seoText]]) {
    assert.equal(source.includes(SITE_URL), false, `${file} must consume canonical SITE_URL instead of hard-coding it`);
  }

  assert.equal(viteText.includes(d1.database_id), false, "vite.config.ts must not duplicate the canonical D1 database_id");
  assert.equal(viteText.includes(d1.database_name), false, "vite.config.ts must not duplicate the canonical D1 database_name");
  assert.equal(viteText.includes(r2.bucket_name), false, "vite.config.ts must not duplicate the canonical R2 bucket_name");
  assert.ok(viteText.includes("cloudflare-resources.json"), "vite.config.ts must consume the canonical resource contract");
  assert.equal(cleanD1Text.includes(`compatibility_date: \"${wrangler.compatibility_date}\"`), false, "clean-D1 config must derive compatibility_date");
  assert.equal(cleanD1Text.includes(`binding: \"${d1.binding}\"`), false, "clean-D1 config must derive the D1 binding");

  await auditTrackedSecretAssignments(root);

  return Object.freeze({
    siteUrl: SITE_URL,
    compatibilityDate: wrangler.compatibility_date,
    d1Binding: d1.binding,
    r2Binding: r2.binding,
    secretEnvNames: [...SECRET_ENV_NAMES],
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await auditConfigurationContract();
  console.log(`[config] PASS — ${result.siteUrl}; D1=${result.d1Binding}; R2=${result.r2Binding}; compatibility=${result.compatibilityDate}`);
}
