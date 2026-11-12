import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const editor = read("components/admin-event-editor.tsx");

function section(id) {
  const start = editor.indexOf('<EditorSection id="' + id + '"');
  assert.notEqual(start, -1, "Missing section: " + id);
  const end = editor.indexOf("</EditorSection>", start);
  assert.ok(end > start, "Unclosed section: " + id);
  return editor.slice(start, end);
}

test("EDITOR-11: exactly seven panels have an intentional single-section information architecture", () => {
  const expected = [
    ["event-basics", "Základné údaje"],
    ["event-schedule", "Termín a typ"],
    ["event-location", "Miesto podujatia"],
    ["event-contacts", "Organizátor a kontakty"],
    ["event-details", "Program a informácie"],
    ["event-media", "Fotografia a URL"],
    ["event-seo", "SEO"],
  ];
  const navigation = editor.match(/const EVENT_SECTIONS:[\s\S]*?\n\];/)?.[0];
  assert.ok(navigation);
  const actual = [...navigation.matchAll(/\{ id: "([^"]+)", label: "([^"]+)" \}/g)]
    .map((match) => [match[1], match[2]]);
  assert.deepEqual(actual, expected);
  assert.equal((editor.match(/<EditorSection id="event-/g) ?? []).length, 7);
  assert.equal((editor.match(/<\/EditorSection>/g) ?? []).length, 7);
  assert.match(editor, /sectionMode="switch"/);
  assert.match(editor, /onSectionChange=\{setActiveEventSection\}/);
  assert.match(editor, /EVENT_SECTIONS\[activeEventSectionIndex \+ 1\]/);
  assert.match(editor, /pagerFocusTargetRef\.current = id/);
  assert.match(editor, /panel\.focus\(\{ preventScroll: true \}\)/);
});

test("EDITOR-11: organizer/contact, program/fee and location controls live in independent panels", () => {
  const expectIds = (name, ids) => {
    const html = section(name);
    for (const id of ids) assert.ok(html.includes('id="' + id + '"'), id + " missing from " + name);
  };
  expectIds("event-basics", ["event-title", "event-excerpt"]);
  expectIds("event-schedule", ["event-type", "event-start-date", "event-start-time", "event-end-date", "event-end-time"]);
  expectIds("event-location", ["event-region", "event-city", "event-venue", "event-address", "event-google-maps"]);
  expectIds("event-contacts", ["event-organizer", "event-contact-phone", "event-contact-email", "event-web", "event-registration"]);
  expectIds("event-details", ["event-description", "event-practical", "event-admission-fee"]);
  expectIds("event-media", ["event-slug"]);
  assert.ok(section("event-schedule").includes("admin-event-cancelled"));
  assert.ok(section("event-media").includes("<AdminSingleImageUpload"));
  assert.ok(section("event-media").includes("<ImageDisplay"));
  assert.ok(section("event-seo").includes("<AdminSeoFields"));
  assert.equal((editor.match(/<AdminEventMarkdownEditor/g) ?? []).length, 2);
  assert.ok(section("event-contacts").includes('<AdminEditorToolFrame kind="contacts">'));
  for (const id of ["event-organizer", "event-contact-phone", "event-contact-email", "event-web", "event-registration", "event-admission-fee"]) {
    assert.equal((editor.match(new RegExp('id="' + id + '"', "g")) ?? []).length, 1, "duplicate input: " + id);
  }
});

test("EDITOR-11: validations focus the right section and canonical API/publishing stay unchanged", () => {
  assert.match(editor, /\{ value: organizer, section: "event-contacts", label: "Organizátor" \}/);
  assert.match(editor, /\[websiteUrl, "event-contacts", "Web organizátora"\]/);
  assert.match(editor, /\[registrationUrl, "event-contacts", "Registrácia"\]/);
  assert.match(editor, /setActiveEventSection\(missing\.section\)/);
  assert.match(editor, /setActiveEventSection\("event-contacts"\)/);
  assert.match(editor, /const editorSnapshot = JSON\.stringify\(/);
  assert.match(editor, /contactPhone, contactEmail, admissionFee/);
  assert.match(editor, /method: event \? "PUT" : "POST"/);
  assert.match(editor, /"\/api\/admin\/events"/);
  assert.match(editor, /<EditorWorkspace/);
  assert.match(read("components/admin-editor-workspace.tsx"), /useAdminEditorNavigationGuard/);
  assert.match(editor, /<AdminDestructiveConfirmDialog/);
});
