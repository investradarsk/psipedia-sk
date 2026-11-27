import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Transitional developer entrypoints. These are not replacements for CI gates.
export const GROUPS = Object.freeze({
  "code-quality": [
    "test:ci:contract",
    "test:config",
    "lint",
    "test:component-registry"
  ],
  "build": [
    "build",
    "validate:deploy-artifact",
    "test:deploy-safety"
  ],
  "database": [
    "db:check-migrations",
    "db:validate-clean",
    "test:migration-safety",
    "test:record-lifecycle-core"
  ],
  "public": [
    "test:visual-library",
    "test:homepage-media",
    "test:article-ux",
    "test:directory-read",
    "test:section-visuals",
    "test:unified-section-hero",
    "test:section-hero-v2",
    "test:public-landing-alignment",
    "test:events-public-ux",
    "test:lost-found",
    "test:search",
    "test:public-integrity"
  ],
  "admin": [
    "test:admin-stability-step10",
    "test:admin-performance-v2-step1",
    "test:admin-performance-v2-steps2-9",
    "test:admin-performance-v2-tail",
    "test:admin-buttons",
    "test:admin-events",
    "test:article-admin-editor",
    "test:image-editor-2"
  ],
  "partner": [
    "test:partner-auth",
    "test:reviews-foundation",
    "test:reviews-public-read",
    "test:review-author-auth",
    "test:reviews-submission",
    "test:reviews-admin"
  ],
  "integrations": [
    "test:notion-events-help-sync",
    "test:notion-bulk-backfill",
    "test:notion-data-quality-audit",
    "test:breed-concurrency",
    "test:facebook-images",
    "test:facebook-publisher",
    "test:facebook-admin-v2",
    "test:facebook-images-ui",
    "test:notion-facebook-images",
    "test:automation-schedule",
    "test:automation-operations",
    "test:geo-foundation",
    "test:map-read-api",
    "test:map-public-ui"
  ],
  "seo-performance": [
    "test:perf-fastpaths",
    "test:public-css-scope",
    "test:seo-metadata",
    "test:sitewide-ai-entity-surface",
    "test:social-metadata",
    "test:social-metadata-rendered",
    "test:breed-crawl-hierarchy",
    "test:breeding-station-ai-landings",
    "test:directory-ai-landings-scale",
    "test:internal-discovery",
    "test:ai-referral"
  ]
});

export function planGroup(name, scripts) {
  if (!Object.hasOwn(GROUPS, name)) throw new Error("Unknown test group: " + name);
  const plan = GROUPS[name];
  for (const script of plan) {
    if (!Object.hasOwn(scripts, script) || typeof scripts[script] !== "string") {
      throw new Error("Missing package script: " + script);
    }
  }
  return [...plan];
}

// Skip only a complete, previously executed pure npm test suite. Keep each
// leaf's npm lifecycle identity and Node flags; never rewrite shell commands.
// Opaque scripts, lifecycle hooks and cyclic graphs are execution barriers.
export function planDistinctPackageSuites(names, scripts) {
  const seen = new Set();
  const run = [], skipped = [];
  const leaves = (name, stack = []) => {
    if (stack.includes(name) || typeof scripts[name] !== "string" ||
        Object.hasOwn(scripts, "pre" + name) || Object.hasOwn(scripts, "post" + name) ||
        !/^test(?::[\w:-]+)?$/.test(name)) return null;
    const out = [];
    for (const cmd of scripts[name].split(/\s*&&\s*/)) {
      const child = cmd.match(/^npm run (test(?::[\w:-]+)?)$/);
      if (child) {
        const nested = leaves(child[1], [...stack, name]);
        if (!nested) return null;
        out.push(...nested);
      } else if (/^node(?: --experimental-strip-types| --experimental-loader \.\/tests\/[\w.-]+\.mjs)* --test(?: tests\/[\w./-]+\.test\.[cm]?[jt]s)+$/.test(cmd)) {
        out.push(name + "|" + cmd);
      } else return null;
    }
    return out.length ? out : null;
  };
  for (const name of names) {
    if (typeof scripts[name] !== "string") throw new Error("Missing package script: " + name);
    const coverage = leaves(name);
    if (coverage && coverage.every(key => seen.has(key))) {
      skipped.push(name);
      continue;
    }
    run.push(name);
    if (!coverage) seen.clear();
    else for (const key of coverage) seen.add(key);
  }
  return { run, skipped };
}

export function runCli(args, { scripts, npmPath, run = spawnSync, print = console.log, error = console.error } = {}) {
  if (args.length === 0 || (args.length === 1 && args[0] === "--list")) {
    print("Usage: npm run test:ci -- <group> [--plan]");
    print(Object.keys(GROUPS).join("\n"));
    return 0;
  }
  if (args.length > 2 || (args.length === 2 && args[1] !== "--plan")) {
    error("Expected a group and optional --plan.");
    return 2;
  }
  let plan;
  try {
    plan = planGroup(args[0], scripts);
  } catch (err) {
    error(err.message);
    return 2;
  }
  if (args[1] === "--plan") {
    print(plan.map((name) => "npm run " + name).join("\n"));
    return 0;
  }
  if (!npmPath) {
    error("Run via npm run test:ci so npm_execpath is available.");
    return 2;
  }
  for (const name of plan) {
    print("==> npm run " + name);
    const result = run(process.execPath, [npmPath, "run", name], { stdio: "inherit" });
    if (result.error || result.signal || result.status !== 0) {
      if (result.error) error(result.error.message);
      return result.status ?? 1;
    }
  }
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { scripts } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  process.exitCode = runCli(process.argv.slice(2), { scripts, npmPath: process.env.npm_execpath });
}
