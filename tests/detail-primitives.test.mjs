import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("components/detail-primitives/detail-primitives.tsx", "utf8");
const styles = readFileSync("components/detail-primitives/detail-primitives.module.css", "utf8");

function exportedFunction(name, nextName) {
  const start = source.indexOf(`export function ${name}`);
  assert.notEqual(start, -1, `${name} export is missing`);
  const end = nextName ? source.indexOf(`export function ${nextName}`, start) : source.length;
  return source.slice(start, end === -1 ? source.length : end);
}

test("DetailActions is a composition-only wrapper for semantic action children", () => {
  const block = exportedFunction("DetailActions", "DetailContentLayout");
  assert.match(block, /children: ReactNode/);
  assert.match(block, /<div className=\{styles\.actions\}>\{children\}<\/div>/);
  assert.doesNotMatch(block, /href=|onClick=|<button|<a\b|\bButton\b|\bLink\b/);
  assert.doesNotMatch(block, /className\?:/);
});

test("DetailActions layout wraps without defining button variants", () => {
  assert.match(styles, /\.actions\{[^}]*display:flex[^}]*flex-wrap:wrap[^}]*gap:10px[^}]*min-width:0[^}]*\}/);
  assert.doesNotMatch(styles, /\.actions[^}]*background:/);
});

test("DetailContentLayout renders content before an optional semantic aside", () => {
  const block = exportedFunction("DetailContentLayout");
  assert.match(block, /children: ReactNode; aside\?: ReactNode/);
  assert.match(block, /aside \? .*contentLayoutWithAside/);
  assert.ok(block.indexOf("styles.contentMain") < block.indexOf("<aside"), "content must stay before the aside in DOM order");
  assert.match(block, /\{aside \? <aside className=\{styles\.contentAside\}>\{aside\}<\/aside> : null\}/);
  assert.doesNotMatch(block, /className\?:/);
});

test("DetailContentLayout is overflow-safe and becomes two-column only when an aside exists", () => {
  assert.match(styles, /\.contentLayout\{[^}]*display:grid[^}]*gap:clamp\(24px,4vw,48px\)[^}]*align-items:start[^}]*min-width:0[^}]*\}/);
  assert.match(styles, /\.contentMain,\.contentAside\{min-width:0\}/);
  assert.match(styles, /@media\(min-width:901px\)\{\.contentLayoutWithAside\{grid-template-columns:minmax\(0,1\.55fr\) minmax\(280px,\.72fr\)\}\}/);
});
