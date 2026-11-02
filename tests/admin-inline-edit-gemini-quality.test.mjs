import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("Gemini inline settings reuse the canonical allowlisted settings API without paid dispatch or STOP mutation", () => {
  const quick = read("components/admin-gemini-quick-settings.tsx");
  const detail = read("components/admin-gemini-automation-settings.tsx");
  const api = read("app/api/admin/gemini-automation/route.ts");
  const validation = read("lib/gemini-automation-admin-settings.ts");
  const css = read("components/admin-gemini-quick-settings.module.css");
  assert.match(quick, /method: "PUT"/);
  assert.match(quick, /\/api\/admin\/gemini-automation"/);
  assert.match(quick, /stable_key: item\.stableKey/);
  assert.match(quick, /cadence_minutes: cadence/);
  assert.match(quick, /max_new_concepts: maximum/);
  assert.match(quick, /onSaved\(result\.setting\)/);
  assert.match(quick, /Schváliť|Uložiť/);
  assert.match(quick, /hasUnsavedCategory/);
  assert.doesNotMatch(quick, /\/run"|\/control"|onPilotClick|manual-background/);
  assert.match(api, /requireAdminMutation\(request\)/);
  assert.match(api, /parseGeminiSettingsInput/);
  assert.match(validation, /Možno upraviť iba zapnutie, frekvenciu a počet konceptov/);
  assert.match(detail, /<AdminGeminiQuickSettings/);
  assert.match(detail, /key=\{selected\.stableKey \+ ":" \+ cardRevision\}/);
  assert.match(css, /max-width: 899px/);
  assert.match(css, /display: none/);
});

test("Quality direct correction is limited to reviewed public link and contact fields, with profile CAS", () => {
  const ui = read("components/admin-missing-quality-dashboard.tsx");
  const route = read("app/api/admin/data-quality/missing/[id]/route.ts");
  const store = read("lib/data-quality-missing-hourly.ts");
  const css = read("components/admin-missing-quality-dashboard.module.css");
  assert.match(ui, /\["web","social","phone","email"\]\.includes\(p\.field_group\)/);
  assert.match(ui, /editingProposalId===p\.id/);
  assert.match(ui, /Schváliť upravený údaj/);
  assert.match(ui, /Upraviť v tabuľke/);
  assert.match(ui, /body:JSON\.stringify\(\{action,\.\.\.\(action==="accept"/);
  assert.match(route, /requireAdminMutation\(request\)/);
  assert.match(route, /key!=="action"&&key!=="value"/);
  assert.match(route, /reviewMissingQualityProposal\(getQualityMissingDatabase\(\),Number\(id\),body\.action,auth\.user\.email,body\.value\)/);
  assert.match(store, /\["web","social","phone","email"\]\.includes\(f\.group\)/);
  assert.match(store, /approvedValue=corrected/);
  assert.match(store, /source_url=\?/);
  assert.match(store, /approvedValue===p\.value\?p\.source_url:null/);
  assert.match(store, /AND updated_at=\?/);
  assert.match(store, /status='OPEN'/);
  assert.match(store, /qualityMissingCandidateKey\(p\.value\)/);
  assert.match(css, /max-width:899px/);
  assert.match(css, /display:none!important/);
});
