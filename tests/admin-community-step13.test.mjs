import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("step 13: partners use readable labels but unchanged status values and queue URLs", () => {
  const helper = read("lib/admin-partner-labels.ts");
  for (const status of ["PENDING", "PENDING_REVIEW", "PENDING_VERIFICATION", "SUBMITTED", "QUARANTINED", "APPROVED", "REJECTED", "WITHDRAWN", "ACTIVE"]) {
    assert.ok(helper.includes(status + ":"), status);
  }
  for (const type of ["DIRECTORY_PROFILE", "HELP_ORGANIZATION"]) assert.ok(helper.includes(type + ":"), type);
  assert.match(helper, /return statuses\[status\] \?\? status/);
  assert.match(helper, /return resources\[type\] \?\? type/);
  const accounts = read("app/admin/partners/page.tsx");
  assert.match(accounts, /data-admin-community-metrics/);
  assert.match(accounts, /data-admin-partner-attention/);
  assert.match(accounts, /role="search" aria-label="Filtrovať partnerské účty" data-admin-list-filters/);
  assert.match(accounts, /role="list" aria-label="Partnerské účty"/);
  assert.match(accounts, /role="listitem"/);
  assert.match(accounts, /data-admin-list-pagination/);
  assert.match(accounts, /partnerAdminStatusLabel\(a\.status\)/);
  assert.match(accounts, /pageUrl\(accounts\.page\+1\)/);
  assert.match(accounts, /href="\/admin\/partners\/claims\?status=PENDING"/);
});

test("step 13: four partner queues preserve GET query params and original moderation destinations", () => {
  for (const [path,href] of [
    ["app/admin/partners/claims/page.tsx", "claims"],
    ["app/admin/partners/submissions/page.tsx", "submissions"],
    ["app/admin/partners/changes/page.tsx", "changes"],
    ["app/admin/partners/verifications/page.tsx", "verifications"],
  ]) {
    const src = read(path);
    assert.match(src, /data-admin-list-filters/, path);
    assert.match(src, /data-admin-community-list/, path);
    assert.match(src, /partnerAdminStatusLabel\(/, path);
    assert.match(src, /partnerAdminResourceLabel\(/, path);
    assert.ok(src.includes("/admin/partners/" + href + "/${item.id}"), path);
    assert.match(src, /name="status" defaultValue=\{status\}/, path);
    assert.match(src, /name="q" defaultValue=\{q\}/, path);
    assert.doesNotMatch(src, /<option value="PENDING_REVIEW">PENDING_REVIEW<\/option>/, path);
  }
  const claims = read("app/admin/partners/claims/page.tsx");
  assert.match(claims, /<option key=\{item\} value=\{item\}>\{partnerAdminStatusLabel\(item\)\}<\/option>/);
  const submissions = read("app/admin/partners/submissions/page.tsx");
  assert.match(submissions, /<option value="HIGH">Vysoká zhoda<\/option>/);
  assert.match(submissions, /name="duplicate" defaultValue=\{duplicateConfidence\}/);
  const changes = read("app/admin/partners/changes/page.tsx");
  assert.match(changes, /<option value="STALE_BASE">Zastaralý pôvodný údaj<\/option>/);
  assert.match(changes, /name="risk" defaultValue=\{risk\}/);
});

test("step 13: claim and submission details preserve guarded decision components", () => {
  const claim = read("app/admin/partners/claims/[id]/page.tsx");
  const submission = read("app/admin/partners/submissions/[id]/page.tsx");
  assert.match(claim, /partnerAdminRoleLabel\(m\.role\)/);
  assert.match(claim, /claim\.status === "PENDING" \? <AdminPartnerClaimActions claimId=\{claim\.id\}/);
  assert.match(claim, /<h2>Overenie správcu<\/h2>/);
  assert.match(submission, /partnerAdminDuplicateLabel\(/);
  assert.match(submission, /submission\.active\?<AdminPartnerNewProfileActions id=\{submission\.id\}/);
  assert.match(submission, /<AdminPartnerNewProfileCandidateLinkButton/);
  assert.match(submission, /<h2>História rozhodnutí<\/h2>/);
});

test("step 13: review moderation remains read-only except existing guarded approval", () => {
  const review = read("app/admin/recenzie-profilov/page.tsx");
  const css = read("app/admin/recenzie-profilov/reviews.css");
  const approval = read("components/admin-profile-review-inline-approval.tsx");
  assert.match(review, /role="search" aria-label="Filtrovať profilové recenzie" data-admin-list-filters/);
  assert.match(review, /data-admin-community-moderation/);
  assert.match(review, /data-admin-community-list/);
  assert.match(review, /role="status" data-admin-list-results/);
  assert.match(review, /profileReviewStatusLabel\(item\.status\)/);
  assert.match(review, /profileReviewEntityTypeLabel\(item\.entityType\)/);
  assert.match(review, /<AdminProfileReviewInlineApproval/);
  assert.match(review, /<AdminPagination pagination=\{data\.pagination\}/);
  assert.match(approval, /currentStatus !== "PENDING_REVIEW"/);
  assert.match(approval, /window\.confirm\(/);
  assert.match(approval, /expectedStatus: "PENDING_REVIEW"/);
  assert.match(css, /ADMIN COMMUNITY STEP 13/);
  assert.match(css, /\.admin-review-open\s*\{[\s\S]*?min-height: var\(--admin-ui-control-height, 44px\)/);
  assert.doesNotMatch(css.slice(css.indexOf("ADMIN COMMUNITY STEP 13")), /overflow-x:\s*hidden/);
});

test("step 13: reader suggestions keep existing statuses and safe inline editing", () => {
  const feedback = read("components/admin-article-feedback-dashboard.tsx");
  const styles = read("components/admin-article-feedback-dashboard.module.css");
  assert.match(feedback, /data-admin-content-module="reader-feedback"/);
  assert.match(feedback, /data-admin-community-feedback/);
  assert.match(feedback, /<AdminInlineRowActions/);
  assert.match(feedback, /<AdminInlineCellSelect/);
  assert.match(feedback, /updateStatus\(item, "resolved"\)/);
  assert.match(feedback, /updateStatus\(item, "dismissed"\)/);
  assert.match(feedback, /busyId === item\.id/);
  assert.match(styles, /ADMIN COMMUNITY STEP 13/);
  assert.match(styles, /\.actions button \{ min-height: var\(--admin-ui-control-height, 44px\)/);
});

test("step 13: partner grids are compact with minimum 44px actions and locally scoped mobile layout", () => {
  const css = read("app/admin/partners/partners.css");
  assert.match(css, /ADMIN COMMUNITY STEP 13/);
  assert.match(css, /\.admin-partner-pending a\s*\{[\s\S]*?min-height: var\(--admin-ui-control-height, 44px\)/);
  assert.match(css, /\.admin-commercial-list article\s*\{[\s\S]*?grid-template-columns: minmax\(0, 1\.5fr\)/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /\.admin-partner-search :is\(input, select\),/);
  assert.doesNotMatch(css.slice(css.indexOf("ADMIN COMMUNITY STEP 13")), /overflow-x:\s*hidden/);
});
