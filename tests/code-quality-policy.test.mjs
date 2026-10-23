import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
test("AI instructions require thematic PR, explicit approval, reuse and safe migrations", () => {
  const policy = read("AGENTS.md");
  assert.match(policy, /one thematic PR/);
  assert.match(policy, /Use Draft while unfinished/);
  assert.match(policy, /Never merge, deploy/);
  assert.match(policy, /Search for existing shared components/);
  assert.match(policy, /drizzle-kit generate/);
  assert.match(policy, /admin-automation-push-policy\.ts/);
  assert.match(policy, /local\/preview tests/);
});
test("incremental formatting has a deterministic documented contract", () => {
  const config = JSON.parse(read(".prettierrc.json"));
  assert.equal(config.tabWidth, 2);
  assert.equal(config.singleQuote, false);
  assert.equal(config.semi, true);
  assert.match(read("docs/AI-CODE-QUALITY.md"), /prettier@3\.6\.2/);
  assert.match(read(".prettierignore"), /package-lock\.json/);
});
