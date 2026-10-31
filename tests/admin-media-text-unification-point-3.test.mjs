import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("Article image blocks use the same accessible picker as canonical editors without image schema migration", () => {
  const article = read("components/admin-article-block-editor.tsx");
  const single = read("components/admin-single-image-upload.tsx");
  assert.match(article, /import \{AdminSingleImageUpload\}/);
  assert.match(article, /const file = adminSelectedImage\(event\)/);
  assert.match(article, /<AdminSingleImageUpload label=/);
  assert.match(article, /onFile=\{file=>uploadSingle\(file, block.id\)\}/);
  assert.match(article, /busy=\{uploadingSingleId===block.id\}/);
  assert.match(article, /onRejected=\{onError\}/);
  assert.match(article, /uploadAdminImage\(file, "articles"\)/);
  assert.match(article, /imageKey: data.imageKey, alt: block.alt \|\| file.name.replace/);
  assert.match(article, /onMessage\(adminImageUploadMessage/);
  assert.doesNotMatch(article, /<input type="file"/);
  assert.match(single, /<AdminGalleryDropzone/);
  assert.match(single, /multiple=\{false\}/);
});

test("URL-only gallery shares one sortable implementation while preserving ordered-list semantics", () => {
  const photo = read("components/admin-photo-gallery.tsx");
  const sorter = read("components/admin-sortable-gallery.tsx");
  assert.match(photo, /<AdminSortableGallery urls=\{value\} as="li" containerAs="ol" className=\{styles.items\}/);
  assert.match(photo, /onReorder=\{\(from,to\)=>onChange\(arrayMove\(value,from,to\)\)\}/);
  assert.match(photo, /onClick=\{\(\)=>onChange\(value.filter\(\(_,i\)=>i!==index\)\)\}/);
  assert.match(sorter, /containerAs\?:"div"\|"ol"\|"ul"/);
  assert.match(sorter, /const ContainerTag=containerAs/);
  assert.match(sorter, /<ContainerTag className=\{className\}>/);
  assert.match(sorter, /<SortRow key=\{id\}/);
  assert.match(sorter, /gallerySortableIds\(urls\)/);
  assert.match(sorter, /KeyboardSensor/);
  assert.doesNotMatch(photo, /SortableGalleryPhoto|useSortable|DndContext|gallerySortableIds/);
  assert.match(photo, /uploadAdminImage\(file, folder\)/);
  assert.match(photo, /validateAdminPhotoGalleryUrl\(url\)/);
});

test("structured article galleries preserve caption, credit, alt and imageKey", () => {
  const article = read("components/admin-article-block-editor.tsx");
  for (const name of ["imageKey", "alt", "caption", "credit", "size"]) assert.ok(article.includes(name));
  assert.match(article, /images:arrayMove\(item.images,from,to\)/);
  assert.match(article, /<AdminGalleryDropzone/);
  assert.match(article, /<AdminSortableGallery/);
  assert.match(article, /onChange\(blocks.map/);
});

test("Domain-specific upload and rich-text persistence formats remain intentionally separate", () => {
  const fb = read("components/admin-facebook-images.tsx");
  const article = read("components/admin-article-block-editor.tsx");
  const markdown = read("components/admin-event-markdown-editor.tsx");
  assert.match(fb, /uploadAdminImage\(file,"facebook-images"\)/);
  assert.match(fb, /"image\/jpeg","image\/png","image\/webp"/);
  assert.match(fb, /accept="image\/jpeg,image\/png,image\/webp"/);
  assert.match(article, /<AdminLexicalRichTextEditor/);
  const lexical = read("components/admin-lexical-rich-text-editor.tsx");
  assert.match(lexical, /normalizeEditorialRichText/);
  assert.match(lexical, /readDocument/);
  assert.match(lexical, /type: "callout"/);
  assert.match(markdown, /appendLexicalPlainTextToMarkdown/);
  // The event Markdown editor delegates link validation to the lossless adapter.
  assert.match(markdown, /eventMarkdownToEditorial/);
  const adapter = read("lib/event-lexical-markdown.ts");
  assert.match(adapter, /import \{ safeEventLink \} from "\.\/event-markdown"/);
  assert.match(adapter, /safeEventLink\(href\) !== href/);
  assert.match(adapter, /sanitizeEditorialHref\(href\) !== href/);
});
