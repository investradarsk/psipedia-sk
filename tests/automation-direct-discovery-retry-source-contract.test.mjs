import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("retry recovery is admin-only and scheduled runner keeps cooldown gate", async () => {
  const [recovery, route, runner] = await Promise.all([
    read("lib/data-automation-direct-discovery-recovery.ts"),
    read("app/api/admin/automation-categories/[category]/route.ts"),
    read("lib/data-automation-discovery-runner.ts"),
  ]);
  assert.match(recovery, /Call this only from an explicit admin save\/retry path/);
  assert.match(route, /if \(enabled && category\.mode === "DIRECT_ENTITY"\)/);
  assert.match(runner, /if \(cooldown\.blocked\)/);
});
