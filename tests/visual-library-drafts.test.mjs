import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  defaultBannerDraft,
  validateBannerDraft,
  BANNER_DRAFT_STORAGE_PREFIX,
} from "../lib/visual-library-drafts.ts";

const banner = {
  id: "clanky:veterinari", label: "Veterinári", group: "clanky",
  eyebrow: "Služby", title: "Veterinári", description: "Vyhľadajte veterinára",
  ctaLabel: "Otvoriť", ctaHref: "/adresar/veterinari",
  uses: [],
  variants: [
    { eyebrow: "Prvý", title: "Prvý variant", description: "Popis prvý", ctaLabel: "Zobraziť" },
    { eyebrow: "Druhý", title: "Druhý variant", description: "Popis druhý", ctaLabel: "Nájsť" },
  ],
};
const read = (path) => readFileSync(path, "utf8");

test("editor restores default values from the selected real banner variant", () => {
  const a = defaultBannerDraft(banner, 0);
  const b = defaultBannerDraft(banner, 1);
  assert.equal(a.title, "Prvý variant");
  assert.equal(b.title, "Druhý variant");
  assert.equal(b.ctaLabel, "Nájsť");
  assert.equal(a.scope, "one");
  assert.equal(a.background, "original");
  assert.ok(BANNER_DRAFT_STORAGE_PREFIX.includes(":draft:v1:"));
});

test("editor draft validator rejects empty, oversized and control-character text", () => {
  const draft = defaultBannerDraft(banner, 0);
  assert.equal(validateBannerDraft({ ...draft, title: " " }, draft), null);
  assert.equal(validateBannerDraft({ ...draft, title: "a".repeat(141) }, draft), null);
  assert.equal(validateBannerDraft({ ...draft, eyebrow: "x\nInjected" }, draft), null);
  assert.equal(validateBannerDraft({ ...draft, description: "" }, draft), null);
  assert.equal(validateBannerDraft({ ...draft, ctaLabel: "x".repeat(81) }, draft), null);
  assert.equal(validateBannerDraft(null, draft), null);
});

test("editor normalizes persisted colors and supports intended one/template scope only", () => {
  const draft = defaultBannerDraft(banner, 0);
  const cleaned = validateBannerDraft({
    ...draft, title: "  Nový nadpis  ", background: "url(javascript:alert(1))",
    button: "invalid", scope: "unrecognized",
  }, draft);
  assert.equal(cleaned.title, "Nový nadpis");
  assert.equal(cleaned.background, "original");
  assert.equal(cleaned.button, "original");
  assert.equal(cleaned.scope, "one");
  assert.equal(validateBannerDraft({ ...draft, background: "cream", button: "red", scope: "template" }, draft).scope, "template");
});

test("editor persists on authenticated server and never publishes without confirmation", () => {
  const editor = read("components/admin-visual-library-editor.tsx");
  const listing = read("components/admin-visual-library.tsx");
  const css = read("components/admin-visual-library.module.css");
  const api = read("app/api/admin/visual-library/banners/route.ts");
  assert.match(editor, /method: "PUT"/);
  assert.match(editor, /method: "POST"/);
  assert.match(editor, /method: "GET"/);
  assert.match(editor, /Verejný web sa zatiaľ nezmenil/);
  assert.match(editor, /confirmed/);
  assert.match(editor, /Publikovať texty a farby na desktope/);
  assert.doesNotMatch(editor, /localStorage/);
  assert.match(api, /requireAdminMutation\\(request, \\{ strictProvenance: true \\}\\)/);
  assert.match(api, /acknowledged !== true/);
  assert.match(listing, /<AdminVisualLibraryEditor/);
  assert.match(listing, /editorOpen/);
  assert.match(css, /\\.editorPreview/);
  assert.match(css, /var\\(--visual-library-bg/);
});
