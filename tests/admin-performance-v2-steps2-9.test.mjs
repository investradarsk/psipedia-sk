import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { moveAdminGalleryItem } from "../lib/admin-gallery-order.ts";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

function parse(path) {
  const source = read(path);
  const tree = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  assert.deepEqual(tree.parseDiagnostics.map(diagnostic =>
    ts.flattenDiagnosticMessageText(diagnostic.messageText, " ")), [], path);
  return source;
}

test("2/10 Article editor imports preview/crop only as lazy chunks and creates graphic on demand", () => {
  const article = parse("components/admin-article-editor.tsx");
  assert.match(article, /dynamic\(\(\) => import\("@\/components\/admin-article-fullscreen-preview"\)/);
  assert.match(article, /dynamic\(\(\) => import\("@\/components\/image-display-editor"\)/);
  assert.match(article, /fullscreenPreviewOpen && <AdminArticleFullscreenPreview/);
  assert.match(article, /await import\("@\/lib\/facebook-article-graphic"\)/);
  assert.doesNotMatch(article, /import \{createFacebookArticleGraphic\}/);
});

test("3/10 Media tools are code-split and visited media section retains gallery state", () => {
  const dir = parse("components/admin-directory-editor.tsx");
  const breed = parse("components/admin-breed-editor.tsx");
  assert.match(dir, /mediaSectionVisited/);
  assert.match(dir, /setMediaSectionVisited\(true\)/);
  assert.match(dir, /dynamic\(\(\) => import\("@\/components\/admin-photo-gallery"\)/);
  assert.match(dir, /&& mediaSectionVisited/);
  assert.match(breed, /activeBreedSection === "breed-media" && <AdminSortableGallery/);
  assert.match(breed, /activeBreedSection === "breed-media" && <AdminGalleryDropzone/);
  assert.match(breed, /dynamic\(\(\) => import\("@\/components\/admin-sortable-gallery"\)/);
  assert.doesNotMatch(breed, /import \{arrayMove\} from "@dnd-kit\/sortable"/);
  const images = ["a", "b", "c", "d"];
  assert.deepEqual(moveAdminGalleryItem(images, 0, 3), ["b", "c", "d", "a"]);
  assert.deepEqual(moveAdminGalleryItem(images, 3, 0), ["d", "a", "b", "c"]);
  assert.deepEqual(moveAdminGalleryItem(images, -1, 2), images);
  assert.deepEqual(moveAdminGalleryItem(images, 10, 0), images);
  assert.deepEqual(moveAdminGalleryItem(images, 1, 1), images);
  assert.deepEqual(images, ["a", "b", "c", "d"], "gallery source must not be mutated");
});

test("4/10 Event map and geo tools are deferred, but stay mounted after first visit", () => {
  const event = parse("components/admin-event-editor.tsx");
  assert.match(event, /dynamic\(\(\) => import\("@\/components\/admin-profile-google-maps"\)/);
  assert.match(event, /dynamic\(\(\) => import\("@\/components\/admin-geo-location"\)/);
  assert.match(event, /locationSectionVisited/);
  assert.match(event, /if \(next === "event-location"\) setLocationSectionVisited\(true\)/);
  assert.match(event, /event && locationSectionVisited/);
  // Opening the location section must not start a second geo GET/SDK chunk.
  // Advanced address-based verification mounts only on an explicit click and
  // remains mounted after switching sections, preserving an unfinished preview.
  assert.match(event, /geoFallbackOpened, setGeoFallbackOpened/);
  assert.match(event, /!geoFallbackOpened && <button type="button" onClick=\{\(\) => setGeoFallbackOpened\(true\)\}/);
  assert.match(event, /geoFallbackOpened && <AdminGeoLocation/);
  assert.match(event, /showGoogleWorkflow=\{false\}/);
  assert.doesNotMatch(event, /locationSectionVisited && <AdminGeoLocation/);
  assert.match(event, /imageEditorOpen && imageUrl && <ImageDisplayEditor/);
});

test("5/10 Search benchmark measures old substring and existing indexed Admin-ID path locally", () => {
  const bench = read("scripts/benchmark-admin-search-v2.mjs");
  assert.match(bench, /new DatabaseSync\(":memory:"\)/);
  assert.match(bench, /EXPLAIN QUERY PLAN/);
  assert.match(bench, /in-memory-synthetic-sqlite-not-cloudflare-d1/);
  assert.doesNotMatch(bench, /cloudflare:workers|wrangler|fetch\(/);
});

test("6/10 Admin-ID quick search skips text delay and identical overlong queries", () => {
  const quick = parse("components/admin-quick-navigation-dialog.tsx");
  assert.match(quick, /SEARCH_QUERY_MAX_LENGTH = 80/);
  assert.match(quick, /query\.trim\(\)\.slice\(0, SEARCH_QUERY_MAX_LENGTH\)/);
  assert.match(quick, /\^#\?\[1-9\]/);
  assert.match(quick, /\[open, searchTerm, retryCount\]/);
  assert.match(quick, /controller\.abort\(\)/);
  assert.match(quick, /cache\.current\.size > SEARCH_CACHE_LIMIT/);
});

test("7/10 Attention summary deduplicates only in React server request", () => {
  const loader = parse("lib/admin-attention-request.ts");
  const shell = parse("components/admin-shell.tsx");
  const home = parse("app/admin/page.tsx");
  const operations = parse("app/admin/operations/page.tsx");
  assert.match(operations, /attentionSummaryPromise = loadRequestAdminAttentionSummary\(\)/);
  assert.match(loader, /import \{ cache \} from "react"/);
  assert.match(loader, /loadExactAdminAttentionSummary\(\)/);
  assert.match(shell, /loadRequestAdminAttentionSummary\(\)/);
  assert.match(home, /loadRequestAdminAttentionSummary\(\)/);
  assert.doesNotMatch(loader, /setTimeout|new Map|globalThis|localStorage/);
});

test("8/10 Organization saves refresh the server shell only when its name or slug changes", () => {
  const org = parse("components/admin-organization-editor.tsx");
  const page = parse("app/admin/organizacie/[id]/page.tsx");
  assert.match(page, /title=\{organization\.name\}/);
  assert.match(page, /organization\.slug/);
  assert.match(org, /let serverIdentityChanged = false/);
  assert.match(org, /serverIdentityChanged = Boolean\(organization &&\s*\(body\.item\.name !== organization\.name \|\| body\.item\.slug !== organization\.slug\)\)/);
  assert.match(org, /if \(serverIdentityChanged\) router\.refresh\(\)/);
  assert.doesNotMatch(org, /if \(organizationSaved\) router\.refresh\(\)/);
  assert.equal((org.match(/router\.refresh\(\)/g) ?? []).length, 1, "no unconditional refresh after a text, contact, image or address save");
  assert.match(org, /setSavedAddressSnapshot\(JSON\.stringify\(savedAddress\)\)/);
  assert.match(org, /JSON\.stringify\(current\) === submittedAddressSnapshot \? savedAddress : current/);
  assert.match(org, /JSON\.stringify\(current\) === submittedSnapshot \? persistedDraft : current/);
  assert.match(org, /setExpectedUpdatedAt\(body\.item\.updatedAt\)/);
  assert.match(org, /createdOrganizationId\.current = organizationId/);
  assert.match(org, /router\.replace\(`\/admin\/organizacie\/\$\{organizationId\}`\)/);
});

test("9/10 Shared table stabilizes equal page selections without changing bulk writes or server order", () => {
  const table = parse("components/admin-record-table.tsx");
  assert.match(table, /manualSorting: serverSorted \|\| Boolean\(serverSorting\)/);
  assert.match(table, /getSortedRowModel: serverSorted \|\| serverSorting \? undefined : clientSortedRowModel/);
  assert.match(table, /columnResizeMode: "onEnd"/);
  assert.match(table, /getRowId: recordRowId/);
  assert.match(table, /rows\.filter\(record => next\[String\(record\.id\)\]\)/);
  assert.match(table, /if \(!selectedIdsKey\) return EMPTY_ROW_SELECTION/);
  assert.match(table, /const visibleIds = new Set\(rows\.map\(row => row\.id\)\)/);
  assert.match(table, /selectedIdsKey\.split\(","\)\.map\(Number\)/);
  assert.match(table, /\[rows, selectedIdsKey\]/);
  assert.match(table, /useLayoutEffect\(\(\) => \{ selectionRef\.current = selection; \}, \[selection\]\)/);
  assert.match(table, /selectionRef\.current\?\.labelForRow/);
  assert.match(table, /selectionRef\.current\?\.rowInputDataAttribute/);
  assert.match(table, /selectionRef\.current\?\.disabled/);
  assert.match(table, /\[columns, selectionEnabled, label, busy, rows\.length, serverSorted, serverSorting\]/);
  assert.doesNotMatch(table, /\[columns, selection, label, busy, rows\.length, serverSorted, serverSorting\]/);
  assert.match(table, /selection\.onChange\(rows\.filter/);
  const orgQuery = parse("lib/help-organization-admin-query.ts");
  assert.match(orgQuery, /ORGANIZATION_ADMIN_PAGE_SIZE = 50/);
});
