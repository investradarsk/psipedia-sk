import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = p => readFileSync(p,"utf8");

test("concrete public URL browser enumerates nine canonical public detail sources", () => {
  const service = read("lib/visual-library-dynamic-urls.ts");
  const types = read("lib/visual-library-dynamic-urls-contract.ts");
  for (const table of [
    "directory_profiles", "help_organizations", "adoption_dogs", "help_cases",
    "lost_found_dog_reports", "managed_events", "managed_breeds",
    "managed_articles", "managed_eshops",
  ]) assert.ok(service.includes(table), table);
  for (const category of ["directory","organizations","adoptions","help","lost-found","events","breeds","articles","eshops"])
    assert.ok(types.includes('id: "' + category + '"'), category);
  assert.match(service, /canonicalBreedIdsSql/);
  assert.match(service, /directoryProfileHref/);
  assert.match(service, /eventHref/);
  assert.match(service, /helpCaseHref/);
  assert.match(service, /dogReportHref/);
  assert.match(service, /articleHref/);
  assert.match(service, /isDirectoryCategory/);
  assert.match(service, /isHelpCategory/);
});
test("server-side pagination counts all published records, does not silently cap to N", () => {
  const service = read("lib/visual-library-dynamic-urls.ts");
  assert.match(service, /SELECT COUNT\(\*\) AS total/);
  assert.match(service, /LIMIT \? OFFSET \?/);
  assert.match(service, /counted\?\.total/);
  assert.match(service, /Math\.ceil\(total \/ DYNAMIC_URL_PAGE_SIZE\)/);
  assert.match(service, /Math\.min\(rawPage, Math\.max\(1,pages\)\)/);
  assert.match(service, /!Number\.isSafeInteger\(total\)/);
  assert.match(service, /if \(!href\) throw/);
  assert.doesNotMatch(service, /LIMIT 500|LIMIT 2000/);
});
test("public-only states exclude drafts and respect canonical breed winners", () => {
  const service=read("lib/visual-library-dynamic-urls.ts");
  assert.match(service, /p\.status='published'/);
  assert.match(service, /o\.status='PUBLISHED' AND o\.published_at IS NOT NULL AND o\.archived_at IS NULL/);
  assert.match(service, /d\.status IN \('ACTIVE','RESERVED'\)/);
  assert.match(service, /h\.status='published' AND h\.category NOT IN \('adopcia','utulky'\)/);
  assert.match(service, /r\.published_at IS NOT NULL AND r\.duplicate_of_id IS NULL/);
  assert.match(service, /r\.status IN \('ACTIVE','RESOLVED','EXPIRED','ARCHIVED'\)/);
  assert.match(service, /e\.status='published'/);
  assert.match(service, /b\.id IN \(\$\{canonicalBreedIdsSql\}\)/);
  assert.match(service, /a\.status='published' OR \(a\.status='scheduled' AND a\.published_at<=\?\)/);
  assert.match(service, /shop\.status='published' AND shop\.published_at IS NOT NULL/);
});
test("private authenticated API validates all controls and does not expose personal fields", () => {
  const api=read("app/api/admin/visual-library/urls/route.ts");
  const service=read("lib/visual-library-dynamic-urls.ts");
  assert.match(api, /getAdminApiUser\(\)/);
  assert.match(api, /unauthorizedAdminResponse\(\)/);
  assert.match(api, /isDynamicUrlKind\(kind\)/);
  assert.match(api, /"Cache-Control":"private, no-store"/);
  assert.match(api, /status:503/);
  assert.doesNotMatch(api, /export async function (POST|PUT|PATCH|DELETE)/);
  assert.doesNotMatch(service, /contact_phone|contact_email|sender_email|private_details/);
  assert.match(service, /instr\(lower\(/);
  assert.match(service, /SELECT \${s\.from\.split/);
});
test("visual library URL screen supports nine categories, global search and full pagination", () => {
  const view=read("components/admin-visual-library-dynamic-urls.tsx");
  const coverage=read("components/admin-visual-library-coverage.tsx");
  const page=read("app/admin/komponenty/page.tsx");
  assert.match(view, /dynamicUrlKinds\.map/);
  assert.match(view, /<form onSubmit=/);
  assert.match(view, /result\.total/);
  assert.match(view, /result\.page\+1/);
  assert.match(view, /result\.pages/);
  assert.match(view, /Posledná/);
  assert.match(view, /Zoznam preto neoznačujeme ako kompletný/);
  assert.match(coverage, /<AdminVisualLibraryDynamicUrls/);
  assert.match(page, /<AdminVisualLibrary/);
});
