import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const page = source("app/admin/automatizacie-gemini/page.tsx");
const workspace = source("components/admin-gemini-automation-settings.tsx");
const css = source("components/admin-gemini-automation.module.css");
const canonicalDrafts = source("components/admin-gemini-notion-drafts.tsx");

test("Gemini dashboard uses canonical 22-category catalog, not example profiles", () => {
  assert.match(page, /geminiAutomationSections/);
  assert.match(page, /listGeminiSettings\(db\)/);
  assert.match(workspace, /liveSettings\.filter\(\(item\) => item\.section === section\.key\)/);
  assert.match(workspace, /value=\{selected\?\.stableKey \?\? ""\}/);
  assert.match(workspace, /key=\{selected\.stableKey\} initial=\{selected\}/);
  assert.doesNotMatch(workspace, /Argyle Thebery|Bergficht Kennel|Mountain Dog House/);
});

test("existing paid Gemini POST retains explicit second confirmation and per-category guard", () => {
  assert.match(workspace, /if \(!confirming\) \{/);
  assert.match(workspace, /setConfirming\(true\)/);
  assert.match(workspace, /Potvrď zaradenie do poradovníka/);
  assert.match(workspace, /requestLocked\.current = true/);
  assert.match(workspace, /!unsavedChanges/);
  assert.match(workspace, /\/api\/admin\/gemini-automation\/run/);
  assert.match(workspace, /type="button" className=\{styles\.runButton\}/);
  assert.match(workspace, /window\.confirm\("Máš neuložené nastavenia/);
});

test("dashboard uses real D1 run/queue data and does not invent draft counts", () => {
  assert.match(page, /listRecentGeminiRuns\(db\)/);
  assert.match(page, /listGeminiManualBackgroundJobs\(db\)/);
  assert.match(workspace, /jobs\.filter\(\(job\) => job\.status === "QUEUED"\)/);
  assert.match(workspace, /jobs\.filter\(\(job\) => job\.status === "RUNNING"\)/);
  assert.match(workspace, /Počet sa zistí až po otvorení konceptov z Notionu/);
  assert.match(workspace, /run\.errorCode/);
  assert.match(workspace, /formatDate\(run\.completedAt\)/);
  assert.match(workspace, /timeZone: "Europe\/Bratislava"/);
});

test("one opt-in canonical Notion review panel handles drafts without duplicate GETs", () => {
  assert.equal((workspace.match(/<AdminGeminiNotionDrafts\b/g) ?? []).length, 1);
  assert.match(workspace, /<AdminGeminiNotionDrafts key=\{selected\.stableKey\} stableKey=\{selected\.stableKey\}/);
  assert.doesNotMatch(workspace, /GeminiConceptLookup/);
  assert.doesNotMatch(workspace, /\/api\/admin\/gemini-automation\/notion-drafts\?/);
  assert.match(canonicalDrafts, /GeminiReviewState/);
  assert.match(canonicalDrafts, /<AdminModalDialog/);
  assert.match(canonicalDrafts, /<AdminDirectoryEditor/);
  assert.match(canonicalDrafts, /<AdminGeminiAgendaDraftEditor/);
  assert.match(workspace, /window\.confirm\("Máš neuložené nastavenia/);
});

test("settings polling never writes synchronous effect-derived state", () => {
  assert.doesNotMatch(workspace, /setLiveSettings\(settings\)/);
  assert.doesNotMatch(workspace, /setDrafts\(null\)/);
  assert.match(workspace, /setRemote\(\(previous\) =>/);
});

test("Gemini admin initial queue read runs in parallel with settings, recent runs and global control", () => {
  assert.match(page, /\[settings, runs, control, queuedJobs\] = await Promise\.all\(\[/);
  assert.match(page, /queueEnabled \? listGeminiManualBackgroundJobs\(db\) : Promise\.resolve\(\[\]\)/);
  assert.doesNotMatch(page, /if \(queueEnabled\) queuedJobs = await listGeminiManualBackgroundJobs\(db\)/);
  assert.match(page, /requireAdminPageUser\("\/admin\/automatizacie-gemini"\)/);
  assert.match(page, /catch \{\s*ready = false;/);
  assert.match(workspace, /initialJobs=|initialJobs:/);
});

test("Gemini does not duplicate a full D1 GET at hydration, but retains polling and visibility refresh", () => {
  assert.match(workspace, /const id = window\.setInterval\(\(\) => void refresh\(\), 10000\)/);
  assert.match(workspace, /document\.addEventListener\("visibilitychange", onVisible\)/);
  assert.match(workspace, /document\.removeEventListener\("visibilitychange", onVisible\)/);
  assert.match(workspace, /if \(cancelled \|\| inFlight \|\| document\.visibilityState === "hidden"\) return/);
  const effect = workspace.match(/const onVisible = \(\) => \{[\s\S]*?\}, \[available, settings, initialJobs, recentRuns, control\]\);/)?.[0];
  assert.ok(effect, "polling effect missing");
  assert.doesNotMatch(effect, /\n\s*void refresh\(\);\s*\n/);
  assert.match(workspace, /if \(!response\.ok\) return/);
  assert.match(workspace, /if \(!cancelled\)/);
});

test("dashboard is responsive with accessible compact panels, no 960px grid requirement", () => {
  assert.match(css, /\.workGrid \{ display: grid; grid-template-columns:/);
  assert.match(css, /@media \(max-width: 900px\)/);
  assert.match(css, /\.workGrid \{ grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(css, /@media \(max-width: 540px\)/);
  assert.match(css, /min-width: 0/);
  assert.match(workspace, /aria-labelledby="gemini-history-title"/);
  assert.match(workspace, /aria-labelledby="gemini-drafts-title"/);
});
