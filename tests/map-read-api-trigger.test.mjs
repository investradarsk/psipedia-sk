import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Static matcher for MAP-1C's literal escapes, * and **; actual GitHub filters
// are evaluated by GitHub. This matrix catches omissions and accidental scope creep.
const workflow = readFileSync(new URL('../.github/workflows/map-read-api-ci.yml', import.meta.url), 'utf8');
const pr = workflow.match(/^  pull_request:\s*\n(?<body>(?:^    .*\n|^      .*\n)*)/m)?.groups?.body;
assert.ok(pr, 'The MAP-1C pull_request event must exist');
assert.match(pr, /^    branches: \[main\]$/m);
const paths = [...pr.matchAll(/^      - ['"]([^'"]+)['"]\s*$/gm)].map((match) => match[1]);
assert.ok(paths.length >= 15, 'Explicit dependency paths are required');
assert.equal(new Set(paths).size, paths.length, 'Do not duplicate path filters');

function escapeRegex(char) {
  return '\\^$.*+?()[]{}|'.includes(char) ? '\\' + char : char;
}
function pathRegex(glob) {
  let expression = '^';
  for (let i = 0; i < glob.length; i++) {
    const char = glob[i];
    if (char === '\\' && i + 1 < glob.length) {
      expression += escapeRegex(glob[++i]);
    } else if (char === '*') {
      expression += glob[i + 1] === '*' ? (i++, '.*') : '[^/]*';
    } else if (char === '?') {
      expression += '[^/]';
    } else {
      expression += escapeRegex(char);
    }
  }
  return new RegExp(expression + '$');
}
const filters = paths.map(pathRegex);
const matches = (file) => filters.some((re) => re.test(file));

const shouldTrigger = [
  'app/api/map/route.ts',
  'app/mapa/page.tsx',
  'app/adresar/[category]/[slug]/page.tsx',
  'app/organizacie/[slug]/page.tsx',
  'app/[section]/[slug]/page.tsx',
  'components/map/public-location-map.tsx',
  'components/map/google-map-renderer.tsx',
  'components/directory-profile-detail.tsx', // #795 vet map integration
  'components/directory-profile-detail.module.css',
  'components/organization-profile-detail.tsx',
  'components/event-detail.tsx',
  'components/directory-page.tsx', // map CTA builds filter URL
  'components/directory-filter-form.tsx',
  'components/public-profile/public-profile-hero.tsx',
  'lib/map-query.ts',
  'lib/map-contract.ts',
  'lib/map-public-ui.ts',
  'lib/public-map-runtime.ts',
  'lib/google-maps-consent.ts',
  'lib/geo.ts',
  'lib/geo-store.ts',
  'lib/geo-service.ts',
  'lib/geo-provider.ts',
  'lib/geoapify-geocoder.ts',
  'lib/directory-service-address.ts',
  'lib/directory-address-save.ts',
  'lib/directory-exact-geo-auto.ts',
  'lib/admin-address-contract.ts',
  'lib/directory-store.ts',
  'lib/directory-detail-presentation.ts',
  'lib/directory-query.ts',
  'lib/events.ts',
  'lib/event-store.ts',
  'lib/help-organization-store.ts',
  'lib/organization-location-admin-write.ts',
  'lib/organization-profile-presentation.ts',
  'lib/rate-limit.ts',
  'config/runtime-env.ts',
  'worker/index.ts',
  'db/geo-schema.ts',
  'db/help-organization-schema.ts',
  'db/schema.ts',
  'drizzle/0064_geo_foundation.sql',
  'drizzle/0123_event_organization_structured_address.sql',
  'drizzle/0125_new_unnamed_schema_change.sql', // fail closed for new D1 migrations
  'tests/map-read-api.test.mjs',
  'tests/map-read-api-trigger.test.mjs',
  'tests/public-location-map-contract.test.mjs',
  'tests/geo-foundation.test.mjs',
  'tests/e2e/map-read-api.spec.ts',
  'tests/e2e/public-detail-maps.spec.ts',
  'tests/fixtures/map-read-api-e2e.sql',
  '.github/workflows/map-read-api-ci.yml',
];
const shouldSkip = [
  'app/adresar/page.tsx',
  'app/adresar/[category]/page.tsx', // listing route, not embedded map
  'app/adresar/[category]/kraj/[locationSlug]/page.tsx',
  'components/directory-results.tsx',
  'components/directory-card.tsx',
  'components/directory-public.module.css', // listing-only styling from #786
  'components/directory-category-overview.tsx',
  'tests/directory-unified-layout.test.mjs',
  'tests/e2e/directory-unified-layout.spec.ts',
  'app/organizacie/page.tsx', // hub visual
  'app/[section]/page.tsx', // portal/event listing shell
  'components/article-detail.tsx',
  'lib/article-store.ts',
  'docs/audits/PSIPEDIA-SERVICES-V2-PHASE-4-DRY-RUN.md',
  '.github/workflows/auto-update-automerge-prs.yml',
];

test('MAP-1C dependency matrix covers API, detail maps, GEO, privacy and D1', () => {
  for (const file of shouldTrigger) assert.ok(matches(file), 'Expected MAP-1C for ' + file);
});
test('MAP-1C skips listing-only visual and unrelated edits', () => {
  for (const file of shouldSkip) assert.ok(!matches(file), 'Unexpected MAP-1C for ' + file);
});
test('MAP-1C excludes former overly broad route patterns', () => {
  for (const bad of ['app/adresar/**', 'app/organizacie/**', 'app/[section]/**', 'app/\\[section\\]/**']) {
    assert.ok(!paths.includes(bad), 'Over-broad trigger: ' + bad);
  }
});
test('MAP-1C preserves manual run and all required security and E2E stages', () => {
  for (const required of [
    '  workflow_dispatch:',
    'npm run test:migration-safety',
    'npm run test:map-read-api',
    'npm run test:geo-foundation',
    'npm run db:validate-clean',
    'npx playwright test tests/e2e/map-read-api.spec.ts',
    'npx playwright test tests/e2e/public-detail-maps.spec.ts',
    'PUBLIC-MAPS-1 route-scoped CSP smoke',
  ]) assert.ok(workflow.includes(required), 'Lost important step: ' + required);
});
