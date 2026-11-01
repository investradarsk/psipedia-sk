import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  parseVisualReviewRoutes,
  parseVisualAcceptanceRoutes,
  validatePreviewBase,
  screenshotFolder,
  VIEWPORTS,
} from "../scripts/pr-visual-screenshots.mjs";

test("PR description selects concrete changed routes, never production", () => {
  assert.deepEqual(
    parseVisualReviewRoutes("## Screenshots\nVISUAL_REVIEW_ROUTES: /,/admin/nastavenia"),
    ["/", "/admin/nastavenia"],
  );
  assert.deepEqual(parseVisualReviewRoutes("VISUAL_REVIEW_ROUTES: /plemena,/adresar"), [
    "/plemena",
    "/adresar",
  ]);
  for (const routes of [
    "",
    "VISUAL_REVIEW_ROUTES: ",
    "VISUAL_REVIEW_ROUTES: https://psipedia.sk",
    "VISUAL_REVIEW_ROUTES: //evil.example",
    "VISUAL_REVIEW_ROUTES: /../admin",
    "VISUAL_REVIEW_ROUTES: /admin?delete=true",
    "VISUAL_REVIEW_ROUTES: /,/",
    "VISUAL_REVIEW_ROUTES: /,/a,/b,/c,/d",
    "VISUAL_REVIEW_ROUTES: /a,/a",
  ])
    assert.throws(() => parseVisualReviewRoutes(routes), routes);
});

test("secondary acceptance routes cover seeded details without relaxing URL safety", () => {
  assert.deepEqual(parseVisualAcceptanceRoutes("VISUAL_REVIEW_ROUTES: /plemena"), []);
  assert.deepEqual(parseVisualAcceptanceRoutes("VISUAL_REVIEW_ROUTES: /plemena\nVISUAL_ACCEPTANCE_ROUTES: /plemena/biely-svajciarsky-ovciak,/novinky"), [
    "/plemena/biely-svajciarsky-ovciak", "/novinky",
  ]);
  assert.throws(() => parseVisualAcceptanceRoutes("VISUAL_ACCEPTANCE_ROUTES: https://psipedia.sk"), /Unsafe/);
});

test("base URL is loopback-only HTTP", () => {
  assert.equal(validatePreviewBase("http://localhost:5173"), "http://localhost:5173");
  assert.equal(validatePreviewBase("http://127.0.0.1:5173"), "http://127.0.0.1:5173");
  // Construct suspicious URL userinfo separately so the test cannot be mistaken for a credential in source control.
  const credentialStyleUrl = new URL("http://evil.test");
  credentialStyleUrl.username = "localhost";
  credentialStyleUrl.password = "5173";
  for (const url of [
    "https://psipedia.sk",
    "http://psipedia.sk",
    "https://localhost:5173",
    "http://localhost:5173/?q=1",
    credentialStyleUrl.href,
  ]) {
    assert.throws(() => validatePreviewBase(url), url);
  }
  assert.equal(screenshotFolder("/"), "homepage");
  assert.equal(screenshotFolder("/admin/nastavenia"), "admin__nastavenia");
  assert.deepEqual(
    VIEWPORTS.map((x) => x.width),
    [1440, 390, 320],
  );
});

test("workflow checks out the PR head with local-only data and uploads artifacts", () => {
  const workflow = readFileSync(
    new URL("../.github/workflows/pr-visual-evidence.yml", import.meta.url),
    "utf8",
  );
  const agents = readFileSync(new URL("../AGENTS.md", import.meta.url), "utf8");
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /\n    paths:/);
  assert.match(workflow, /Select changed visual routes/);
  assert.match(workflow, /pr-visual-route-selection\\.mjs/);
  assert.match(workflow, /head\.repo\.full_name == github\.repository/);
  assert.match(workflow, /pull_request\.head\.sha/);
  assert.match(workflow, /VISUAL_SELECTED_ROUTES/);
  assert.match(workflow, /PSIPEDIA_E2E_LOCAL_BOOTSTRAP/);
  assert.match(workflow, /--local/);
  assert.match(workflow, /node scripts\/bootstrap-breed-e2e\.mjs prepare/);
  assert.match(workflow, /node scripts\/bootstrap-breed-e2e\.mjs seed/);
  assert.match(workflow, /node scripts\/bootstrap-phase5-e2e\.mjs full/);
  assert.match(workflow, /upload-artifact@v4/);
  assert.match(agents, /screenshot evidence from the exact PR revision/i);
  assert.doesNotMatch(workflow, /wrangler deploy|--remote/);
});

test("visual preview initializes managed sections after readiness and before screenshots", () => {
  const workflow = readFileSync(
    new URL("../.github/workflows/pr-visual-evidence.yml", import.meta.url),
    "utf8",
  );
  const bootstrap = readFileSync(
    new URL("../scripts/bootstrap-phase5-e2e.mjs", import.meta.url),
    "utf8",
  );
  const start = workflow.indexOf("- name: Start isolated local app");
  const initialize = workflow.indexOf("- name: Initialize local managed sections");
  const capture = workflow.indexOf("- name: Capture exact PR code screenshots");
  assert.ok(start >= 0 && initialize > start && capture > initialize);
  const step = workflow.slice(initialize, capture);
  assert.match(step, /E2E_BASE_URL: http:\/\/localhost:5173/);
  assert.match(step, /run: node scripts\/bootstrap-phase5-e2e\.mjs sections-only/);
  assert.doesNotMatch(step, /continue-on-error|--remote/);
  assert.match(bootstrap, /process\.env\[REQUIRED_FLAG\] !== "1"/);
  assert.match(bootstrap, /url\.hostname !== "localhost"/);
  assert.match(bootstrap, /materializeReviewSection\(baseUrl\)/);
});
