import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("Facebook post quick edit is isolated to unapproved manual drafts and never publishes", () => {
  const route = read("app/api/admin/facebook-images/[id]/route.ts");
  const store = read("lib/facebook-image-store.ts");
  const ui = read("components/admin-facebook-images.tsx");
  assert.match(route, /export async function PATCH/);
  assert.match(route, /requireAdminMutation\(request,\{strictProvenance:true\}\)/);
  assert.match(route, /data\.action!=="set-inline-text"/);
  assert.match(route, /Object\.keys\(data\)\.length!==4/);
  assert.match(store, /export async function updateFacebookImageDraftInlineText/);
  const section = store.slice(store.indexOf("export async function updateFacebookImageDraftInlineText"),store.indexOf("export async function saveFacebookImagePost("));
  assert.match(section, /SET title=\?,caption=\?,version=version\+1,updated_at=\?,updated_by=\?/);
  assert.match(section, /AND version=\? AND status='draft'/);
  assert.match(section, /article_id IS NULL AND notion_page_id IS NULL/);
  assert.match(section, /approval_status='UNREVIEWED'/);
  assert.match(section, /NOT EXISTS \(SELECT 1 FROM facebook_image_publish_attempts/);
  assert.match(section, /direct_publish_consent/);
  assert.doesNotMatch(section, /SET\s+(?:status|scheduled_at|approval_status|direct_publish_consent)=/);
  assert.match(ui, /editableDraft\(post:FacebookImagePost\)/);
  assert.match(ui, /post\.source==="manual"/);
  assert.match(ui, /post\.approvalStatus==="UNREVIEWED"/);
  assert.match(ui, /<AdminInlineRowActions/);
  assert.match(ui, /action:"set-inline-text"/);
  assert.match(ui, /expectedVersion:draft\.version/);
  assert.match(read("components/admin-facebook-images.module.css"), /max-width: 899px/);
});

test("Services V3 inline editing uses existing gated canonical option mutation, preserving identity and categories", () => {
  const ui = read("components/admin-service-catalog-workspace.tsx");
  const route = read("app/api/admin/service-catalog/options/[id]/route.ts");
  const lifecycle = read("lib/service-catalog-admin-lifecycle.ts");
  const overrides = read("lib/service-catalog-builtin-overrides.ts");
  assert.match(ui, /const mayInlineEdit=/);
  // Inline changes are allowed for active canonical admin options (and
  // enabled built-in overrides), never draft/retired admin records. The
  // previous DRAFT assertion was stale in both main and this PR.
  assert.match(ui, /const mayEdit=/);
  assert.match(ui, /item\.source==="built_in"\?builtinOverridesEnabled:item\.status==="ACTIVE"/);
  assert.match(ui, /const mayInlineEdit=\(item:CatalogEditorItem\)=>mayEdit\(item\)&&item\.version!==null/);
  assert.match(ui, /<AdminInlineRowActions/);
  assert.match(ui, /<AdminInlineCellInput/);
  assert.match(ui, /action:"edit",expectedVersion:draft\.version,name:draft\.label/);
  assert.match(ui, /categories:\[\.\.\.item\.categories\],group:item\.group/);
  assert.match(ui, /router\.refresh\(\)/);
  assert.match(route, /SERVICE_CATALOG_ADMIN_WRITES_ENABLED/);
  assert.match(route, /updateBuiltinCatalogOption/);
  assert.match(route, /mutateAdminCatalogOption/);
  assert.match(lifecycle, /expectedVersion/);
  assert.match(lifecycle, /normalized_label/);
  assert.match(overrides, /normalized_label/);
  assert.match(read("components/admin-service-catalog.module.css"), /max-width: 899px/);
});

test("adoption sort metadata is client-safe and does not pull D1 bindings into browser bundles", () => {
  const client = read("components/admin-adoption-dashboard.tsx");
  const store = read("lib/adoption-admin-store.ts");
  const pure = read("lib/adoption-admin-sorts.ts");
  assert.match(client, /import \{ adoptionAdminSorts \} from "@\/lib\/adoption-admin-sorts"/);
  assert.doesNotMatch(client, /\s+adoptionAdminSorts,\s+type AdoptionAdminListFilters/);
  assert.match(store, /import \{ adoptionAdminSorts, type AdoptionAdminSort \} from "\.\/adoption-admin-sorts\.ts"/);
  assert.doesNotMatch(pure, /cloudflare:workers|from ".\/adoption-store/);
});
