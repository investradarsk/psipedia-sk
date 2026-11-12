import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  organizationAdminReadText,
  resolveOrganizationEditorReads,
} from "../lib/organization-admin-read-state.ts";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const profile = { id: 128, name: "Organizácia č. 128" };
const location = { id: 9, organizationId: 128, city: "Nitra" };
const fulfilled = value => ({ status: "fulfilled", value });
const rejected = reason => ({ status: "rejected", reason });

test("missing canonical organization is 404 even if the independent location read failed", () => {
  assert.equal(resolveOrganizationEditorReads(fulfilled(null), rejected(Error("D1 locations timeout"))), null);
  assert.equal(resolveOrganizationEditorReads(fulfilled(null), fulfilled([])), null);
});

test("an existing organization NEVER substitutes an empty address after a failed D1 read", () => {
  const original = Error("D1 locations timeout");
  assert.throws(
    () => resolveOrganizationEditorReads(fulfilled(profile), rejected(original)),
    error => error === original,
  );
  const result = resolveOrganizationEditorReads(fulfilled(profile), fulfilled([location]));
  assert.equal(result.organization, profile);
  assert.deepEqual(result.locations, [location]);
});

test("failed canonical read is an error, not a fake not-found record", () => {
  const original = Error("D1 canonical unavailable");
  assert.throws(
    () => resolveOrganizationEditorReads(rejected(original), fulfilled([])),
    error => error === original,
  );
});

test("legacy nullable organization text decodes without modifying its source", () => {
  assert.equal(organizationAdminReadText(null), "");
  assert.equal(organizationAdminReadText(undefined), "");
  assert.equal(organizationAdminReadText(128), "");
  assert.equal(organizationAdminReadText("Nitra"), "Nitra");
  const row = { city: null, description: null };
  assert.equal(organizationAdminReadText(row.city), "");
  assert.equal(organizationAdminReadText(row.description), "");
  assert.deepEqual(row, { city: null, description: null }, "read-only projection must not write database fields");
  const store = read("lib/help-organization-admin-store.ts");
  assert.match(store, /organizationAdminReadText\(row\.short_description\)/);
  assert.match(store, /organizationAdminReadText\(row\.resolved_city\)/);
  assert.match(store, /name: organizationAdminReadText\(row\.name\)/);
  assert.match(store, /slug: organizationAdminReadText\(row\.slug\)/);
  assert.match(store, /if \(!isOrganizationPublicationStatus\(row\.status\)\)/,
    "invalid lifecycle values must fail explicitly");
});

test("organization detail strictly validates IDs and distinguishes loading, 404 and error", () => {
  const page = read("app/admin/organizacie/[id]/page.tsx");
  const loading = read("app/admin/organizacie/[id]/loading.tsx");
  const notFound = read("app/admin/organizacie/[id]/not-found.tsx");
  const error = read("app/admin/organizacie/[id]/error.tsx");
  assert.match(page, /!\/\^\[1-9\]\[0-9\]\*\$\/\.test\(id\)/);
  assert.match(page, /Number\.isSafeInteger\(organizationId\)/);
  assert.match(page, /await requireAdminPageUser\(/);
  assert.match(page, /await Promise\.allSettled\(\[/);
  assert.match(page, /resolveOrganizationEditorReads\(organizationResult, locationsResult\)/);
  assert.match(page, /if \(!resolved\) notFound\(\)/);
  assert.match(loading, /<AdminDataLoading label="Detail organizácie a potvrdená adresa"/);
  assert.match(notFound, /Organizácia sa nenašla/);
  assert.match(error, /title="Detail organizácie sa nepodarilo načítať"/);
  assert.match(error, /backHref="\/admin\/organizacie"/);
  assert.doesNotMatch(error, /error\.message/);
});

test("optional failures are recoverable without replacing an editable form with empty data", () => {
  const page = read("app/admin/organizacie/[id]/page.tsx");
  const suggestions = read("components/admin-organization-suggestions.tsx");
  const optional = read("components/admin-recovery-actions.tsx");
  for (const message of [
    "Stav redakčnej kontroly sa nepodarilo načítať.",
    "Kontrola duplicít je dočasne nedostupná.",
    "Fundraising sa nepodarilo načítať.",
  ]) assert.ok(page.includes(message), message);
  assert.match(page, /<AdminOptionalReadError/);
  assert.match(suggestions, /<AdminOptionalReadError/);
  assert.match(optional, /document\.documentElement\.hasAttribute\("data-admin-unsaved-editor"\)/);
  assert.match(optional, /startTransition\(\(\) => router\.refresh\(\)\)/);
  assert.match(optional, /type="button"/);
  assert.match(optional, /Najprv ulož rozpracované údaje/);
  assert.match(page, /listOrganizationFundraisingMethodsAdmin\(organization\.id\)/);
  assert.doesNotMatch(page, /initialMethods=\{\[\]\}/,
    "no editable empty fundraising collection after a failed fetch");
});

test("Admin render failure has explicit guarded reset/reload and safe escape links", () => {
  const root = read("app/admin/error.tsx");
  const recovery = read("components/admin-recovery-actions.tsx");
  assert.match(root, /<AdminErrorRecovery error=\{error\} reset=\{reset\}/);
  assert.match(root, /admin_route_render_failed/);
  assert.match(recovery, /const request = \(action: "reset" \| "reload"\)/);
  assert.match(recovery, /setConfirmation\(action\)/);
  assert.match(recovery, /Zahodiť zmeny a pokračovať/);
  assert.match(recovery, /window\.location\.reload\(\)/);
  assert.match(recovery, /startRecovery\(\(\) => reset\(\)\)/);
  assert.match(recovery, /target="_blank" rel="noopener noreferrer" prefetch=\{false\}/);
  assert.doesNotMatch(recovery, /onClick=\{\(\) => reset\(\)\}/);
  assert.doesNotMatch(recovery, /error\.message/);
});
