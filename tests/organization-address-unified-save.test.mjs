import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const editor = read("components/admin-organization-editor.tsx");
const address = read("components/admin-organization-locations.tsx");
const page = read("app/admin/organizacie/[id]/page.tsx");

test("ORG-ADDRESS: address is section three of the existing five-section editor", () => {
  assert.equal((editor.match(/<AdminEditorSection id=/g) ?? []).length, 5);
  const ids = ["organization-general", "organization-content", "organization-location-panel", "organization-contacts", "organization-media"];
  let cursor = 0;
  for (const id of ids) {
    const next = editor.indexOf('{ id: "' + id + '"', cursor);
    assert.ok(next >= cursor, "section order: " + id);
    cursor = next + 1;
  }
  assert.ok(editor.includes('<AdminOrganizationLocations draft={addressDraft} disabled={editingDisabled}'));
  assert.ok(editor.includes('<AdminProfileGoogleMaps'));
  assert.ok(page.includes('initialLocations={locations}'));
  assert.ok(!page.includes('<AdminOrganizationLocations'));
  assert.ok(!page.includes('<AdminProfileGoogleMaps'));
});

test("ORG-ADDRESS: one submit saves only changed canonical/location data in the safe order", () => {
  assert.ok(!address.includes("<form"));
  assert.ok(!address.includes("Uložiť adresu"));
  assert.ok(!address.includes("fetch("));
  assert.ok(editor.includes('const addressDirty = addressSnapshot !== savedAddressSnapshot;'));
  assert.ok(editor.includes('const dirty = editorSnapshot !== savedSnapshot || addressDirty;'));
  const before = editor.indexOf("if (!organizationId || organizationChanged)");
  const after = editor.indexOf("if (addressChanged)", before);
  assert.ok(before > 0 && after > before);
  assert.ok(editor.includes('method: organizationId ? "PUT" : "POST"'));
  assert.ok(editor.includes('method: location ? "PUT" : "POST"'));
  assert.ok(editor.includes('if (!organization) createdOrganizationId.current = organizationId;'));
  assert.ok(editor.includes('setSavedAddressSnapshot(JSON.stringify(savedAddress));'));
  assert.ok(editor.includes('if (savingAddress) {'));
  assert.ok(editor.includes('setActiveOrganizationSection("organization-location-panel");'));
  assert.ok(editor.includes('router.replace(`/admin/organizacie/${organizationId}`)'));
  assert.ok(editor.indexOf("if (addressChanged)") < editor.indexOf("router.replace(`/admin/organizacie/${organizationId}`)"));
});

test("ORG-ADDRESS: map stays manual and is disabled by unsaved fields", () => {
  assert.ok(editor.includes('dirty ? ('));
  assert.ok(editor.includes('Pred zmenou Google miesta ulož rozpracované údaje'));
  assert.ok(editor.includes('targetType="ORGANIZATION_LOCATION"'));
  assert.ok(editor.includes('targetId={location.id}'));
  assert.ok(editor.includes('<AdminOrganizationLocations draft={addressDraft}'));
  assert.ok(editor.includes('Uložiť organizáciu'));
  assert.ok(!address.includes('Uložiť adresu'));
  assert.ok(!address.includes("GooglePlace"));
  assert.ok(!editor.includes("wrangler d1"));
});
