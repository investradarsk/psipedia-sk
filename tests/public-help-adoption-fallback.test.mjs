import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("help cases and adoption cards reuse one canonical missing-photo visual", () => {
  const help = read("components/help-card.tsx");
  const adoption = read("components/adoption-card-media.tsx");
  const fallback = read("components/public-visual-system/public-media-fallback.tsx");

  assert.match(help, /item\.imageUrl \? <ImageDisplay/);
  assert.match(help, /<PublicMediaFallback \/>/);
  assert.match(help, /className=\{styles\.mediaFallback\}/);
  assert.match(help, /aria-hidden="true"/);
  assert.match(help, /aria-label=\{"Otvoriť " \+ item\.title\}/);

  assert.match(adoption, /mainImage \? \(/);
  assert.match(adoption, /<ImageDisplay/);
  assert.match(adoption, /<PublicMediaFallback \/>/);
  assert.match(adoption, /data-adoption-media="fallback"/);
  assert.match(adoption, /data-adoption-media="image"/);
  assert.match(adoption, /adoptionDetailStatusLabels\[status\]/);
  assert.match(adoption, /aria-label=\{`Zobraziť profil \$\{name\}`\}/);

  assert.match(fallback, /data-public-media-fallback/);
  assert.match(fallback, /PawMark/);
});

test("fallback fills existing media frames without touching real-photo cropping or status badges", () => {
  const help = read("components/help-public.module.css");
  const adoption = read("components/adoption.module.css");
  const shared = read("components/public-visual-system/public-media-fallback.module.css");

  assert.match(help, /\.mediaFallback\s*\{[^}]*width:\s*100%;\s*height:\s*100%;/);
  assert.match(help, /\.media\s*\{[^}]*aspect-ratio:\s*4\s*\/\s*3;/);
  assert.match(adoption, /\.imageFallback\s*\{[^}]*inset:\s*0;/);
  assert.doesNotMatch(adoption, /\.imageFallback span\s*\{|\.imageFallback::before/);
  assert.match(adoption, /\.visual\s*\{[^}]*aspect-ratio:\s*4\s*\/\s*3;/);
  assert.match(adoption, /\.statusBadge\s*\{[^}]*position:\s*absolute;/);
  assert.match(shared, /\.fallback \{/);
});
