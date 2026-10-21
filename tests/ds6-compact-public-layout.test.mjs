import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = (relative) => readFileSync(join(root, relative), "utf8");

test("DS-6 homepage remains compact without replacing approved magazine layout", () => {
  const css = source("app/home-v2.module.css");
  assert.match(css, /\.homeV2 :global\(\.section\) \{[\s\S]*?padding-block: clamp\(24px, 2\.8vw, 38px\)/);
  assert.match(css, /HOMEPAGE-COMPACT-1/);
  assert.match(css, /\.homeV2 :global\(\.section\.home-magazine-section\)/);
  assert.match(css, /\.homeV2 :global\(\.home-profile-categories\)/);
});

test("DS-6 landing heading spacing stays responsive and legible", () => {
  const css = source("components/public-visual-system/public-landing-layout.module.css");
  assert.match(css, /--public-space-section: 30px/);
  assert.match(css, /--public-space-section: 24px/);
  assert.match(css, /font-size: clamp\(1\.5rem, 2\.3vw, 2\.15rem\)/);
  assert.match(css, /@media \(max-width: 620px\)/);
  assert.match(css, /\.headingInverse/);
});

test("DS-6 detail polish retains media, accessibility and map gates", () => {
  const css = source("components/detail-primitives/detail-primitives.module.css");
  assert.match(css, /DS-6: compact presentation only/);
  assert.match(css, /\.contentLayout \{ gap: clamp\(16px, 2\.4vw, 28px\)/);
  assert.match(css, /\.heroMedia:has\(\[data-image-display="natural"\]\)/);
  assert.match(css, /\.aside \[data-testid="public-location-map"\]/);
  assert.match(css, /\.primaryAction, \.secondaryAction \{ min-height: 44px/);
  assert.match(css, /@media \(max-width: 380px\)/);
});

test("DS-6 footer preserves content and becomes compact on desktop and mobile", () => {
  const jsx = source("components/site-footer.tsx");
  const css = source("components/site-footer.module.css");
  assert.match(jsx, /import styles from "\.\/site-footer\.module\.css"/);
  assert.match(jsx, /className=\{`site-footer \$\{styles\.compactFooter\}`\}/);
  assert.match(jsx, /<CookieSettingsButton \/>/);
  assert.match(css, /repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(css, /repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /a:focus-visible/);
});
