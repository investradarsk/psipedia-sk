import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("subcategory landing cards reuse the public missing-photo visual and ignore blank src", () => {
  const nav = read("components/public-visual-system/public-subcategory-navigator.tsx");
  assert.match(nav, /import \{ PublicMediaFallback \} from "\.\/public-media-fallback"/);
  assert.match(nav, /!item\.image\?\.src\.trim\(\) && styles\.landingMediaFallback/);
  assert.match(nav, /\{item\.image\?\.src\.trim\(\) \? \(/);
  assert.match(nav, /styles\.landingPlaceholder\} aria-hidden="true"><PublicMediaFallback/);
  assert.match(nav, /data-public-subcategory-item/);
  assert.match(nav, /aria-current=\{item\.current \? "page" : undefined\}/);
});

test("real photos, overlaid category icons and responsive horizontal scrolling stay intact", () => {
  const nav = read("components/public-visual-system/public-subcategory-navigator.tsx");
  const css = read("components/public-visual-system/public-subcategory-navigator.module.css");
  assert.match(nav, /src=\{item\.image\.src\}/);
  assert.match(nav, /width=\{item\.image\.width \?\? 640\}/);
  assert.match(nav, /height=\{item\.image\.height \?\? 360\}/);
  assert.match(nav, /loading=\{item\.image\.loading \?\? "lazy"\}/);
  assert.match(nav, /item\.icon \? <PublicIcon/);
  assert.match(css, /\.landingPlaceholder \{[^}]*position: absolute;[^}]*inset: 0;/);
  assert.match(css, /\.landingIcon \{[^}]*z-index: 1;/);
  assert.match(css, /grid-auto-columns: minmax\(228px, 79%\)/);
  assert.match(css, /scroll-snap-type: x mandatory/);
});
