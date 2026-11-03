import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  buildOwnerDecisionRequest,
  OWNER_DECISION_OPTIONS,
} from "../lib/visual-library-owner-decision.ts";

const left = {
  id: "magazine",
  title: "Fotografický promo banner",
  paths: ["components/public-visual-system/public-magazine-banner.tsx"],
  routes: ["/clanky/[slug]", "/plemena"],
  knownUses: [{
    url: "https://psipedia.sk/plemena",
    placement: "Kluby plemien",
    anchorId: "kluby",
    evidence: "verified-in-code",
  }],
};
const right = {
  id: "context",
  title: "Informačný banner",
  paths: ["components/public-visual-system/public-context-banner.tsx"],
  routes: ["/adresar/[category]"],
  knownUses: [{
    url: "https://psipedia.sk/adresar",
    placement: "Informácie",
    evidence: "verified-in-code",
  }],
};

const make = (decision, notes = "") => buildOwnerDecisionRequest({
  left, right, decision, notes, leftVariant: "Banner Veterinári",
  rightVariant: "Banner s fotografiou",
});

test("all owner decisions are distinct and cover the full expected workflow", () => {
  const keys = OWNER_DECISION_OPTIONS.map((option) => option.value);
  assert.deepEqual(keys, ["use-left", "use-right", "new-shared", "already-shared", "keep-separate"]);
  assert.equal(new Set(keys).size, 5);
});

test("a merge choice includes both identities, verified placements, candidates and explicit safeguards", () => {
  const task = make("use-left", "Zachovaj text A, tlačidlo B.");
  assert.match(task, /Rozhodnutie: Zjednotiť podľa A/);
  assert.match(task, /Banner Veterinári/);
  assert.match(task, /Banner s fotografiou/);
  assert.match(task, /https:\/\/psipedia\.sk\/plemena#kluby/);
  assert.match(task, /https:\/\/psipedia\.sk\/adresar/);
  assert.match(task, /kandidátska šablóna \(nie overená URL\): \/clanky\/\[slug\]/);
  assert.match(task, /Zachovaj text A, tlačidlo B/);
  assert.match(task, /samostatný PR/);
  assert.match(task, /mobilný dizajn bez nevyžiadaných zmien/);
  assert.match(task, /nie je automatické schválenie merge/);
});

test("keep-separate and already-shared decisions never request duplicate deletion", () => {
  const separate = make("keep-separate");
  const shared = make("already-shared");
  assert.match(separate, /Nemeníme zdrojové komponenty/);
  assert.doesNotMatch(separate, /odstráň zbytočné kópie/);
  assert.match(shared, /Ak áno, nemaž nič/);
  assert.doesNotMatch(shared, /odstráň zbytočné kópie/);
});

test("same logical group and missing decisions cannot create a merge task", () => {
  assert.equal(buildOwnerDecisionRequest({
    left, right: left, decision: "use-right", leftVariant: "A", rightVariant: "B",
  }), "");
  assert.equal(buildOwnerDecisionRequest({
    left, right, decision: "invalid-choice", leftVariant: "A", rightVariant: "B",
  }), "");
});

test("visual comparison uses real component previews and local decision only", () => {
  const compare = readFileSync("components/admin-visual-library-owner-compare.tsx", "utf8");
  const catalog = readFileSync("components/admin-visual-library-visual-catalog.tsx", "utf8");
  assert.match(compare, /<AdminComponentVisualPreview id=\{sample\.id\}/);
  assert.match(compare, /<PublicMagazineBanner/);
  assert.match(compare, /example\.preview/);
  assert.match(compare, /buildOwnerDecisionRequest/);
  assert.match(compare, /OWNER_DECISION_OPTIONS/);
  assert.match(compare, /Skopírovať rozhodnutie pre ChatGPT/);
  assert.match(compare, /Uložiť rozhodnutie do administrácie/);
  assert.match(compare, /Uložené rozhodnutia/);
  assert.match(catalog, /AdminVisualLibraryOwnerCompare/);
  assert.match(catalog, /openCompare\(item\.id\)/);
  assert.match(compare, /method: "PUT"/);
  assert.doesNotMatch(compare, /method:\s*"(POST|PATCH|DELETE)"|DB\.prepare|cloudflare:workers/);
});
