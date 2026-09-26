import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  AUTOMATION_SEARCH_DEFAULT_GLOBAL_DAILY_REQUESTS,
  AUTOMATION_SEARCH_DEFAULT_QUERIES_PER_RUN,
  AUTOMATION_SEARCH_HARD_QUERIES_PER_RUN,
  AUTOMATION_SEARCH_MAX_PAGES_PER_QUERY,
  automationSearchBudgetPolicy,
  automationSearchCooldownUntil,
  automationSearchPlateauSignal,
  utcSearchDayBucket,
} from "../lib/data-automation-search-budget.ts";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("DISCOVERY-2B policy applies conservative defaults and only allows downward root overrides", () => {
  const defaults = automationSearchBudgetPolicy({ entityType: "EVENT", cadenceMinutes: 60, config: {} });
  assert.equal(defaults.queriesPerRun, AUTOMATION_SEARCH_DEFAULT_QUERIES_PER_RUN);
  assert.equal(defaults.globalDailyRequests, AUTOMATION_SEARCH_DEFAULT_GLOBAL_DAILY_REQUESTS);
  assert.equal(defaults.maxPagesPerQuery, AUTOMATION_SEARCH_MAX_PAGES_PER_QUERY);
  assert.equal(defaults.queryCooldownMinutes, 24 * 60);

  const bounded = automationSearchBudgetPolicy({
    entityType: "EVENT",
    cadenceMinutes: 7 * 24 * 60,
    config: { maxQueriesPerRun: 999, dailyRequestCap: 999, queryCooldownMinutes: 5 },
  });
  assert.ok(bounded.queriesPerRun <= AUTOMATION_SEARCH_HARD_QUERIES_PER_RUN);
  assert.equal(bounded.rootDailyRequests, 20);
  assert.equal(bounded.queryCooldownMinutes, 7 * 24 * 60);
});

test("DISCOVERY-2B UTC day bucket is timezone stable", () => {
  assert.equal(utcSearchDayBucket(new Date("2026-09-26T23:59:59.000Z")), "2026-09-26");
  assert.equal(utcSearchDayBucket(new Date("2026-09-27T00:00:00.000Z")), "2026-09-27");
});

test("DISCOVERY-2B cooldowns distinguish provider errors and plateau", () => {
  const success = automationSearchCooldownUntil({
    at: "2026-09-26T10:00:00.000Z",
    status: "SUCCESS",
    baseCooldownMinutes: 1440,
    plateau: false,
  });
  const plateau = automationSearchCooldownUntil({
    at: "2026-09-26T10:00:00.000Z",
    status: "SUCCESS",
    baseCooldownMinutes: 1440,
    plateau: true,
  });
  assert.equal(success, "2026-09-27T10:00:00.000Z");
  assert.equal(plateau, "2026-09-30T10:00:00.000Z");
});

test("DISCOVERY-2B plateau requires repeated no-new-candidate runs with high duplicate ratio", () => {
  assert.equal(automationSearchPlateauSignal([
    { status: "SUCCESS", resultCount: 10, newUniqueCandidateCount: 0, duplicateCandidateCount: 9 },
    { status: "SUCCESS", resultCount: 10, newUniqueCandidateCount: 0, duplicateCandidateCount: 8 },
    { status: "EMPTY", resultCount: 0, newUniqueCandidateCount: 0, duplicateCandidateCount: 0 },
  ]), true);
  assert.equal(automationSearchPlateauSignal([
    { status: "SUCCESS", resultCount: 10, newUniqueCandidateCount: 1, duplicateCandidateCount: 9 },
    { status: "SUCCESS", resultCount: 10, newUniqueCandidateCount: 0, duplicateCandidateCount: 9 },
    { status: "SUCCESS", resultCount: 10, newUniqueCandidateCount: 0, duplicateCandidateCount: 9 },
  ]), false);
});

test("DISCOVERY-2B migration is additive, indexed, idempotent by operation key, and governance safe", () => {
  const migration = read("drizzle/0083_automation_search_budgets.sql");
  assert.match(migration, /CREATE TABLE `automation_search_usage`/);
  assert.match(migration, /automation_search_usage_operation_unique/);
  assert.match(migration, /day_bucket/);
  assert.match(migration, /query_fingerprint/);
  assert.match(migration, /new_unique_candidate_count/);
  assert.doesNotMatch(migration, /INSERT INTO (managed_events|directory_profiles|help_organizations|adoption_dogs|lost_found_dog_reports)/i);
});

test("DISCOVERY-2B runner reserves before provider calls and never activates or canonically writes", () => {
  const runner = read("lib/data-automation-discovery-runner.ts");
  assert.match(runner, /reserveAutomationSearchRequest/);
  assert.match(runner, /finalizeAutomationSearchUsage/);
  assert.match(runner, /searchOperationKey/);
  assert.doesNotMatch(runner, /setAutomationSourceEnabled|INSERT INTO automation_sources/i);
  assert.doesNotMatch(runner, /INSERT INTO (managed_events|directory_profiles|help_organizations|adoption_dogs|lost_found_dog_reports)/i);
});
