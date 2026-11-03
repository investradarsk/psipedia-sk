import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import postcss from "postcss";

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
  const root = postcss.parse(styles);
  const rules = root.nodes.filter((node) => node.selector === ".actions");
  const values = Object.fromEntries(
    rules.flatMap((rule) => rule.nodes.map((node) => [node.prop, node.value])),
  );
  assert.equal(values.display, "flex");
  assert.equal(values["flex-wrap"], "wrap");
  assert.equal(values["min-width"], "0");
  assert.equal(values.background, undefined);
});

test("DetailContentLayout renders content before an optional semantic aside", () => {
  const block = exportedFunction("DetailContentLayout", "PublicDetailLayout");
  assert.match(block, /children: ReactNode;\s*aside\?: ReactNode/);
  assert.match(block, /aside\s*\?\s*.*contentLayoutWithAside/s);
  assert.ok(
    block.indexOf("styles.contentMain") < block.indexOf("<aside"),
    "content must stay before the aside in DOM order",
  );
  assert.match(
    block,
    /\{aside\s*\?\s*\(?\s*<aside className=\{styles\.contentAside\}>\s*\{aside\}\s*<\/aside>\s*\)?\s*:\s*null\}/s,
  );
  assert.doesNotMatch(block, /className\?:/);
});

test("DetailContentLayout is overflow-safe and becomes two-column only when an aside exists", () => {
  const root = postcss.parse(styles);
  const declarations = (selector) =>
    Object.fromEntries(
      root.nodes
        .filter((n) => n.selector?.replace(/\s/g, "") === selector.replace(/\s/g, ""))
        .flatMap((n) => n.nodes.map((d) => [d.prop, d.value])),
    );
  assert.equal(declarations(".contentLayout").display, "grid");
  assert.equal(declarations(".contentLayout")["min-width"], "0");
  assert.equal(declarations(".contentMain, .contentAside")["min-width"], "0");
  const desktop = root.nodes.find(
    (n) =>
      n.type === "atrule" &&
      n.params === "(min-width: 901px)" &&
      n.nodes.some((r) => r.selector === ".contentLayoutWithAside"),
  );
  assert.ok(desktop);
  assert.ok(
    desktop.nodes
      .find((n) => n.selector === ".contentLayoutWithAside")
      .nodes.some((d) => d.prop === "grid-template-columns"),
  );
});
