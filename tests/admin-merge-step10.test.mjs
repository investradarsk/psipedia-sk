import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("Services V3 keeps newest Notion sync feedback and the shared dirty-form guard", () => {
  const component = read("components/admin-service-profile-values.tsx");
  assert.match(component, /import \{summarizeServiceChoiceSync,type ServiceChoiceSyncFeedback,type ServiceChoiceSyncOutcome\}/);
  assert.match(component, /const \[feedback,setFeedback\]=useState<ServiceChoiceSyncFeedback\|null>\(null\)/);
  assert.match(component, /outcomes\.push\(json\)/);
  assert.match(component, /const summary=summarizeServiceChoiceSync\(outcomes\)/);
  assert.match(component, /feedback\.needsAttention/);
  assert.match(component, /Notion: vyžaduje kontrolu/);
  assert.match(component, /useAdminEditorNavigationGuard\(\{dirty:changed\.length>0\}\)/);
  assert.match(component, /open=\{navigation\.confirmOpen\}/);
  assert.match(component, /onStay=\{navigation\.stay\} onDiscard=\{navigation\.discard\}/);
  assert.match(component, /allowNativeExitRef=\{navigation\.allowNativeExitRef\}/);
  assert.doesNotMatch(component, /window\.confirm\(/, "no duplicate, non-React confirmation dialog");
});

test("mobile and desktop navigation effects clean up with void-returning callbacks", () => {
  const navigation = read("components/admin-navigation.tsx");
  const header = read("components/site-header.tsx");
  assert.match(navigation, /router\.prefetch\(href\)/);
  assert.match(navigation, /prefetched\.current\.clear\(\)/);
  assert.doesNotMatch(navigation, /onInvalidate:/);
  assert.match(navigation, /return \(\) => \{ element\?\.removeAttribute\("data-admin-hydrated"\); \}/);
  assert.match(header, /return \(\) => \{ trigger\.removeAttribute\("data-search-ready"\); \}/);
  assert.match(header, /const menuElement = menu;/);
  assert.match(header, /const menuTrigger = trigger;/);
});

test("editor validation and optional review state no longer violate strict TypeScript", () => {
  for (const path of [
    "components/admin-adoption-editor.tsx",
    "components/admin-organization-editor.tsx",
  ]) {
    const source = read(path);
    assert.match(source, /Array\.from\(event\.currentTarget\.elements\)\.find\(\(control\) =>/);
    assert.match(source, /as HTMLInputElement \| HTMLSelectElement \| HTMLTextAreaElement \| undefined/);
    assert.doesNotMatch(source, /\(control\): control is HTMLInputElement \| HTMLSelectElement/,
      "DOM Element type cannot accept this narrowing under current typings");
  }
  const directory = read("components/admin-directory-editor.tsx");
  assert.match(directory, /setReviewed\(Boolean\(data\.profile\.reviewed\)\)/);
  assert.match(directory, /setReviewedAt\(data\.profile\.reviewedAt \?\? ""\)/);
});

test("the final Actions workflow compares new types with the exact base and benchmarks before building", () => {
  const workflow=read(".github/workflows/admin-stability-regressions.yml");
  assert.match(workflow, /fetch-depth: 0/);
  assert.match(workflow, /git worktree add --detach/);
  assert.match(workflow, /admin-type-regression-gate-step10\.mjs/);
  assert.match(workflow, /Synthetic SQLite query parity and diagnostic timings/);
  assert.match(workflow, /Production-style build diagnostic \(never deploy\)/);
  assert.ok(workflow.indexOf("Synthetic SQLite query parity") < workflow.indexOf("TypeScript project regression gate"));
  assert.match(workflow, /permissions:\s*\n\s*contents: read/);
  assert.doesNotMatch(workflow, /wrangler deploy|deploy:cloudflare|secrets\./);
});
