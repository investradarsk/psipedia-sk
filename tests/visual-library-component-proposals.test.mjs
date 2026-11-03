import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {
  visualComponentProposalPresets,
  isVisualComponentProposalId,
  validateVisualComponentProposal,
} from "../lib/visual-library-component-proposals.ts";

const read = (path) => readFileSync(path, "utf8");

test("only four real component IDs are allowed to save a text-only proposal", () => {
  assert.deepEqual(Object.keys(visualComponentProposalPresets).sort(),
    ["actions","data-card","landing-hero-events","section-header"]);
  for(const id of Object.keys(visualComponentProposalPresets)){
    assert.ok(isVisualComponentProposalId(id));
    const sample = visualComponentProposalPresets[id].original;
    assert.deepEqual(validateVisualComponentProposal(id,sample).draft, sample);
  }
  assert.equal(isVisualComponentProposalId("homepage:profil"), false);
  assert.equal(isVisualComponentProposalId("profile-reviews-populated"), false);
  assert.throws(()=>validateVisualComponentProposal("homepage:profil",{}), /Neznáma/);
});

test("proposal validation rejects broken fields, untrusted extra keys and oversized input", () => {
  const original = visualComponentProposalPresets["data-card"].original;
  for(const change of [
    {...original,title:" "},
    {...original,title:"x".repeat(141)},
    {...original,description:42},
    {...original,ctaLabel:"".padEnd(81,"x")},
    {...original,title:"ok\ninjected"},
    {...original,scope:"template"},
    {...original,url:"https://other.example/"},
  ]) assert.throws(()=>validateVisualComponentProposal("data-card",change));
  assert.deepEqual(validateVisualComponentProposal("data-card",
    {...original,title:"  Nový text  "}).draft.title,"Nový text");
  assert.equal(validateVisualComponentProposal("actions",
    visualComponentProposalPresets.actions.original).draft.eyebrow,"");
});

test("component proposal API has no publish route, is admin-authenticated and enforces versioned D1 writes", () => {
  const api = read("app/api/admin/visual-library/component-drafts/route.ts");
  const store = read("lib/visual-library-component-proposal-store.ts");
  const publicBannerStore = read("lib/visual-library-edit-store.ts");
  const editor = read("components/admin-visual-library-component-editor.tsx");
  const gallery = read("components/admin-visual-library-gallery.tsx");
  const existingSql = read("drizzle/0152_visual_library_banner_edits.sql");

  assert.match(api,/requireAdminMutation\(request, \{ strictProvenance: true \}\)/);
  assert.match(api,/getAdminApiUser\(\)/);
  assert.match(api,/export async function GET/);
  assert.match(api,/export async function PUT/);
  assert.doesNotMatch(api,/export async function POST|publishVisualDraft|invalidateVersionedPublicHtmlCacheUrl/);
  assert.match(store,/component-proposal:/);
  assert.match(store,/revision=revision\+1/);
  assert.match(store,/ON CONFLICT\(banner_id,variant_index\) DO NOTHING/);
  assert.match(store,/published_json IS NULL/);
  assert.match(existingSql,/visual_library_banner_edits/);
  assert.match(publicBannerStore,/validatedBannerKey/);
  assert.doesNotMatch(store,/publishVisualDraft|published_at=|published_json=\?/);
  assert.match(editor, /<ProposalPreview id=\{id\} draft=\{draft\}/);
  assert.match(editor,/method: "PUT"/);
  assert.match(editor,/Uložiť návrh na server/);
  assert.match(editor,/Zatiaľ nie je povolené/);
  assert.doesNotMatch(editor,/method: "POST"|localStorage/);
  assert.match(gallery,/<AdminVisualLibraryComponentEditor sampleId=\{chosen\.sample\.id\}/);
});
