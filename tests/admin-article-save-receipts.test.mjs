import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const route = await readFile(new URL("../app/api/admin/articles/[id]/route.ts", import.meta.url), "utf8");
const editor = await readFile(new URL("../components/admin-article-editor.tsx", import.meta.url), "utf8");

// Exercise the exact pure receipt classifiers from the route without loading
// Cloudflare bindings or the production Next server.
const helpers = route.slice(
  route.indexOf("type NotionArticleStep ="),
  route.indexOf("type RouteProps ="),
);
assert.ok(helpers.includes("function notionStepReceipt("));
const compiled = ts.transpileModule(
  helpers + "\nexport { notionStepReceipt, notionStepFailure, articleSaveReceipt };",
  { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
).outputText;
const { notionStepReceipt, notionStepFailure, articleSaveReceipt } = await import(
  "data:text/javascript;base64," + Buffer.from(compiled).toString("base64")
);

test("partial Notion SEO writeback preserves a successful D1 receipt and failed fields", () => {
  const seo = notionStepReceipt({
    linked: true, updated: true, reason: "partial",
    failedFields: [{ field: "ogTitle", code: "NOTION_ARTICLE_SEO_PROPERTY_MISSING" }],
  });
  const receipt = articleSaveReceipt(
    { updatedAt: "2026-11-24T00:00:00.000Z" },
    { seo, publication: { status: "synced" } },
    { status: "failed", code: "ADMIN_PUBLICATION_ACK_FAILED" },
    { status: "skipped" },
  );
  assert.deepEqual(receipt.d1, { status: "saved", updatedAt: "2026-11-24T00:00:00.000Z" });
  assert.deepEqual(receipt.notion.seo, {
    status: "partial", code: "NOTION_ARTICLE_SEO_PARTIAL", fields: ["ogTitle"],
  });
  assert.equal(receipt.notion.publication.status, "synced");
  assert.equal(receipt.lifecycle.status, "failed");
});

test("an unlinked, disabled or unchanged Notion sync is never falsely marked synchronized", () => {
  assert.deepEqual(notionStepReceipt({ linked: false, updated: false, reason: "not-linked" }),
    { status: "skipped", code: "not-linked" });
  assert.deepEqual(notionStepReceipt({ linked: false, updated: false, reason: "disabled" }),
    { status: "skipped", code: "disabled" });
  assert.deepEqual(notionStepReceipt({ linked: true, updated: false, reason: "unchanged" }),
    { status: "synced" });
  assert.deepEqual(notionStepFailure(new Error("NOTION_EDITORIAL_REMOTE_CONFLICT")),
    { status: "failed", code: "NOTION_EDITORIAL_REMOTE_CONFLICT" });
  assert.deepEqual(notionStepFailure(new Error("token: sensitive")),
    { status: "failed", code: "REMOTE_WRITEBACK_FAILED" });
});

test("successful D1 write returns a receipt even if Notion, R2 or publication acknowledgement fails", () => {
  const put = route.slice(route.indexOf("export async function PUT("), route.indexOf("export async function PATCH("));
  assert.match(put, /const article = await updateManagedArticle\(/);
  assert.match(put, /notionSteps\.publication = notionStepFailure\(error\)/);
  assert.match(put, /reportError\("seo", error/);
  assert.match(put, /mediaReceipt = removed\.some\(/);
  assert.match(put, /lifecycleReceipt = \{ status: "failed", code: "ADMIN_PUBLICATION_ACK_FAILED" \}/);
  assert.match(put, /saveReceipt: articleSaveReceipt\(article, notionSteps, lifecycleReceipt, mediaReceipt\)/);
});

test("a follow-up retry has revision CAS and never runs a second article update", () => {
  const retry = route.slice(
    route.indexOf('if ((body as Record<string, unknown>).action === "retry-article-followup")'),
    route.indexOf('if ((body as Record<string, unknown>).action === "set-inline-excerpt")'),
  );
  assert.match(retry, /article\.updatedAt !== values\.expectedUpdatedAt/);
  assert.match(retry, /status: 409/);
  assert.match(retry, /before\.updatedAt === article\.updatedAt/);
  assert.match(retry, /writeBackPublishedArticleToNotion/);
  assert.match(retry, /writeBackArticleBreedCategoryToNotion/);
  assert.match(retry, /writeBackArticleSeoToNotion/);
  assert.match(retry, /writeBackDraftArticleContentToNotion/);
  assert.doesNotMatch(retry, /updateManagedArticle\(|createManagedArticle\(/);
  assert.doesNotMatch(retry, /facebook-articles/);
});

test("Facebook retry verifies current version before a single PUT; no automatic POST", () => {
  const facebook = editor.slice(
    editor.indexOf("async function persistFacebookStep("),
    editor.indexOf("async function save(nextStatus:"),
  );
  assert.match(facebook, /verifyRevision/);
  assert.match(facebook, /cache: "no-store"/);
  assert.match(facebook, /current\.post\?\.version/);
  assert.match(facebook, /pending\.expectedVersion/);
  assert.match(facebook, /method: "PUT"/);
  assert.doesNotMatch(facebook, /method: "POST"/);
  assert.match(facebook, /async function retryFacebookStep\(/);
  assert.match(facebook, /await persistFacebookStep\(pendingFacebookSave, true\)/);
});

test("repeated article save after a successful first POST uses existing article ID and version", () => {
  const save = editor.slice(editor.indexOf("async function save(nextStatus:"), editor.indexOf("function cancelEditing()"));
  assert.match(save, /const currentArticle = savedArticleRef\.current/);
  assert.match(save, /currentArticle \? `\/api\/admin\/articles\/\$\{currentArticle\.id\}` : "\/api\/admin\/articles"/);
  assert.match(save, /method: currentArticle \? "PUT" : "POST"/);
  assert.match(save, /savedArticleRef\.current = data\.article/);
  assert.match(save, /lastSavedUpdatedAtRef\.current = data\.article\.updatedAt/);
  assert.match(save, /facebookFailed/);
  assert.match(save, /if \(!facebookFailed\)/);
  assert.match(editor, /savePendingRef\.current \|\| uploading/);
});

test("retry UI keeps D1 success visible and locks failed steps behind current revision", () => {
  assert.match(editor, /<strong>D1:<\/strong>/);
  assert.match(editor, /Článok v D1 sa znovu nezapisoval/);
  assert.match(editor, /expectedUpdatedAt: persisted\.updatedAt/);
  assert.match(editor, /disabled=\{!!retryBusy \|\| saving \|\| dirty\}/);
  assert.match(editor, /Zopakovať iba tento krok/);
});
