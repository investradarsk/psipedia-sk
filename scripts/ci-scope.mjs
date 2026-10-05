import { appendFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

export const CI_SCOPE_VERSION = 3;

const RULES = {
  ADMIN: [
    /^app\/admin\//,
    /^app\/api\/admin\//,
    /^components\/admin-/,
    /^lib\/admin-/,
  ],
  MAPS: [
    /^app\/mapa\//,
    /^app\/admin\/mapy\//,
    /^app\/api\/map\//,
    /^app\/api\/admin\/geo\//,
    /^components\/map\//,
    /^components\/admin-(?:geo|google-place|profile-google-maps)/,
    /^lib\/(?:geo|map-|public-map-runtime|google-place|organization-google-maps)/,
    /^scripts\/map-/,
    /^tests\/(?:map|geo|google-place|profile-google-unified|public-location-map)/,
    /^drizzle\/(?:0064|0074|0077|0090)_/,
    /^\.github\/workflows\/map-/,
  ],
  ORGANIZATION_PROFILES: [
    /^app\/organizacie\//,
    /^app\/admin\/organizacie\//,
    /^app\/api\/admin\/organizations\//,
    /^components\/(?:organization-profile|admin-organization)/,
    /^lib\/(?:help-organization|organization-)/,
    /^tests\/(?:organization-|help-organization)/,
    /^drizzle\/(?:0034|0036|0038|0039|0040|0041|0042)_/,
  ],
  DIRECTORY_SERVICES: [
    /^app\/adresar\//,
    /^app\/admin\/adresar\//,
    /^app\/api\/admin\/directory\//,
    /^components\/directory-/,
    /^lib\/directory-/,
    /^tests\/directory-/,
    /^tests\/e2e\/(?:admin-directory-filters|services-detail-shell|services-search-layout)\.spec\.ts$/,
    /^tests\/fixtures\/directory-admin-e2e\.sql$/,
    /^drizzle\/(?:0019|0031|0074|0077|0098)_/,
  ],
  EVENTS: [
    /^app\/podujatia\//,
    /^app\/admin\/podujatia\//,
    /^app\/admin\/events\//,
    /^app\/api\/admin\/events\//,
    /^components\/(?:events-|event-)/,
    /^lib\/(?:event|notion-event)/,
    /^tests\/(?:event|admin-events|notion-event)/,
  ],
  HELP: [
    /^app\/pomoc-psom\//,
    /^components\/(?:help-|adoption-|lost-found)/,
    /^lib\/(?:help-|adoption|lost-found)/,
    /^tests\/(?:help-|adoption|lost-found)/,
  ],
  ARTICLES: [
    /^app\/clanky\//,
    /^app\/admin\/clanky\//,
    /^app\/api\/admin\/articles\//,
    /^components\/(?:article-|editorial-)/,
    /^lib\/(?:article-|editorial-)/,
    /^tests\/(?:article-|editorial-)/,
  ],
  BREEDS: [
    /^app\/plemena\//,
    /^app\/admin\/plemena\//,
    /^app\/api\/admin\/breeds\//,
    /^components\/admin-breed-/,
    /^lib\/(?:breed-|admin-breeds)/,
    /^tests\/(?:breed-|breeds-)/,
  ],
  SEARCH: [
    /^app\/hladat\//,
    /^lib\/portal-search/,
    /^tests\/portal-search/,
    /^tests\/e2e\/search\.spec\.ts$/,
  ],
  REVIEWS: [
    /^app\/recenz/,
    /^app\/admin\/recenzie/,
    /^app\/api\/review-author\//,
    /^app\/api\/admin\/profile-reviews\//,
    /^components\/(?:profile-review|review-author)/,
    /^lib\/(?:profile-review|review-author)/,
    /^tests\/(?:profile-review|review-author|reviews-)/,
    /^drizzle\/0062_/,
  ],
  PARTNER: [
    /^app\/partner\//,
    /^app\/api\/partner\//,
    /^app\/admin\/partners\//,
    /^app\/api\/admin\/partners\//,
    /^components\/(?:partner-|admin-partner-)/,
    /^lib\/partner-/,
    /^tests\/partner-/,
    /^drizzle\/(?:0059|0060|0061|0063|0065|0066|0067|0068|0069|0070|0072)_/,
  ],
  NOTION: [
    /(^|\/)notion-/,
    /^app\/api\/admin\/notion/,
    /^tests\/notion-/,
    /^drizzle\/(?:0044|0045|0047|0098|0102|0108)_/,
  ],
  AUTOMATION: [
    /(^|\/)automation-/,
    /(^|\/)data-automation/,
    /^app\/admin\/automatizacie\//,
    /^app\/api\/admin\/automation/,
    /^tests\/(?:automation-|data-automation)/,
    /^drizzle\/(?:0050|0052|0055|0056|0057|0073|0075|0076|0078|0079|0080|0081|0082|0083|0084|0085|0086|0087|0088|0089|0091|0092|0093|0094|0095|0096|0097)_/,
  ],
  PWA: [
    /^app\/manifest\.ts$/,
    /^public\/(?:sw\.js|pwa\/)/,
    /^components\/admin-pwa/,
    /^lib\/admin-(?:push|web-push)/,
    /^tests\/admin-pwa/,
    /^drizzle\/0054_/,
  ],
  SUBMISSIONS: [
    /submission/,
    /^app\/api\/admin\/moderation\//,
    /^lib\/(?:moderation-|private-media|resource-access|turnstile|rate-limit|pii-crypto)/,
    /^tests\/submission-/,
    /^drizzle\/0029_/,
  ],
  DATABASE_MIGRATIONS: [
    /^drizzle\//,
    /^db\//,
    /^scripts\/(?:check-migration-safety|validate-clean-d1|production-d1-migrate)\.mjs$/,
    /^tests\/(?:migration-safety|production-d1-)/,
    /^migration-safety\.baseline\.json$/,
    /^\.github\/workflows\/(?:clean-d1-migration-validation|production-d1-migrate)\.yml$/,
  ],
  VISUAL: [
    /^components\/public-visual-system\//,
    /^components\/admin-section-visuals/,
    /^lib\/section-(?:visual|store)/,
    /^tests\/(?:unified-section-hero|section-hero-v2)/,
    /^tests\/e2e\/unified-section-hero\.spec\.ts$/,
    /^\.github\/workflows\/(?:unified-section-hero-ci|section-hero-v2-ci)\.yml$/,
  ],
};

const DOC_RE = /^(?:README(?:\.[^/]+)?|docs\/|\.github\/(?:ISSUE_TEMPLATE|PULL_REQUEST_TEMPLATE)\/)|\.(?:md|mdx|txt)$/i;

function normalizeFiles(files) {
  return [...new Set(files.map((file) => file.trim().replaceAll("\\", "/")).filter(Boolean))].sort();
}

function isDocsOnlyFile(file) {
  return DOC_RE.test(file) || /\.(?:md|mdx|txt)$/i.test(file);
}

export function classifyChangedFiles(inputFiles) {
  const files = normalizeFiles(inputFiles);
  const docsOnly = files.length > 0 && files.every(isDocsOnlyFile);
  const dependency = files.some((file) =>
    file === "package-lock.json" ||
    file === ".nvmrc" ||
    file === ".node-version" ||
    file.startsWith(".github/actions/"),
  );

  const scopes = [];
  for (const [scope, patterns] of Object.entries(RULES)) {
    if (files.some((file) => patterns.some((pattern) => pattern.test(file)))) scopes.push(scope);
  }

  const workflowOnly = files.length > 0 && files.every((file) => file.startsWith(".github/workflows/"));
  const core = files.length === 0 ? true : !docsOnly;

  return {
    version: CI_SCOPE_VERSION,
    files,
    core,
    docsOnly,
    dependency,
    workflowOnly,
    scopes,
    packageMetadataOnly: files.length > 0 && files.every((file) => file === "package.json"),
  };
}

export function changedFilesFromGit({ baseSha = process.env.CI_SCOPE_BASE_SHA, headSha = process.env.CI_SCOPE_HEAD_SHA } = {}) {
  if (!baseSha || !headSha) return [];
  const output = execFileSync("git", ["diff", "--name-only", baseSha, headSha], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
  return normalizeFiles(output.split(/\r?\n/));
}

function writeGithubOutput(result, files) {
  const output = process.env.GITHUB_OUTPUT;
  if (!output) throw new Error("GITHUB_OUTPUT is required with --github-output");

  const workflowChanged = files.includes(".github/workflows/playwright-e2e.yml");
  const adminEvents = workflowChanged || files.some((file) =>
    /^(app\/admin\/events\/|app\/api\/admin\/events\/|components\/admin-events|lib\/admin-events|scripts\/bootstrap-admin-events-e2e\.mjs$|scripts\/check-admin-events-local\.mjs$|tests\/e2e\/admin-events\.spec\.ts$|tests\/admin-events)/.test(file),
  );
  const search = workflowChanged || result.scopes.includes("SEARCH");
  const directory = workflowChanged || result.scopes.includes("DIRECTORY_SERVICES");

  appendFileSync(output, [
    `core=${result.core}`,
    `dependency=${result.dependency}`,
    `admin_events=${adminEvents}`,
    `search=${search}`,
    `directory=${directory}`,
    `scopes=${result.scopes.join(",")}`,
    `docs_only=${result.docsOnly}`,
    "",
  ].join("\n"));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const githubOutput = args.includes("--github-output");
  const filesIndex = args.indexOf("--files");
  const files = filesIndex >= 0 ? args.slice(filesIndex + 1) : changedFilesFromGit();
  const result = classifyChangedFiles(files);

  if (githubOutput) writeGithubOutput(result, result.files);
  else process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}
