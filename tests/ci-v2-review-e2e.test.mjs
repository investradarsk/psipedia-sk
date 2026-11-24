import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));
const script = join(root, "scripts/review-e2e-local.sh");
const read = (path) => readFileSync(join(root, path), "utf8");
const env = {
  ...process.env,
  GITHUB_ACTIONS: "true",
  PSIPEDIA_E2E_LOCAL_BOOTSTRAP: "1",
  E2E_BASE_URL: "http://localhost:5173",
};

test("shared bootstrap syntax and local-only guards", () => {
  execFileSync("bash", ["-n", script]);
  for (const override of [
    { GITHUB_ACTIONS: "false" },
    { PSIPEDIA_E2E_LOCAL_BOOTSTRAP: "0" },
    { E2E_BASE_URL: "https://psipedia.sk" },
  ]) {
    const result = spawnSync("bash", [script, "migrate", "reviews-2a"], { env: { ...env, ...override } });
    assert.equal(result.status, 1);
  }
  assert.equal(spawnSync("bash", [script, "start", "unknown"], { env }).status, 1);
  const source = read("scripts/review-e2e-local.sh");
  assert.match(source, /--local --config dist\/server\/wrangler\.json --persist-to \.wrangler\/state/);
  assert.doesNotMatch(source, /--remote\b/);
  assert.match(source, /--host 127\.0\.0\.1 --port 5173 --strictPort/);
  assert.match(source, /kill -0/);
});

test("migration exclusions restore both files on success, failure and partial move", () => {
  const names = ["0038_adoption_staging_data.sql", "0039_activate_canonical_adoptions.sql"];
  for (const scenario of ["success", "failure", "partial"]) {
    const cwd = mkdtempSync(join(tmpdir(), "review-e2e-contract-"));
    try {
      mkdirSync(join(cwd, "drizzle"));
      mkdirSync(join(cwd, "dist/server"), { recursive: true });
      mkdirSync(join(cwd, "bin"));
      writeFileSync(join(cwd, "dist/server/wrangler.json"), "{}");
      for (const name of names.slice(0, scenario === "partial" ? 1 : 2)) {
        writeFileSync(join(cwd, "drizzle", name), name);
      }
      writeFileSync(join(cwd, "bin/npx"), '#!/bin/bash\nprintf "%s\\n" "$@" > called\nexit "$FAKE_NPX_STATUS"\n', { mode: 0o755 });
      const result = spawnSync("bash", [script, "migrate", "reviews-2a"], {
        cwd,
        env: { ...env, PATH: join(cwd, "bin") + ":" + env.PATH, FAKE_NPX_STATUS: scenario === "failure" ? "7" : "0" },
      });
      assert.equal(result.status, scenario === "success" ? 0 : scenario === "failure" ? 7 : 1, String(result.stderr));
      assert.equal(readFileSync(join(cwd, "drizzle", names[0]), "utf8"), names[0]);
      assert.equal(existsSync(join(cwd, "drizzle", names[1])), scenario !== "partial");
      if (scenario === "partial") assert.equal(existsSync(join(cwd, "called")), false);
      else assert.equal(readFileSync(join(cwd, "called"), "utf8"), "wrangler\nd1\nmigrations\napply\nDB\n--local\n--config\ndist/server/wrangler.json\n--persist-to\n.wrangler/state\n");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }
});

test("all four review jobs retain fixture order and isolated server lifecycle", () => {
  const cases = [
    ["review-author-auth-ci.yml", "reviews-2a", "review-author-auth-e2e.sql"],
    ["profile-review-submission-ci.yml", "reviews-2b", "profile-review-submission-e2e.sql"],
    ["profile-review-admin-ci.yml", "reviews-3", "profile-review-admin-e2e.sql"],
    ["profile-reviews-public-ci.yml", "reviews-1b", "profile-reviews-e2e.sql"],
  ];
  for (const [file, profile, fixture] of cases) {
    const workflow = read(".github/workflows/" + file);
    const indices = [
      "scripts/review-e2e-local.sh migrate " + profile,
      "--file db/isolated/directory_admin_sql_completion.sql",
      "--file tests/fixtures/directory-admin-e2e.sql",
      "--file tests/fixtures/" + fixture,
      "scripts/review-e2e-local.sh start " + profile,
      "scripts/review-e2e-local.sh stop " + profile,
    ].map((needle) => workflow.indexOf(needle));
    assert.ok(indices.every((index, i) => index >= 0 && (i === 0 || index > indices[i - 1])), file);
    assert.match(workflow, /PSIPEDIA_E2E_LOCAL_BOOTSTRAP: "1"/);
    assert.match(workflow, /E2E_BASE_URL: http:\/\/localhost:5173/);
    assert.doesNotMatch(workflow, /--remote\b/);
    assert.match(workflow, /name: Stop isolated local app\n        if: always\(\)/);
  }
});

test("desktop and mobile review evidence cannot overwrite one another", () => {
  for (const [file, profile] of [
    ["review-author-auth-ci.yml", "reviews-2a"],
    ["profile-review-submission-ci.yml", "reviews-2b"],
  ]) {
    const workflow = read(".github/workflows/" + file);
    for (const [project, label] of [["desktop-chromium", "desktop"], ["mobile-chromium", "mobile"]]) {
      assert.ok(workflow.includes("PLAYWRIGHT_HTML_OUTPUT_DIR: .e2e-artifacts/" + profile + "/" + label + "-report"));
      assert.ok(workflow.includes("--project=" + project + " --workers=1 --retries=0 --output=.e2e-artifacts/" + profile + "/" + label + "-results"));
    }
    assert.ok(workflow.includes(".e2e-artifacts/" + profile + "/"));
  }
});
