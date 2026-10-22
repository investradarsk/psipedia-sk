import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("help and adoption cards use the same public missing-photo component", () => {
  const help = read("components/help-card.tsx");
  const adoption = read("components/adoption-card-media.tsx");
  const index = read("components/public-visual-system/index.ts");
  assert.match(index, /export \{ PublicMediaFallback \} from "\.\/public-media-fallback"/);
  for (const source of [help, adoption]) {
    assert.match(source, /import \{ PublicMediaFallback \} from "@\/components\/public-visual-system"/);
    assert.match(source, /<PublicMediaFallback\s*\/>/);
    assert.match(source, /<ImageDisplay\b/, "real images still use ImageDisplay");
  }
  assert.match(help, /className=\{styles\.mediaFallback\}\s+aria-hidden="true"/);
  assert.match(help, /className=\{styles\.badges\}/, "help urgency/resolution badges remain visible");
  assert.match(adoption, /data-adoption-media="image"/);
  assert.match(adoption, /data-adoption-media="fallback"/);
  assert.match(adoption, /adoptionDetailStatusLabels\[status\]/, "adoption status badge stays intact");
  assert.match(adoption, /aria-label=\{`Zobraziť profil \$\{name\}`\}/);
});

test("responsive 4:3 photo frames hold full-size shared fallback instead of bespoke icons", () => {
  const help = read("components/help-public.module.css");
  const adoption = read("components/adoption.module.css");
  const canonical = read("components/public-visual-system/public-media-fallback.module.css");
  assert.match(help, /\.media\{[^}]*aspect-ratio:4\/3/);
  assert.match(adoption, /\.visual\{[^}]*aspect-ratio:4\/3/);
  assert.match(help, /\.mediaFallback\{[^}]*width:100%;height:100%/);
  assert.match(adoption, /\.imageFallback\{[^}]*position:absolute;inset:0/);
  assert.doesNotMatch(adoption, /\.imageFallback span::before/);
  assert.match(canonical, /\.fallback\s*\{[^}]*width:\s*100%;[^}]*height:\s*100%/);
});
