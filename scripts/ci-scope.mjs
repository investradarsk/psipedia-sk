import { appendFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

export const CI_SCOPE_VERSION = 4;

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
    /^app\/admin\/novy\//,
    /^app\/api\/admin\/articles\//,
    /^components\/(?:article-|editorial-|admin-article-|admin-rich-text-editor)/,
    /^lib\/(?:article-|editorial-)/,
    /^tests\/(?:article-|editorial-|admin-article)/,
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
  GEMINI_AUTOMATION: [
    /^lib\/gemini-automation-.*\.ts$/,
    /^tests\/gemini-automation-.*\.test\.mjs$/,
    /^drizzle\/0113_gemini_automation_foundation\.sql$/,
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
  AI_DISCOVERY: [
    /^app\/sitemap\.ts$/,
    /^app\/plemena\/\[slug\]\/page\.tsx$/,
    /^app\/adresar\/(?:\[category\]\/(?:mesto|okres|kraj)\/\[locationSlug\]|chovatelske-stanice\/(?:kraj\/\[regionSlug\]|plemeno\/\[breedSlug\](?:\/kraj\/\[regionSlug\])?))\/page\.tsx$/,
    /^components\/(?:article-detail|directory-profile-detail|organization-profile-detail|event-detail|adoption-detail|lost-found-dog-detail|related-entity-list)(?:\.|\/)/,
    /^components\/help-details\//,
    /^lib\/(?:internal-discovery|slovak-location-landings|breeding-station-landings|breeding-station-sitemap|directory-location-landings|directory-location-sitemap|directory-profile-schema|directory-profile-metadata|directory-sitemap|article-discovery|entity-sitemap|sitemap-parity|sitemap-runtime|sitemap-seo|ai-referral)\.ts$/,
    /^scripts\/bootstrap-internal-discovery-e2e\.mjs$/,
    /^tests\/(?:internal-discovery|breeding-station-ai-landings|directory-ai-landings-scale|article-discovery|seo-structured-data-2|sitemap-seo|rendered-html|ai-referral)\.test\.mjs$/,
    /^tests\/e2e\/(?:internal-discovery|ai-discovery-hardening)\.spec\.ts$/,
    /^\.github\/workflows\/ai-internal-discovery-click-value-ci\.yml$/,
  ],
  ENTITY_SURFACES: [
    /^app\/sitemap\.ts$/,
    /^app\/\[section\]\/\[slug\]\/page\.tsx$/,
    /^app\/plemena\/\[slug\]\/page\.tsx$/,
    /^app\/pomoc-psom\/(?:adopcia\/\[slug\]|\[category\]\/\[slug\])\/page\.tsx$/,
    /^app\/adresar\/\[category\]\/\[slug\]\/page\.tsx$/,
    /^app\/organizacie\/\[slug\]\/page\.tsx$/,
    /^components\/(?:article-detail|event-detail|organization-profile-detail|adoption-detail|lost-found-dog-detail|directory-profile-detail|structured-data)(?:\.|\/)/,
    /^components\/help-details\//,
    /^components\/detail-primitives\//,
    /^lib\/(?:event-schema|organization-profile-presentation|organization-seo|adoption-detail|directory-detail-presentation|directory-profile-metadata|directory-profile-schema|article-seo|content-seo|seo|canonical-resource|sitemap-parity|sitemap-runtime|sitemap-seo|entity-sitemap|organization-sitemap|adoption-sitemap)\.ts$/,
    /^tests\/(?:sitewide-ai-entity-surface|events-phase4|adoption-detail|organization-profile-presentation|organization-seo|seo-structured-data-2|directory-detail-presentation|sitemap-seo|rendered-html|social-metadata|social-metadata-rendered)\.test\.mjs$/,
    /^tests\/e2e\/(?:event-detail-phase4|adoption|breed-profile|lost-found-dogs|help-detail-primitives)\.spec\.ts$/,
    /^\.github\/workflows\/sitewide-ai-entity-surface-ci\.yml$/,
  ],
  SHARED_CORE: [
    /^app\/(?:layout\.tsx|globals\.css)$/,
    /^worker\/index\.ts$/,
    /^db\/index\.ts$/,
    /^config\/(?:runtime-env|public-site)\.ts$/,
    /^(?:vite\.config\.ts|playwright\.config\.ts|tsconfig\.json|eslint\.config\.mjs|wrangler\.jsonc)$/,
    /^scripts\/(?:build-verified\.sh|check-config-contract\.mjs|validate-artifact\.sh|validate-deploy-artifact\.mjs|sites-env\.sh)$/,
  ],
};

const DOC_RE = /^(?:README(?:\.[^/]+)?|docs\/|\.github\/(?:ISSUE_TEMPLATE|PULL_REQUEST_TEMPLATE)\/)|\.(?:md|mdx|txt)$/i;

function normalizeFiles(files) {
  return [...new Set(files.map((file) => file.trim().replaceAll("\\", "/")).filter(Boolean))].sort();
}

function isDocsOnlyFile(file) {
  return DOC_RE.test(file) || /\.(?:md|mdx|txt)$/i.test(file);
}

const CI_CONTROL_RE = /^(?:\.github\/workflows\/|scripts\/(?:ci-scope|check-ci-scope)\.mjs$)/;

const AUTOMATION_BROAD_RE = /^(?:lib\/(?:data-automation(?:\.ts|-apply\.ts|-canonical-apply\.ts|-store\.ts|-runner\.ts|-governance\.ts|-identity\.ts|-dynamic-identity\.ts|-matching\.ts|-clustering\.ts|-capability-registry\.ts|-draft-mapper\.ts|-enrichment-normalize\.ts|-enrichment-template\.ts|-http-policy\.ts|-source-store\.ts|-source-provisioning\.ts|-source-scoped-extraction\.ts|-generic-source-extractor\.ts|-ingestion-receipts\.ts|-lifecycle(?:-apply|-store)?\.ts)|automation-record-suppressions\.ts|canonical-draft-delete\.ts)|drizzle\/(?:0050|0052|0055|0056|0057|0073|0075|0076|0078|0079|0080|0081|0082|0083|0084|0085|0086|0087|0088|0089|0091|0092|0093|0094|0095|0096|0097)_|tests\/fixtures\/data-automation\/|\.github\/workflows\/data-automation-(?:ci|v2-ci)\.yml$)/;

const AUTOMATION_ADMIN_E2E_RE = /^(?:app\/admin\/(?:operations\/automation|automatizacie)\/|app\/api\/admin\/(?:automation-sources|automation-source-candidates|automation-lifecycle|canonical-drafts)\/|components\/admin-automation-(?:source|lifecycle)-|components\/admin-canonical-draft-delete\.tsx$|lib\/(?:admin-automation-api|data-automation-(?:source-admin|source-activation|source-matching|source-presets|update-review|address-review(?:-store)?|cluster-admin|match-review))\.ts$|tests\/e2e\/(?:data-automation-v2|canonical-draft-delete)\.spec\.ts$|tests\/fixtures\/canonical-draft-delete-e2e\.sql$)/;

function isCiControlFile(file) {
  return CI_CONTROL_RE.test(file);
}

export function classifyChangedFiles(inputFiles) {
  const files = normalizeFiles(inputFiles);
  const docsOnly = files.length > 0 && files.every(isDocsOnlyFile);
  const dependency = files.some((file) =>
    file === "package.json" ||
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
  const ciControl = files.some(isCiControlFile);
  const ciControlOnly = files.length > 0 && files.every((file) => isCiControlFile(file) || isDocsOnlyFile(file));
  const runtimeChanged = files.length === 0 || files.some((file) => !isDocsOnlyFile(file) && !isCiControlFile(file));
  const sharedCore = scopes.includes("SHARED_CORE");
  const migration = scopes.includes("DATABASE_MIGRATIONS");
  const fullCore = files.length === 0 || (!docsOnly && (dependency || sharedCore || migration));
  const boundedCore = runtimeChanged && !fullCore && !docsOnly;
  const core = runtimeChanged && !docsOnly;
  const automationBroad = scopes.includes("AUTOMATION") && files.some((file) => AUTOMATION_BROAD_RE.test(file));
  const automationAdminE2e = scopes.includes("AUTOMATION") && (
    automationBroad ||
    files.some((file) => AUTOMATION_ADMIN_E2E_RE.test(file))
  );

  return {
    version: CI_SCOPE_VERSION,
    files,
    core,
    fullCore,
    boundedCore,
    runtimeChanged,
    docsOnly,
    dependency,
    workflowOnly,
    ciControl,
    ciControlOnly,
    sharedCore,
    automationBroad,
    automationAdminE2e,
    scopes,
    validationMode: fullCore ? "full" : boundedCore ? "bounded" : ciControl ? "ci-control" : "fast",
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

export function focusedPrE2eFlags(result, files = result.files) {
  return {
    adminEvents: files.some((file) =>
      /^(app\/admin\/events\/|app\/api\/admin\/events\/|components\/admin-events|lib\/admin-events|scripts\/bootstrap-admin-events-e2e\.mjs$|scripts\/check-admin-events-local\.mjs$|tests\/e2e\/admin-events\.spec\.ts$|tests\/admin-events)/.test(file),
    ),
    search: result.scopes.includes("SEARCH"),
    directory: result.scopes.includes("DIRECTORY_SERVICES"),
  };
}

function writeGithubOutput(result, files) {
  const output = process.env.GITHUB_OUTPUT;
  if (!output) throw new Error("GITHUB_OUTPUT is required with --github-output");

  const { adminEvents, search, directory } = focusedPrE2eFlags(result, files);

  appendFileSync(output, [
    `core=${result.core}`,
    `full_core=${result.fullCore}`,
    `bounded_core=${result.boundedCore}`,
    `runtime_changed=${result.runtimeChanged}`,
    `dependency=${result.dependency}`,
    `ci_control=${result.ciControl}`,
    `automation_broad=${result.automationBroad}`,
    `automation_admin_e2e=${result.automationAdminE2e}`,
    `gemini_automation=${result.scopes.includes("GEMINI_AUTOMATION")}`,
    `ai_discovery=${result.scopes.includes("AI_DISCOVERY")}`,
    `entity_surfaces=${result.scopes.includes("ENTITY_SURFACES")}`,
    `admin_events=${adminEvents}`,
    `search=${search}`,
    `directory=${directory}`,
    `scopes=${result.scopes.join(",")}`,
    `docs_only=${result.docsOnly}`,
    `validation_mode=${result.validationMode}`,
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
