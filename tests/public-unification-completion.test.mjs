import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";

function load(file) {
  const source = readFileSync(new URL("../" + file, import.meta.url), "utf8");
  const exports = {};
  const code = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
    },
  }).outputText;
  new Function("require", "exports", code)((name) => {
    if (name === "react") return React;
    if (name === "react/jsx-runtime") return jsx;
    if (name === "next/link")
      return { __esModule: true, default: (props) => React.createElement("a", props) };
    if (name === "@/components/icons")
      return { PawMark: ({ size }) => React.createElement("svg", { width: size, height: size }) };
    if (name.endsWith(".module.css"))
      return { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) };
    throw new Error("Unexpected dependency " + name);
  }, exports);
  return exports;
}
const render = (component, props, ...children) =>
  renderToStaticMarkup(React.createElement(component, props, ...children));
const controls = load("components/public-visual-system/public-form-controls.tsx");
const states = load("components/public-visual-system/public-result-states.tsx");
const media = load("components/public-visual-system/public-media-fallback.tsx");
const callouts = load("components/public-visual-system/public-article-callout.tsx");

test("context textarea and select preserve refs, validation and controlled handlers without default geometry", () => {
  for (const [component, tag] of [
    [controls.PublicTextarea, "textarea"],
    [controls.PublicSelect, "select"],
  ]) {
    const ref = React.createRef();
    const onChange = () => {};
    const element = component({
      appearance: "context",
      className: "existing",
      ref,
      onChange,
      required: true,
      name: "message",
    });
    assert.equal(element.type, tag);
    assert.equal(element.props.ref, ref);
    assert.equal(element.props.onChange, onChange);
    assert.equal(element.props.required, true);
    assert.equal(element.props.name, "message");
    assert.equal(element.props.className, "existing");
    assert.equal(element.props.appearance, undefined);
  }
  const html = render(controls.PublicTextarea, {
    appearance: "context",
    defaultValue: "Pôvodný text",
    rows: 6,
    maxLength: 3000,
  });
  assert.match(html, /rows="6"/);
  assert.match(html, /maxLength="3000"/);
  assert.match(html, />Pôvodný text<\/textarea>/);
});

test("context empty states retain their native wrapper, children, reset link and existing CSS class", () => {
  const children = [
    React.createElement("strong", { key: "title" }, "Pripravujeme"),
    React.createElement("a", { key: "reset", href: "/podujatia" }, "Vymazať filtre"),
  ];
  const html = render(
    states.PublicEmptyState,
    { variant: "context", className: "existing", "data-original": "kept" },
    ...children,
  );
  assert.equal(
    html.replace(' data-public-empty-state="true"', ""),
    '<div data-original="kept" class="existing"><strong>Pripravujeme</strong><a href="/podujatia">Vymazať filtre</a></div>',
  );
  const inline = render(
    states.PublicEmptyState,
    { variant: "context", as: "p", className: "inline" },
    "Bez výsledkov",
  );
  assert.match(inline, /^<p class="inline"/);
  assert.doesNotMatch(inline, /role=|<h[23]|class="empty/);
  assert.match(render(states.PublicEmptyState, { title: "Prázdny zoznam" }), /role="status"/);
});

test("context media retains decorative semantics and all three existing icon sizes", () => {
  for (const size of [34, 36, 38]) {
    const html = render(media.PublicMediaFallback, {
      appearance: "context",
      className: "original-frame",
      iconSize: size,
      decorative: true,
    });
    assert.match(html, /class="original-frame"/);
    assert.match(html, /aria-hidden="true"/);
    assert.match(html, new RegExp(`width="${size}"`));
    assert.doesNotMatch(html, /role=|aria-label=|Fotografia sa pripravuje/);
  }
  const detail = render(media.PublicMediaFallback, { size: "detail", label: "Fotografia služby" });
  assert.match(detail, /role="img"/);
  assert.match(detail, /aria-label="Fotografia služby"/);
  assert.match(detail, /width="64"/);
  assert.match(detail, /Fotografia sa pripravuje/);
});

test("central article CTA preserves sponsorship, target, rel and screen-reader disclosure", () => {
  const html = render(callouts.PublicArticleCallout, {
    href: "https://example.com",
    buttonText: "Pozrieť",
    text: "Text",
    sponsored: true,
    newTab: true,
  });
  assert.match(html, /class="article-block-cta is-sponsored"/);
  assert.match(html, /Partnerský odkaz/);
  assert.match(html, /target="_blank"/);
  assert.match(html, /rel="sponsored nofollow noreferrer"/);
  assert.match(html, /otvorí sa v novom okne/);
  const native = render(callouts.PublicArticleCallout, { href: "/plemena", buttonText: "Plemená" });
  assert.doesNotMatch(native, /target=|rel=|Partnerský odkaz|<div>/);
});

test("shared context pagination preserves native query links, search slots and review wording", () => {
  const html = render(states.PublicPagination, {
    variant: "context",
    className: "search",
    currentPage: 1,
    totalPages: 3,
    summaryAs: "span",
    emptyDisabledControls: true,
    nextHref: "/hladat?q=pes&lokalita=Nitra&page=2",
  });
  assert.match(html, /<span><\/span><span aria-current="page">Strana 1 z 3<\/span>/);
  assert.match(html, /href="\/hladat\?q=pes&amp;lokalita=Nitra&amp;page=2" rel="next"/);
  assert.doesNotMatch(html, /class="pagination|<strong|aria-disabled/);
  const review = render(states.PublicPagination, {
    variant: "context",
    currentPage: 2,
    totalPages: 2,
    previousHref: "/adresar/test?recenzie=1#recenzie",
    previousLabel: "← Predchádzajúce",
    nextLabel: "Ďalšie →",
  });
  assert.match(review, /rel="prev">← Predchádzajúce/);
  assert.match(review, /aria-disabled="true">Ďalšie →/);
  assert.equal(render(states.PublicPagination, { currentPage: 1, totalPages: 1 }), "");
});

test("context notices retain focus refs, live-region semantics and existing retry actions", () => {
  const ref = React.createRef();
  const element = states.PublicNotice({
    appearance: "context",
    tone: "error",
    ref,
    tabIndex: -1,
    role: "status",
    "aria-live": "polite",
    className: "original",
    children: "Chyba",
  });
  assert.equal(element.props.ref, ref);
  assert.equal(element.props.tabIndex, -1);
  assert.equal(element.props.role, "status");
  assert.equal(element.props["aria-live"], "polite");
  assert.equal(element.props.className, "original");
  const retry = () => {};
  const action = React.createElement("button", { onClick: retry }, "Znova");
  const notice = states.PublicNotice({
    as: "div",
    appearance: "context",
    tone: "error",
    children: action,
  });
  assert.equal(notice.type, "div");
  assert.equal(notice.props.children.props.onClick, retry);
  assert.equal(notice.props.role, "alert");
  assert.doesNotMatch(
    render(states.PublicNotice, { as: "div", appearance: "context", role: null }, "Súhrn"),
    /role=/,
  );
});

test("context loading keeps dot and map-card variants without injecting a spinner or live region", () => {
  const dot = render(states.PublicLoadingState, {
    as: "span",
    appearance: "context",
    className: "dot",
    "aria-label": "Načítavam výsledky",
  });
  assert.match(dot, /^<span role="status"/);
  assert.match(dot, /aria-label="Načítavam výsledky"/);
  assert.doesNotMatch(dot, /spinner|aria-live|Načítavam…/);
  assert.match(render(states.PublicLoadingState, {}), /aria-live="polite"/);
  assert.match(render(states.PublicLoadingState, {}), /class="spinner"/);
});
