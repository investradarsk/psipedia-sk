import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("inquiries use the existing status API and preserve original customer message, mobile actions and delete confirmation", () => {
  const ui = read("components/admin-inquiry-dashboard.tsx");
  const route = read("app/api/admin/inquiries/[id]/route.ts");
  assert.match(ui,/AdminInlineRowActions/);
  assert.match(ui,/AdminInlineCellSelect/);
  assert.match(ui,/className=\{rowStyles\.desktop\}/);
  assert.match(ui,/className=\{rowStyles\.mobile\}/);
  assert.match(ui,/status: nextStatus/);
  assert.match(ui,/method: "PUT"/);
  assert.match(ui,/inquiry\.message/);
  assert.match(ui,/onClick=\{\(\) => void removeInquiry\(inquiry\)\}/);
  assert.match(route,/updateDirectoryInquiryStatus\(id, body\.status\)/);
  assert.doesNotMatch(ui,/action: "set-inline-message"|message: rowDraft/);
});

test("news tips keep reader story untouched and edit only internal note and status", () => {
  const ui = read("components/admin-news-tip-dashboard.tsx");
  const route = read("app/api/admin/news-tips/[id]/route.ts");
  const writer = read("lib/news-tip-store.ts");
  assert.match(ui,/AdminInlineRowActions/);
  assert.match(ui,/AdminInlineCellSelect/);
  assert.match(ui,/internalNote: notes\[tip\.id\]/);
  assert.match(ui,/if \(await saveTip\(tip, draft\.status\)\) setRowDraft\(null\)/);
  assert.match(ui,/rowDraft\.originalNote/);
  assert.match(ui,/className=\{rowStyles\.desktop\}/);
  assert.match(ui,/className=\{rowStyles\.mobile\}/);
  assert.match(ui,/Uložiť poznámku/);
  assert.match(ui,/tip\.summary/);
  assert.match(route,/updateNewsTip\(id,/);
  assert.match(writer,/SET status = \?, internal_note = \?, updated_at = \?/);
});

test("article feedback changes only moderator status and preserves visitor rating and comment", () => {
  const ui = read("components/admin-article-feedback-dashboard.tsx");
  const route = read("app/api/admin/article-feedback/[id]/route.ts");
  const writer = read("lib/article-feedback-store.ts");
  assert.match(ui,/AdminInlineRowActions/);
  assert.match(ui,/AdminInlineCellSelect/);
  assert.match(ui,/className=\{rowStyles\.desktop\}/);
  assert.match(ui,/className=\{rowStyles\.mobile\}/);
  assert.match(ui,/item\.missingText/);
  assert.match(ui,/!item\.helpful/);
  assert.match(route,/strictProvenance: true/);
  assert.match(route,/updateArticleFeedbackStatus\(id, body\.status\)/);
  assert.match(writer,/WHERE id = \? AND helpful = 0/);
  assert.doesNotMatch(ui,/missingText: rowDraft|helpful: rowDraft/);
});

test("profile change requests continue using explicit confirmation, never an unguarded inline overwrite", () => {
  const ui=read("components/admin-directory-change-requests.tsx");
  const route=read("app/api/admin/profile-change-requests/[id]/route.ts");
  assert.match(ui,/setPendingReview/);
  assert.match(ui,/AdminDestructiveConfirmDialog/);
  assert.match(route,/body\.status !== "approved" && body\.status !== "rejected"/);
  assert.doesNotMatch(ui,/onBlur=\{.*update/);
});

test("card status editing is desktop-only and the original mobile status actions are present", () => {
  const css=read("components/admin-inline-card-actions.module.css");
  assert.match(css, /max-width:899px/);
  assert.match(css, /\.desktop\{display:none\}/);
  assert.match(css, /\.mobile\{display:flex\}/);
});
