import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const src = read("components/admin-organization-editor.tsx");
const css = read("components/admin-organization-editor.module.css");
const e2e = read("tests/e2e/admin-organization-publication.spec.ts");

const section = (id) => {
  const start = src.indexOf('<AdminEditorSection id="' + id + '"');
  assert.ok(start !== -1, "Missing " + id);
  const end = src.indexOf("</AdminEditorSection>", start);
  assert.ok(end > start, "Unclosed " + id);
  return src.slice(start, end);
};

test("EDITOR-15: organization editor uses one mounted form and four shared persistent panels", () => {
  const ids = ["organization-general", "organization-content", "organization-contacts", "organization-media"];
  const nav = src.match(/const sections = useMemo\(\(\) => \[[\s\S]*?\n  \], \[\]\)/)?.[0];
  assert.ok(nav);
  const listed = [...nav.matchAll(/id: "(organization-[^"]+)"/g)].map(x => x[1]);
  assert.deepEqual(listed, ids);
  assert.equal((src.match(/<AdminEditorSection id=/g) ?? []).length, 4);
  assert.equal((src.match(/<\/AdminEditorSection>/g) ?? []).length, 4);
  assert.equal((src.match(/<form\b/g) ?? []).length, 1);
  assert.equal((src.match(/<\/form>/g) ?? []).length, 1);
  assert.equal((src.match(/<AdminFormFeedback/g) ?? []).length, 1);
  assert.match(src, /<AdminEditorSectionVisibility\.Provider value=\{\{ activeId: activeOrganizationSection, mode: "switch" \}\}/);
  assert.match(src, /<AdminSharedEditorNavigation sections=\{sections\}/);
  assert.match(src, /layout="sidebar" mode="switch" ariaLabel="Sekcie editora organizácie"/);
  assert.match(src, /Prechod medzi sekciami organizácie/);
  assert.doesNotMatch(src, /AdminStickyEditorNavigation/);
  assert.match(css, /\[data-admin-editor-section\]\[hidden\]/);
  assert.match(css, /display: none !important/);
});

test("EDITOR-15: canonical identity, Lexical, public contact and image still use existing fields", () => {
  for (const f of ["organization-name", "organization-legal-name", "organization-slug", "organization-registration", "organization-type"])
    assert.ok(section("organization-general").includes('id="' + f + '"'), f);
  for (const f of ["organization-short-description", "organization-description"])
    assert.ok(section("organization-content").includes('id="' + f + '"'), f);
  for (const f of ["organization-email", "organization-phone", "organization-web", "organization-facebook", "organization-instagram"])
    assert.ok(section("organization-contacts").includes('id="' + f + '"'), f);
  assert.ok(section("organization-media").includes('id="organization-source"'));
  assert.ok(section("organization-media").includes("AdminSingleImageUpload"));
  assert.ok(section("organization-content").includes("AdminLexicalTextField"));
  assert.ok(section("organization-media").includes("Upraviť zobrazenie"));
  assert.match(src, /<ImageDisplayEditor/);
  assert.match(src, /<AdminAutomationUpdateSuggestions/);
  assert.match(src, /<EditorUnsavedChangesGuard active=\{dirty\}/);
});

test("EDITOR-15: hidden-field validation, archived read-only and save concurrency stay safe", () => {
  assert.match(src, /return <form noValidate/);
  assert.match(src, /control\.willValidate && !control\.checkValidity\(\)/);
  assert.match(src, /invalid\.closest\("\[data-admin-editor-section\]"\)/);
  assert.match(src, /setActiveOrganizationSection\(owner\?\.id/);
  assert.match(src, /const archived = organization\?\.status === "ARCHIVED"/);
  assert.match(src, /editingDisabled = !hydrated \|\| archived \|\| saving \|\| uploading/);
  assert.match(src, /if \(archived \|\| mutationPending\.current \|\| uploading\) return/);
  assert.match(src, /method: organization \? "PUT" : "POST"/);
  assert.match(src, /expectedUpdatedAt/);
  assert.match(src, /router\.replace\(\`\/admin\/organizacie\/\$\{body\.item\.id\}\`\)/);
  assert.match(src, /setDraft\(\(current\) => JSON\.stringify\(current\) === submittedSnapshot/);
  assert.match(src, /<AdminEditorFooter dirty=\{dirty\} pending=\{saving\}/);
  assert.ok(e2e.includes('showOrganizationSection(page, "organization-content"'));
  assert.ok(e2e.includes('showOrganizationSection(page, "organization-contacts"'));
  assert.ok(e2e.includes('showOrganizationSection(page, "organization-media"'));
});
