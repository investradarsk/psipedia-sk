import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { validateAdminPhotoGalleryUrl } from "../lib/admin-photo-gallery-url.ts";
import { filterGeminiConcepts } from "../lib/gemini-concept-fuzzy-search.ts";

const read = path => fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("Zod gallery URL contract preserves existing internal and external sources", () => {
  assert.equal(validateAdminPhotoGalleryUrl("  /media/pes.webp  "), "/media/pes.webp");
  assert.equal(validateAdminPhotoGalleryUrl("/images/pes.webp"), "/images/pes.webp");
  assert.equal(validateAdminPhotoGalleryUrl("https://example.com/pes.webp"), "https://example.com/pes.webp");
  assert.equal(validateAdminPhotoGalleryUrl("http://example.com/pes.webp"), "http://example.com/pes.webp");
  for (const input of ["", "  ", "javascript:alert(1)", "data:image/png;base64,aaa", "file:///etc/passwd", "ftp://example.com/a.jpg", "relative.png"]) {
    assert.equal(validateAdminPhotoGalleryUrl(input), null, input);
  }
});

const createEntry = (name, city, label = "Veterinári") => ({
  item: { label }, draft: { name, city },
});
test("Fuse fallback adds typo tolerance while keeping literal Gemini search first", () => {
  const entries = [createEntry("Veterinár Zlaté Moravce", "Zlaté Moravce"),
    createEntry("Tréner psov", "Nitra", "Tréneri"),
    createEntry("Veterinár Jelenec", "Jelenec")];
  assert.deepEqual(filterGeminiConcepts(entries, "veterinar"), [entries[0], entries[2]]);
  assert.deepEqual(filterGeminiConcepts(entries, "MORAVCE"), [entries[0]]);
  assert.deepEqual(filterGeminiConcepts(entries, "moravcce"), [entries[0]]);
  assert.deepEqual(filterGeminiConcepts(entries, "v"), entries);
  assert.deepEqual(filterGeminiConcepts(entries, ""), entries);
  assert.deepEqual(filterGeminiConcepts(entries, "x"), []);
});
test("real npm lock is synchronized, including verified SHA512 integrity", () => {
  const pkg = JSON.parse(read("package.json")), lock = JSON.parse(read("package-lock.json"));
  for (const [name, version] of Object.entries(pkg.dependencies)) {
    assert.equal(lock.packages[""].dependencies[name], version, name);
    assert.equal(lock.packages["node_modules/" + name]?.version, version, name);
  }
  for (const name of ["fuse.js", "zod", "lucide-react", "react-hook-form"]) {
    const entry = lock.packages["node_modules/" + name];
    assert.match(entry.integrity, /^sha512-/);
    assert.equal(entry.dev, undefined, name + " should not be dev-only");
  }
});
test("real admin components import libraries (not just the isolated pilot)", () => {
  const gallery = read("components/admin-photo-gallery.tsx");
  const gemini = read("components/admin-gemini-all-concepts.tsx");
  assert.match(gallery, /from "react-hook-form"/);
  assert.match(gallery, /from "lucide-react"/);
  assert.match(gallery, /validateAdminPhotoGalleryUrl\(url\)/);
  assert.match(gemini, /filterGeminiConcepts\(eligible, search\)/);
  assert.match(gemini, /const eligible = all\.filter/);
});

test("TanStack Table/Virtual remove the silent 200-row service catalogue truncation", () => {
  const source = read("components/admin-service-catalog-workspace.tsx");
  assert.ok(source.includes('from "@tanstack/react-table"'));
  assert.ok(source.includes('from "@tanstack/react-virtual"'));
  assert.ok(source.includes("catalogTable.getRowModel().rows"));
  assert.ok(source.includes("virtualizer.getVirtualItems()"));
  assert.ok(!source.includes("visible.slice(0,200)"));
  assert.ok(source.includes("aria-pressed={selected?.id===item.id}"));
});
test("Uppy gallery retains canonical upload sequencing while single-image Dropzone remains accessible", () => {
  const gallery = read("components/admin-photo-gallery.tsx");
  const uppy = read("components/admin-uppy-gallery-upload.tsx");
  const common = read("components/admin-gallery-dropzone.tsx");
  assert.ok(gallery.includes("<AdminUppyGalleryUpload"));
  assert.ok(uppy.includes("from \"@uppy/core\""));
  assert.ok(uppy.includes("from \"@uppy/react/dashboard-modal\""));
  assert.ok(uppy.includes("await uploadAdminImage(file, props.current.folder)"));
  assert.ok(uppy.includes("for (const id of fileIds)"));
  assert.ok(uppy.includes("onBusyChange(false)"));
  assert.ok(common.includes('from "react-dropzone"'));
  assert.ok(common.includes("getInputProps({"), "the named single-image file input stays accessible");
});
