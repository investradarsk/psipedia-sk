import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { buildRegistry } from "../scripts/generate-component-registry.mjs";

function fixture(root, file, value) {
  const dest = path.join(root, file);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, value);
}

test("registry tracks transitive imports, shared usage, and admin/public areas", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "psipedia-registry-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  fixture(root, "app/page.tsx", 'import Shared from "@/components/shared"; export default function Page(){ return <Shared /> }');
  fixture(root, "app/adresar/page.tsx", 'import Outer from "@/components/outer"; export default function Page(){ return <Outer /> }');
  fixture(root, "app/admin/page.tsx", 'import Admin from "@/components/admin-panel"; export default function Page(){ return <Admin /> }');
  fixture(root, "components/outer.tsx", 'export { default } from "./shared";');
  fixture(root, "components/shared.tsx", 'export default function Shared(){ return <div>shared</div> }');
  fixture(root, "components/admin-panel.tsx", 'export default function Admin(){ return <div>admin</div> }');
  fixture(root, "components/unused.tsx", 'export default function Unused(){ return <div /> }');
  fixture(root, "components/unused.jsx", 'export default function Other(){ return <div /> }');

  const data = buildRegistry(root);
  const shared = data.components.find((item) => item.name === "shared");
  assert.deepEqual(shared.routes, ["/", "/adresar"]);
  assert.equal(shared.shared, true);
  assert.equal(shared.family, "other");
  assert.equal(shared.label, "shared");
  assert.deepEqual(shared.consumers, ["app/page.tsx", "components/outer.tsx"]);
  const admin = data.components.find((item) => item.name === "admin-panel");
  assert.equal(admin.area, "admin");
  assert.deepEqual(admin.routes, ["/admin"]);
  assert.equal(data.components.find((item) => item.path === "components/unused.tsx").unreferenced, true);
  assert.deepEqual(data.sameNameCandidates, [{
    name: "unused", paths: ["components/unused.jsx", "components/unused.tsx"],
  }]);
  assert.equal(data.totals.pages, 3);
  assert.equal(data.totals.shared, 1);
});

test("cycles in import graph are bounded", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "psipedia-registry-cycle-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fixture(root, "app/page.tsx", 'import A from "../components/a"; export default A;');
  fixture(root, "components/a.tsx", 'import B from "./b"; export default function A(){ return <B /> }');
  fixture(root, "components/b.tsx", 'import A from "./a"; export default function B(){ return <div /> }');
  const registry = buildRegistry(root);
  assert.deepEqual(registry.components.find((item) => item.name === "b").routes, ["/"]);
});

test("visual families are review candidates, never automatic merge decisions", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "psipedia-visual-families-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fixture(root, "app/page.tsx", 'import Hero from "@/components/unified-section-hero"; export default Hero;');
  fixture(root, "components/unified-section-hero.tsx", 'export default function Hero(){ return <div/> }');
  fixture(root, "components/section-hero.tsx", 'export function OldHero(){ return <header/> }');
  fixture(root, "components/public-magazine-banner.tsx", 'export function Banner(){ return <aside/> }');
  fixture(root, "components/public-context-banner.tsx", 'export function Info(){ return <aside/> }');
  const registry = buildRegistry(root);
  assert.equal(registry.version, 2);
  assert.equal(registry.components.find(x => x.name === "unified-section-hero").family, "hero");
  assert.equal(registry.components.find(x => x.name === "public-magazine-banner").label, "Fotografický a promo banner");
  assert.deepEqual(registry.relatedGroups.find(x => x.id === "hero").paths, [
    "components/unified-section-hero.tsx", "components/section-hero.tsx"
  ]);
  assert.deepEqual(registry.relatedGroups.find(x => x.id === "banner").paths, [
    "components/public-magazine-banner.tsx", "components/public-context-banner.tsx"
  ]);
});
