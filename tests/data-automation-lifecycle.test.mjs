import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readFile as readFileAsync } from "node:fs/promises";
import test from "node:test";
import { trnavaAdoptionDetailAdapter } from "../lib/data-automation-adoption-adapters.ts";
import { zatulanePsikySalaFosterDetailAdapter } from "../lib/data-automation-foster-adapters.ts";
import { kosiceFoundDogDetailAdapter } from "../lib/data-automation-lost-found-adapters.ts";
import {
  automationLifecycleCanApply,
  automationLifecycleFingerprint,
  normalizeAutomationLifecycleSignals,
  stripAutomationLifecycleFields,
} from "../lib/data-automation-lifecycle.ts";

const read = (path) => readFileAsync(new URL("../" + path, import.meta.url), "utf8");

function record(overrides = {}) {
  return {
    sourceRecordId: "https://source.example/item/1",
    sourceUrl: "https://source.example/item/1",
    sourceTimestamp: "2026-09-28T18:00:00.000Z",
    rawRecord: {},
    proposed: {},
    ...overrides,
  };
}

test("EVENT explicit cancellation becomes lifecycle signal while content diff stays independent", () => {
  const input = record({
    rawRecord: { title: "Agility preteky — ZRUŠENÉ" },
    proposed: { title: "Agility preteky", status: "CANCELLED", cancelled: true, description: "Nový opis" },
  });
  const signals = normalizeAutomationLifecycleSignals("EVENT", input);
  assert.deepEqual(signals.map((item) => [item.signalType, item.targetState]), [["EVENT_CANCELLED", "CANCELLED"]]);
  const content = stripAutomationLifecycleFields("EVENT", input.proposed, signals);
  assert.equal(Object.hasOwn(content, "cancelled"), false);
  assert.equal(Object.hasOwn(content, "status"), false);
  assert.equal(content.description, "Nový opis");
});

test("EVENT postponed/date changes are never normalized as cancellation", () => {
  for (const status of ["POSTPONED", "DATE_CHANGED", "VENUE_CHANGED"]) {
    const input = record({ rawRecord: { status }, proposed: { status, cancelled: false } });
    assert.deepEqual(normalizeAutomationLifecycleSignals("EVENT", input), []);
    assert.equal(stripAutomationLifecycleFields("EVENT", input.proposed, []).status, status);
  }
});

test("ADOPTION uses explicit adopted/reserved evidence and respects domain transitions", () => {
  const adopted = record({
    rawRecord: { adopted: true, adoptedEvidence: "Adoptovaný" },
    proposed: { name: "Rex" },
  });
  assert.equal(normalizeAutomationLifecycleSignals("ADOPTION", adopted)[0]?.signalType, "ADOPTION_ADOPTED");
  assert.equal(automationLifecycleCanApply("ADOPTION", { status: "ACTIVE" }, "ADOPTED"), true);
  assert.equal(automationLifecycleCanApply("ADOPTION", { status: "RESERVED" }, "ADOPTED"), true);
  assert.equal(automationLifecycleCanApply("ADOPTION", { status: "DRAFT" }, "ADOPTED"), false);

  const reserved = record({
    rawRecord: { reserved: true, reservedEvidence: "Rezervovaný" },
    proposed: { name: "Rex" },
  });
  assert.equal(normalizeAutomationLifecycleSignals("ADOPTION", reserved)[0]?.signalType, "ADOPTION_RESERVED");
  assert.equal(automationLifecycleCanApply("ADOPTION", { status: "ACTIVE" }, "RESERVED"), true);
});

test("FOSTER resolved signal is split from normal content update", () => {
  const input = record({
    rawRecord: { resolved: true, resolvedEvidence: "Adoptovaný" },
    proposed: { title: "Bella", resolved: true, description: "Aktualizovaný text" },
  });
  const signals = normalizeAutomationLifecycleSignals("FOSTER", input);
  assert.equal(signals[0]?.signalType, "FOSTER_RESOLVED");
  const content = stripAutomationLifecycleFields("FOSTER", input.proposed, signals);
  assert.equal(Object.hasOwn(content, "resolved"), false);
  assert.equal(content.description, "Aktualizovaný text");
});

test("LOST_FOUND type FOUND alone is not a resolution signal", () => {
  const found = record({
    rawRecord: { resolvedSignal: false },
    proposed: { type: "FOUND", dogName: "Rex" },
  });
  assert.deepEqual(normalizeAutomationLifecycleSignals("LOST_FOUND", found), []);

  const resolved = record({
    rawRecord: { resolvedSignal: true, resolvedEvidence: "Majiteľ bol dohľadaný" },
    proposed: { type: "FOUND", dogName: "Rex" },
  });
  assert.equal(normalizeAutomationLifecycleSignals("LOST_FOUND", resolved)[0]?.signalType, "LOST_FOUND_RESOLVED");
  assert.equal(automationLifecycleCanApply("LOST_FOUND", { status: "ACTIVE" }, "RESOLVED"), true);
  assert.equal(automationLifecycleCanApply("LOST_FOUND", { status: "PENDING" }, "RESOLVED"), false);
  assert.equal(automationLifecycleCanApply("LOST_FOUND", { status: "DRAFT" }, "RESOLVED"), false);
});

test("absence or one missed run cannot synthesize a lifecycle signal", () => {
  assert.deepEqual(normalizeAutomationLifecycleSignals("ADOPTION", record({ proposed: { name: "Rex" } })), []);
  assert.deepEqual(normalizeAutomationLifecycleSignals("FOSTER", record({ proposed: { title: "Bella" } })), []);
  assert.deepEqual(normalizeAutomationLifecycleSignals("LOST_FOUND", record({ proposed: { type: "LOST" } })), []);
});

test("lifecycle fingerprint changes when material evidence changes", async () => {
  const base = {
    source: { sourceKey: "example-feed" },
    record: {
      sourceRecordId: "rex",
      sourceUrl: "https://source.example/rex",
      sourceTimestamp: "2026-09-28T18:00:00.000Z",
    },
    entityType: "ADOPTION",
    canonicalEntityId: 12,
  };
  const first = await automationLifecycleFingerprint({
    ...base,
    signal: { signalType: "ADOPTION_ADOPTED", targetState: "ADOPTED", evidenceText: "Adoptovaný", confidenceClass: "EXPLICIT" },
  });
  const sameEvidenceLater = await automationLifecycleFingerprint({
    ...base,
    record: { ...base.record, sourceTimestamp: "2026-09-29T18:00:00.000Z" },
    signal: { signalType: "ADOPTION_ADOPTED", targetState: "ADOPTED", evidenceText: "Adoptovaný", confidenceClass: "EXPLICIT" },
  });
  const second = await automationLifecycleFingerprint({
    ...base,
    signal: { signalType: "ADOPTION_ADOPTED", targetState: "ADOPTED", evidenceText: "Rex bol adoptovaný 28. 9. 2026.", confidenceClass: "EXPLICIT" },
  });
  assert.equal(first.fingerprint, sameEvidenceLater.fingerprint);
  assert.notEqual(first.fingerprint, second.fingerprint);
});

test("runner persists lifecycle and generic content findings independently without lifecycle notifications", async () => {
  const runner = await read("lib/data-automation-runner.ts");
  const lifecycleBlock = runner.match(/async function processAutomationLifecycleSignals[\s\S]*?\n}\n\nfunction automationResultFindingCounts/)?.[0] ?? "";
  assert.match(lifecycleBlock, /upsertAutomationFinding/);
  assert.match(lifecycleBlock, /resolveSatisfiedAutomationLifecycleSuggestions/);
  assert.doesNotMatch(lifecycleBlock, /maybeQueueHighPriorityNotification/);
  assert.match(runner, /stripAutomationLifecycleFields\(source\.entityType, proposedForFinding, lifecycle\.signals\)/);
  assert.match(runner, /classifyAutomationFinding\(\{ match, proposed: contentProposal \}\)/);
  assert.match(runner, /newFindingCount: lifecycle\.newFindingCount \+ \(result\.created \|\| result\.reopened \? 1 : 0\)/);
});

test("lifecycle apply delegates to current domain transition authorities", async () => {
  const apply = await read("lib/data-automation-lifecycle-apply.ts");
  assert.match(apply, /transitionManagedEventCancellation/);
  assert.match(apply, /transitionManagedAdoptionStatus/);
  assert.match(apply, /transitionManagedHelpCaseResolved/);
  assert.match(apply, /transitionAdminDogReportStatus/);
  assert.match(apply, /canTransitionAdoptionStatus/);
  assert.match(apply, /canTransitionLostFoundStatus/);
  assert.doesNotMatch(apply, /UPDATE\s+adoption_dogs/i);
  assert.doesNotMatch(apply, /UPDATE\s+managed_events/i);
  assert.doesNotMatch(apply, /UPDATE\s+help_cases/i);
  assert.doesNotMatch(apply, /UPDATE\s+lost_found_dog_reports/i);
});

test("EVENT and FOSTER lifecycle domain helpers preserve publication status", async () => {
  const [events, help] = await Promise.all([
    read("lib/event-store.ts"),
    read("lib/help-store.ts"),
  ]);
  const eventTransition = events.match(/export async function transitionManagedEventCancellation[\s\S]*?\n}\n\nexport async function createManagedEvent/)?.[0] ?? "";
  assert.match(eventTransition, /SET cancelled=\?,updated_at=\?,updated_by=\?/);
  assert.doesNotMatch(eventTransition, /SET status=/);
  const fosterTransition = help.match(/export async function transitionManagedHelpCaseResolved[\s\S]*?\n}\n\nexport async function createManagedHelpCase/)?.[0] ?? "";
  assert.match(fosterTransition, /SET resolved=\?,updated_at=\?,updated_by=\?/);
  assert.doesNotMatch(fosterTransition, /SET status=/);
});

test("API is same-origin admin-only and stored suggestion is target authority", async () => {
  const [route, apply] = await Promise.all([
    read("app/api/admin/automation-lifecycle/[id]/route.ts"),
    read("lib/data-automation-lifecycle-apply.ts"),
  ]);
  assert.match(route, /requireAdminMutation\(request\)/);
  assert.match(route, /expectedFingerprint/);
  assert.doesNotMatch(route, /body\.(?:targetState|targetStatus)/);
  assert.doesNotMatch(apply, /input\.(?:targetState|targetStatus)/);
  assert.match(apply, /hasNewerAutomationLifecycleEvidence/);
  assert.match(apply, /lifecycleAuditNote/);
  assert.match(apply, /previousState/);
});

test("legacy explicit lifecycle rows are normalized, but generic update UX excludes lifecycle rows", async () => {
  const [store, product] = await Promise.all([
    read("lib/data-automation-lifecycle-store.ts"),
    read("lib/data-automation-product-store.ts"),
  ]);
  assert.match(store, /POSSIBLE_CANCELLED/);
  assert.match(store, /ADOPTED','RESERVED/);
  assert.match(store, /json_extract\(f\.proposed_json,'\$\.resolved'\)=1/);
  assert.match(product, /json_extract\(proposed_json,'\$\.lifecycleVersion'\)=1/);
});

test("review UI has contextual actions, canonical/source links and no bulk accept", async () => {
  const ui = await read("components/admin-automation-lifecycle-review.tsx");
  assert.match(ui, /aria-label=\{suggestion\.actionLabel\}/);
  assert.match(ui, /Otvoriť zdroj ↗/);
  assert.match(ui, /Otvoriť canonical záznam/);
  assert.match(ui, /Pokročilé/);
  assert.doesNotMatch(ui, /Potvrdiť všetky|bulk accept/i);
});


test("real ADOPTION adapter emits adopted/reserved lifecycle signals outside canonical proposal", () => {
  const baseHtml = \`
    <html><body>
      <h1>Triny</h1>
      <div>Pohlavie: fenka</div>
      <div>Vek: 6 rokov 3 mesiace</div>
      <div>Rasa: Cane Corso</div>
      <div>Veľkosť: 55 cm</div>
      <div>Váha: 31,5 kg</div>
      <div>Farba: hnedá</div>
      <div>Kastrácia: Áno</div>
      <div>Očkovaný: Áno</div>
      <div>Hendikep: Nie</div>
      <p>V prípade záujmu o adopciu nás kontaktujte.</p>
    </body></html>
  \`;
  const source = {
    id: 901,
    entityType: "ADOPTION",
    connectorType: "CONTROLLED_HTML",
    sourceUrl: "https://trnava.utulok.sk/psy/triny",
    config: { sourceShape: "SINGLE_ITEM", htmlAdapterKey: "trnava-adoption-detail", expectedMinRecords: 1 },
    maxRecordsPerRun: 10,
    timeoutMs: 5000,
    retryMaxAttempts: 0,
    retryBackoffMs: 100,
    throttleMs: 0,
  };

  const [adopted] = trnavaAdoptionDetailAdapter({
    html: baseHtml.replace("<h1>Triny</h1>", "<h1>Triny</h1><strong>Adoptovaný</strong>"),
    source,
  });
  assert.equal(adopted.rawRecord.adopted, true);
  assert.equal(adopted.lifecycleSignals?.[0]?.signalType, "ADOPTION_ADOPTED");
  assert.equal(adopted.lifecycleSignals?.[0]?.targetState, "ADOPTED");
  assert.equal(Object.hasOwn(adopted.proposed, "status"), false);

  const [reserved] = trnavaAdoptionDetailAdapter({
    html: baseHtml.replace("<h1>Triny</h1>", "<h1>Triny</h1><strong>Rezervovaný</strong>"),
    source,
  });
  assert.equal(reserved.rawRecord.reserved, true);
  assert.equal(reserved.lifecycleSignals?.[0]?.signalType, "ADOPTION_RESERVED");
  assert.equal(reserved.lifecycleSignals?.[0]?.targetState, "RESERVED");
  assert.equal(Object.hasOwn(reserved.proposed, "status"), false);
});

test("real FOSTER adapter keeps explicit resolved lifecycle separate from proposal semantics", () => {
  const fixture = readFileSync(
    new URL("./fixtures/data-automation/zatulane-psiky-sala-foster-detail.html", import.meta.url),
    "utf8",
  );
  const source = {
    id: 951,
    entityType: "FOSTER",
    connectorType: "CONTROLLED_HTML",
    sourceUrl: "https://www.zatulanepsikysala.sk/pomoc/markyz/",
    config: { sourceShape: "SINGLE_ITEM", htmlAdapterKey: "zatulane-psiky-sala-foster-detail", expectedMinRecords: 1 },
    maxRecordsPerRun: 1,
    timeoutMs: 5000,
    retryMaxAttempts: 0,
    retryBackoffMs: 100,
    throttleMs: 0,
  };
  const [resolved] = zatulanePsikySalaFosterDetailAdapter({
    html: fixture.replace("<h1>Markýz</h1>", "<h1>Markýz – adoptovaný</h1>"),
    source,
  });
  assert.equal(resolved.rawRecord.resolved, true);
  assert.equal(resolved.lifecycleSignals?.[0]?.signalType, "FOSTER_RESOLVED");
  assert.equal(resolved.lifecycleSignals?.[0]?.targetState, "RESOLVED");
});

test("real LOST_FOUND adapter emits resolution only from explicit owner-resolution evidence", () => {
  const fixture = readFileSync(
    new URL("./fixtures/data-automation/kosice-found-dog-detail.html", import.meta.url),
    "utf8",
  );
  const source = {
    id: 903,
    entityType: "LOST_FOUND",
    connectorType: "CONTROLLED_HTML",
    sourceUrl: "https://www.kosice.sk/clanok/opusteny-pes-225",
    config: { sourceShape: "SINGLE_ITEM", htmlAdapterKey: "kosice-found-dog-detail", expectedMinRecords: 1 },
    maxRecordsPerRun: 10,
    timeoutMs: 5000,
    retryMaxAttempts: 0,
    retryBackoffMs: 100,
    throttleMs: 0,
  };
  const [plain] = kosiceFoundDogDetailAdapter({ html: fixture, source });
  assert.equal(plain.rawRecord.resolvedSignal, false);
  assert.equal(plain.lifecycleSignals, undefined);

  const [resolved] = kosiceFoundDogDetailAdapter({
    html: fixture.replace("Pes nebol označený čipom", "Majiteľ bol dohľadaný. Pes nebol označený čipom"),
    source,
  });
  assert.equal(resolved.rawRecord.resolvedSignal, true);
  assert.equal(resolved.lifecycleSignals?.[0]?.signalType, "LOST_FOUND_RESOLVED");
  assert.equal(resolved.lifecycleSignals?.[0]?.targetState, "RESOLVED");
  assert.equal(Object.hasOwn(resolved.proposed, "status"), false);
});
