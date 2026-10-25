import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const source=readFileSync(new URL("../lib/admin-quality-missing-overview.ts",import.meta.url),"utf8");
const page=readFileSync(new URL("../app/admin/kvalita/prehlad/page.tsx",import.meta.url),"utf8");
const shortcut=readFileSync(new URL("../components/admin-missing-quality-dashboard.tsx",import.meta.url),"utf8");

test("quality overview is separate admin-only page, opened in a new tab",()=>{
  assert.match(shortcut,/href="\/admin\/kvalita\/prehlad" target="_blank" rel="noopener noreferrer"/);
  assert.match(page,/requireAdminPageUser\("\/admin\/kvalita\/prehlad"\)/);
  assert.match(page,/dynamic="force-dynamic"/);
  assert.match(page,/robots:\{index:false,follow:false\}/);
  assert.match(page,/Späť na schvaľovanie nálezov/);
});
test("count and filters come from canonical database instead of Tavily proposal queue",()=>{
  for(const domain of ["directory_profiles","managed_events","help_organizations","adoption_dogs","help_cases","lost_found_dog_reports"])
    assert.ok(source.includes('table:"'+domain+'"'),domain);
  assert.match(source,/SELECT COUNT\(\*\) AS total/);
  assert.match(source,/COALESCE\(SUM\(m_/);
  assert.match(source,/LIMIT \? OFFSET \?/);
  assert.match(source,/OVERVIEW_PAGE_SIZE=50/);
  assert.doesNotMatch(source,/quality_missing_proposals|TAVILY_API_KEY|searchWithImages|INSERT INTO|UPDATE [a-z_]+ SET|DELETE FROM/);
  assert.match(page,/getQualityMissingDatabase\(\)/);
});
test("veterinari and every existing directory category are available via official taxonomy",()=>{
  assert.match(source,/allDirectoryCategories\.map/);
  assert.match(source,/category=\?/);
  assert.match(source,/params\.set\("category",current\.category\)/);
  assert.match(source,/fieldIds\.includes/);
  assert.match(source,/Number\.isSafeInteger\(rawPage\)/);
  assert.match(source,/Math\.min\(rawPage,100000\)/);
  assert.match(page,/name="category"/);
  assert.match(page,/name="field"/);
});
test("all nine missing-data categories have independent counters and drill-down",()=>{
  for(const key of ["address","image","web","phone","email","social","registration","date","other"])
    assert.ok(source.includes('{id:"'+key+'"'),key);
  assert.match(source,/RAW_MISSING_PHONE_SQL/);
  assert.match(source,/RAW_MISSING_EMAIL_SQL/);
  assert.match(source,/RAW_MISSING_WEBSITE_SQL/);
  assert.match(source,/json_valid/);
  assert.match(source,/incompleteProfiles:/);
  assert.match(page,/result\.summary\.byField\[group\.id\]/);
  assert.match(page,/result\.items\.map/);
});
test("status scope follows Tavily's active profile rules and current Slovak calendar dates",()=>{
  assert.match(source,/qualityTodayInSlovakia\(now\)/);
  assert.match(source,/COALESCE\(cancelled,0\)=0/);
  assert.match(source,/end_date/);
  assert.match(source,/RESERVED','ADOPTED','ARCHIVED/);
  assert.match(source,/COALESCE\(resolved,0\)=0/);
  assert.match(source,/RESOLVED','EXPIRED','REJECTED','ARCHIVED/);
  assert.match(page,/Všetky vrátane ukončených/);
});
test("result table has profile links and never edits canonical records",()=>{
  assert.match(page,/href=\{item\.editorHref\} target="_blank" rel="noopener noreferrer"/);
  assert.match(page,/zobrazené \{from\}–\{to\}/);
  assert.match(page,/Strana \{result\.page\} z \{result\.pages\}/);
  assert.match(page,/Prehľad nič nemení a nespotrebúva kredity Tavily/);
});
