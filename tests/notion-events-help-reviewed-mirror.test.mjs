import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("Events/Help Odkontrolované mirrors only to a mapped, verified Notion page",()=>{
  const mirror=read("lib/notion-admin-review-field.ts");
  assert.match(mirror,/ADMIN_REVIEW_NOTION_PROPERTY = "Odkontrolované"/);
  assert.match(mirror,/notionPageBelongsToDataSource\(page,input\.dataSourceId\)/);
  assert.match(mirror,/notionRichTextProperty\(page,"Psipedia ID"\)/);
  assert.match(mirror,/return "missing-property"/);
  assert.match(mirror,/if\(current===desired\)return "unchanged"/);
  assert.match(mirror,/ADMIN_REVIEW_NOTION_CONCURRENT_CHANGE/);
  assert.match(mirror,/ADMIN_REVIEW_CONCURRENT_CHANGE/);
  assert.match(mirror,/ADMIN_REVIEW_NOTION_ECHO_MISMATCH/);
  assert.match(mirror,/properties:\{\[ADMIN_REVIEW_NOTION_PROPERTY\]:\{checkbox:desired\}\}/);
  assert.doesNotMatch(mirror,/UPDATE (?:managed_events|help_cases|adoption_dogs|lost_found_dog_reports|help_organizations)\b/);
});

test("review flag mirror happens before locked editorial reconciliation is skipped",()=>{
  const sweep=read("lib/notion-events-help-sync.ts");
  const mirrorPos=sweep.indexOf("await mirrorAdminReviewFlagToNotion({");
  const guardPos=sweep.indexOf("if (await isAdminNotionSyncLocked(input.database, input.definition.key, entityId))");
  assert.ok(mirrorPos>0&&guardPos>mirrorPos,"review mirror is allowed through editorial lock");
  assert.match(sweep,/if \(mapping && input.mode === "sync"\)/);
  assert.match(sweep,/const mappedPage = pagesById\.get\(mapping\.notion_page_id\)/);
  assert.match(sweep,/operation: "mirror_review_checkbox"/);
});

test("the Notion checkbox is a D1-to-Notion mirror and cannot uncheck a partner-owned record",()=>{
  const mirror=read("lib/notion-admin-review-field.ts");
  const review=read("lib/admin-notion-review-lock.ts");
  const store=read("lib/admin-entity-review-store.ts");
  assert.match(mirror,/const desired=await isAdminNotionSyncLocked/);
  assert.match(mirror,/const stillDesired=await isAdminNotionSyncLocked/);
  assert.match(review,/pc\.status='APPROVED'/);
  assert.match(review,/pm\.revoked_at IS NULL/);
  assert.match(store,/partnerReviewOwnerSql\(entityType,"\?2"\)/);
  assert.doesNotMatch(mirror,/setAdminEntityReviewed|DELETE FROM admin_entity_reviews/);
});
