import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const worker = readFileSync(new URL("../worker/index.ts", import.meta.url), "utf8");

test("new missing-data search is the only scheduled Tavily enrichment workflow", () => {
  assert.match(worker, /runQualityMissingHourly\(/);
  assert.match(worker, /isFullHourlyScheduledSweep\(controller\)/);
  assert.doesNotMatch(worker, /runDataAutomationSweep\(/);
  assert.doesNotMatch(worker, /runDataAutomationDiscoverySweep\(/);
  assert.doesNotMatch(worker, /TavilyAutomationSearchProvider/);
});
test("Gemini background, Notion synchronization, and notifications stay scheduled", () => {
  assert.match(worker, /runGeminiManualBackgroundSweep\(/);
  assert.match(worker, /runNotionEventsHelpSyncSweep\(/);
  assert.match(worker, /runNotionDirectorySyncSweep\(/);
  assert.match(worker, /runNotionArticleSyncSweep\(/);
  assert.match(worker, /runScheduledAdminPush\(/);
});
