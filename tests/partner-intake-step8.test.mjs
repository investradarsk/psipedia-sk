import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = path => readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("Partner cannot mutate a submitted, pending-review or quarantined canonical draft",()=>{
  const workflow=read("lib/partner-canonical-workflow.ts");
  const form=read("components/partner-canonical-draft-form.tsx");
  assert.match(workflow,/const editableStates=\["DRAFT","RETURNED"\]/);
  assert.match(workflow,/AND s.status IN \('DRAFT','RETURNED'\)/);
  assert.match(workflow,/AND status IN \('DRAFT','RETURNED'\)/);
  assert.match(form,/const editable=\["DRAFT","RETURNED"\].includes\(status\)/);
  assert.match(form,/Podanie čaká na redakčné rozhodnutie/);
  assert.match(workflow,/if\(row.status!=="DRAFT"&&row.status!=="RETURNED"\)/);
});

test("Admin cannot approve with absent or stale reviewed canonical revision",()=>{
  const workflow=read("lib/partner-canonical-workflow.ts");
  assert.match(workflow,/input.action==="APPROVE"&&\(!input.expectedCanonicalUpdatedAt\|\|revision.updatedAt!==input.expectedCanonicalUpdatedAt\)/);
  assert.match(workflow,/STALE_CANONICAL_REVIEW/);
  assert.match(workflow,/published_at IS NULL AND updated_at/);
  assert.match(workflow,/guard\(db\)/);
  const canonicalEndpoint=read("app/api/admin/partners/canonical-drafts/[id]/route.ts");
  assert.match(canonicalEndpoint,/expectedCanonicalUpdatedAt/);
});

test("directory and organization canonical reviews transfer exact expected revision from Admin UI to workflow",()=>{
  const getter=read("lib/partner-new-profile-admin.ts");
  const page=read("app/admin/partners/submissions/[id]/page.tsx");
  const button=read("components/admin-partner-new-profile-actions.tsx");
  const route=read("app/api/admin/partners/submissions/[id]/route.ts");
  assert.match(getter,/SELECT updated_at updatedAt FROM/);
  assert.match(getter,/canonicalUpdatedAt/);
  assert.match(getter,/expectedCanonicalUpdatedAt:input.expectedCanonicalUpdatedAt/);
  assert.match(page,/canonicalUpdatedAt=\{submission.canonicalUpdatedAt\}/);
  assert.match(button,/expectedCanonicalUpdatedAt:canonicalUpdatedAt/);
  assert.match(route,/expectedCanonicalUpdatedAt:typeof body.expectedCanonicalUpdatedAt==="string"/);
  assert.match(button,/isCanonicalDraft\?"Schváliť a publikovať"/);
});

test("Help canonical review approves one existing record, never submits legacy editedPayload",()=>{
  const getter=read("lib/partner-help-create-admin.ts");
  const page=read("app/admin/partners/help-submissions/[id]/page.tsx");
  const action=read("components/admin-partner-help-review-actions.tsx");
  const route=read("app/api/admin/partners/help-submissions/[id]/route.ts");
  assert.match(getter,/canonicalUpdatedAt/);
  assert.match(getter,/if\(original.subjectId\)/);
  assert.match(getter,/if\(input.editedPayload!==undefined\)/);
  assert.match(getter,/expectedCanonicalUpdatedAt:input.expectedCanonicalUpdatedAt/);
  assert.match(page,/isCanonicalDraft=\{Boolean\(item.canonicalId\)\}/);
  assert.match(page,/canonicalUpdatedAt=\{item.canonicalUpdatedAt\}/);
  assert.match(action,/if\(isCanonicalDraft\)/);
  assert.match(action,/body=\{action,expectedCanonicalUpdatedAt:canonicalUpdatedAt\}/);
  assert.match(action,/body=\{action,editedPayload\}/);
  assert.match(action,/Schváliť a publikovať/);
  assert.match(route,/expectedCanonicalUpdatedAt:typeof data.expectedCanonicalUpdatedAt/);
});

test("Events distinguish legacy DRAFT creation from canonical publication with a version CAS",()=>{
  const getter=read("lib/partner-events-admin.ts");
  const page=read("app/admin/partners/events/[id]/page.tsx");
  const action=read("components/admin-partner-event-actions.tsx");
  const route=read("app/api/admin/partners/events/[id]/route.ts");
  assert.match(getter,/expectedCanonicalUpdatedAt:input.expectedCanonicalUpdatedAt/);
  assert.match(page,/isCanonicalDraft=\{Boolean\(item.subjectId\)&&item.operation==="CREATE"\}/);
  assert.match(page,/canonicalUpdatedAt=\{item.current\?\.updatedAt\}/);
  assert.match(action,/expectedCanonicalUpdatedAt:action==="CREATE_EVENT"&&isCanonicalDraft\?canonicalUpdatedAt/);
  assert.match(action,/isCanonicalDraft\?"Schváliť a publikovať podujatie"/);
  assert.match(route,/expectedCanonicalUpdatedAt:typeof body.expectedCanonicalUpdatedAt/);
});

test("unified inbox links historical public report to exact original editor, without public reporter private identity",()=>{
  const inbox=read("lib/admin-submission-inbox.ts");
  assert.match(inbox,/if\(item.kind==="PUBLIC"\)\{/);
  assert.match(inbox,/const original=inboxEditorHref\(item\)/);
  assert.match(inbox,/if\(original\)return original/);
  assert.doesNotMatch(inbox,/if\(item.kind==="PUBLIC"&&item.resourceType==="LOST_FOUND_DOG"&&item.canonicalId\)/);
  assert.match(inbox,/CASE WHEN s.submitter_type='PARTNER_ACCOUNT' THEN s.submitter_ref ELSE NULL END AS accountId/);
  assert.doesNotMatch(inbox,/lost_found_dog_private_details|contact_email_encrypted/);
  assert.match(inbox,/LIMIT \?4 OFFSET \?5/);
});

test("new workflow preserves original moderation, ownership, Notion and email queues",()=>{
  const workflow=read("lib/partner-canonical-workflow.ts");
  const media=read("lib/partner-lost-found-resolution.ts");
  const notices=read("lib/partner-canonical-notices.ts");
  const route=read("app/api/lost-found/submissions/route.ts");
  assert.match(workflow,/applyAtomicModerationTransition\(db/);
  assert.match(workflow,/ownerStatements\(db,row,nowIso,actorRef\)/);
  assert.match(workflow,/canonicalNoticeStatement\(db/);
  assert.match(media,/captureHelpNotionSnapshot/);
  assert.match(media,/syncSavedNotionRecord/);
  assert.match(media,/PARTNER_LOST_FOUND_RESOLVE_SQL/);
  assert.match(route,/status: 410/);
  assert.match(notices,/INSERT OR IGNORE INTO partner_notification_outbox/);
  assert.doesNotMatch(workflow,/CREATE TABLE/);
});
