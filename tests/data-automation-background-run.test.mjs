import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("manual source run is detached from the request with Cloudflare waitUntil", () => {
  const route = read("app/api/admin/automation-sources/[id]/run/route.ts");
  assert.match(route, /import \{ env, waitUntil \} from "cloudflare:workers"/);
  assert.match(route, /waitUntil\(task\)/);
  assert.match(route, /status: 202/);
  assert.match(route, /export async function GET/);
  assert.match(route, /alreadyRunning/);
});

test("source detail polls RUNNING background jobs instead of holding one long request", () => {
  const component = read("components/admin-automation-source-detail.tsx");
  assert.match(component, /pollRunStatus/);
  assert.match(component, /setTimeout\(resolve, 2000\)/);
  assert.match(component, /source\.lastRunStatus === "RUNNING"/);
  assert.match(component, /Kontrola beží na pozadí/);
  assert.match(component, /Túto stránku môžeš pokojne opustiť/);
});

test("only one RUNNING job per source is allowed and stale jobs recover", () => {
  const migration = read("drizzle/0057_automation_background_run_lock.sql");
  const store = read("lib/data-automation-store.ts");
  assert.match(migration, /automation_runs_one_running_per_source/);
  assert.match(migration, /WHERE status='RUNNING'/);
  assert.match(store, /stale_run_recovered/);
  assert.match(store, /automation_source_already_running/);
  assert.match(store, /20 \* 60_000/);
});

test("background route remains review gated and non-publishing", () => {
  const route = read("app/api/admin/automation-sources/[id]/run/route.ts");
  assert.match(route, /source\.reviewStatus !== "APPROVED"/);
  assert.match(route, /source\.enabled/);
  assert.match(route, /canonicalWrite: false, publication: false/);
  assert.doesNotMatch(route, /INSERT INTO (help_organizations|managed_events|directory_profiles|adoption_dogs)/i);
});
