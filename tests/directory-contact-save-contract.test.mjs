import test from "node:test";
import assert from "node:assert/strict";
import { scopeAdminContactSave, DIRECTORY_CONTACT_SAVE_FIELDS } from "../lib/directory-contact-save-contract.ts";

const original = {
  websiteUrl: "darcyx", publicPhone: "darcyx", publicEmail: "darcyx",
  facebookUrl: "darcyx", instagramUrl: "darcyxasdfx",
};
const request = (changes = {}) => ({
  editedPaths: ["websiteUrl", "publicPhone", "publicEmail", "facebookUrl", "instagramUrl"],
  interactedFields: [],
  originalValues: { ...original },
  currentValues: { ...original },
  submitted: { ...original, ...changes },
});

test("stale whole-form dirty diffs cannot erase any of the five untouched contacts", () => {
  const result = scopeAdminContactSave(request(Object.fromEntries(
    DIRECTORY_CONTACT_SAVE_FIELDS.map(field => [field, ""]),
  )));
  assert.deepEqual(result.editedPaths, []);
  assert.deepEqual(result.explicitClears, []);
  assert.deepEqual(result.conflicts, []);
  assert.equal(result.incompatible, false);
});

test("editing one contact preserves the other four, even when the old form has blank values", () => {
  const result = scopeAdminContactSave({
    ...request({ websiteUrl: "", publicPhone: "", publicEmail: "",
      facebookUrl: "", instagramUrl: "nový text bez https @" }),
    interactedFields: ["instagramUrl"],
  });
  assert.deepEqual(result.editedPaths, ["instagramUrl"]);
  assert.deepEqual(result.explicitClears, []);
  assert.deepEqual(result.conflicts, []);
});

test("explicitly clearing a phone is allowed only with matching live D1 baseline", () => {
  const result = scopeAdminContactSave({
    ...request({ publicPhone: "" }), interactedFields: ["publicPhone"],
  });
  assert.deepEqual(result.editedPaths, ["publicPhone"]);
  assert.deepEqual(result.explicitClears, ["publicPhone"]);
});

test("newer D1 contact edit blocks stale Admin overwrite and deletion", () => {
  const result = scopeAdminContactSave({
    ...request({ publicEmail: "" }),
    interactedFields: ["publicEmail"],
    currentValues: { ...original, publicEmail: "nový e-mail z D1" },
  });
  assert.deepEqual(result.conflicts, ["publicEmail"]);
});

test("missing interaction receipt from an outdated editor cannot save contacts", () => {
  const result = scopeAdminContactSave({
    ...request({ websiteUrl: "" }),
    interactedFields: undefined,
  });
  assert.equal(result.incompatible, true);
});

test("last input keystroke is recovered even when React dirty paths lag", () => {
  const result = scopeAdminContactSave({
    ...request({ facebookUrl: "posledný znak" }),
    editedPaths: [],
    interactedFields: ["facebookUrl"],
  });
  assert.deepEqual(result.editedPaths, ["facebookUrl"]);
  assert.deepEqual(result.conflicts, []);
});

test("unchanged contact after a newer D1 update cannot silently overwrite it", () => {
  const result = scopeAdminContactSave({
    ...request(),
    currentValues: { ...original, websiteUrl: "novší web" },
  });
  assert.deepEqual(result.editedPaths, []);
});

test("idempotent retry accepts value already committed to D1", () => {
  const result = scopeAdminContactSave({
    ...request({ publicEmail: "x" }), interactedFields: ["publicEmail"],
    currentValues: { ...original, publicEmail: "x" },
  });
  assert.deepEqual(result.conflicts, []);
  assert.deepEqual(result.editedPaths, ["publicEmail"]);
});
