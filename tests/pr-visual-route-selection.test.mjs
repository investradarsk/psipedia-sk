import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  MAX_VISUAL_ROUTES,
  GLOBAL_ROUTES,
  parseExplicitVisualRoutes,
  selectVisualReviewRoutes,
  formatRouteSelectionOutputs,
} from "../scripts/pr-visual-route-selection.mjs";

const workflow = readFileSync(new URL("../.github/workflows/pr-visual-evidence.yml", import.meta.url), "utf8");

test("UI edits select a small, real set of affected pages without a PR marker", () => {
  assert.deepEqual(selectVisualReviewRoutes(["app/page.tsx", "components/event-calendar.tsx"]).routes,
    ["/", "/podujatia"]);
  assert.deepEqual(selectVisualReviewRoutes(["components/admin-shell.module.css", "app/admin/page.tsx"]).routes, ["/admin"]);
  assert.deepEqual(selectVisualReviewRoutes(["app/pomoc-psom/page.tsx"]).routes, ["/pomoc-psom"]);
  assert.deepEqual(selectVisualReviewRoutes(["app/design-system.css"]).routes, GLOBAL_ROUTES);
  assert.equal(MAX_VISUAL_ROUTES, 4);
  assert.deepEqual(selectVisualReviewRoutes(["lib/notion-sync.ts", "docs/PR-VISUAL-REVIEW.md"]).routes, []);
});

test("explicit PR routes override automatic classification with tight path restrictions", () => {
  assert.deepEqual(parseExplicitVisualRoutes(
    "VISUAL_REVIEW_ROUTES: /,/admin\nVISUAL_ACCEPTANCE_ROUTES: /podujatia"
  ), ["/", "/admin", "/podujatia"]);
  assert.deepEqual(selectVisualReviewRoutes(["app/page.tsx"],
    "VISUAL_REVIEW_ROUTES: /plemena").routes, ["/plemena"]);
  for (const bad of [
    "VISUAL_REVIEW_ROUTES: https://psipedia.sk",
    "VISUAL_REVIEW_ROUTES: /../admin",
    "VISUAL_REVIEW_ROUTES: //wrong",
    "VISUAL_REVIEW_ROUTES: /admin?delete=true",
    "VISUAL_REVIEW_ROUTES: /,/a,/b,/c,/d",
    "VISUAL_REVIEW_ROUTES: /,/a,/a",
  ]) assert.throws(() => parseExplicitVisualRoutes(bad), bad);
  assert.equal(parseExplicitVisualRoutes("ordinary PR description"), null);
});

test("route selection publishes enable flag and safe bounded route list", () => {
  assert.deepEqual(formatRouteSelectionOutputs({ routes: [], reason: "nonvisual" }),
    { enabled: false, routes: "", reason: "nonvisual" });
  assert.deepEqual(formatRouteSelectionOutputs({ routes: ["/", "/admin"], reason: "UI" }),
    { enabled: true, routes: "/,/admin", reason: "UI" });
  assert.throws(() => selectVisualReviewRoutes(null), /Expected changed/);
});

test("workflow captures both revisions with local D1, blocks production, and uploads diffs", () => {
  assert.match(workflow, /Select changed visual routes/);
  assert.match(workflow, /pr-visual-route-selection\.mjs/);
  assert.match(workflow, /steps\.routes\.outputs\.enabled == 'true'/);
  assert.match(workflow, /head\.repo\.full_name == github\.repository/);
  assert.match(workflow, /PSIPEDIA_E2E_LOCAL_BOOTSTRAP/);
  assert.match(workflow, /pr-visual-capture-base\.sh/);
  assert.match(workflow, /VISUAL_DIFF_REVIEW_ONLY: "1"/);
  assert.match(workflow, /VISUAL_BASELINE_DIR: .*site-before/);
  assert.match(workflow, /VISUAL_CURRENT_DIR: .*site-after/);
  assert.match(workflow, /upload-artifact@v4/);
  assert.doesNotMatch(workflow, /wrangler deploy|--remote/);
  const baseline = readFileSync(new URL("../scripts/pr-visual-capture-base.sh", import.meta.url), "utf8");
  assert.match(baseline, /--local/);
  assert.match(baseline, /PSIPEDIA_E2E_LOCAL_BOOTSTRAP/);
  assert.match(baseline, /scripts\/bootstrap-phase5-e2e\.mjs full/);
  assert.match(baseline, /scripts\/pr-visual-screenshots\.mjs/);
  assert.doesNotMatch(baseline, /--remote|wrangler deploy|https:\/\/psipedia\.sk/);
});
