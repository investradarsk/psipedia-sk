import assert from "node:assert/strict";
import test from "node:test";
import {
  editorialToEventMarkdown, eventMarkdownToEditorial,
} from "../lib/event-lexical-markdown.ts";

test("supported existing event Markdown survives an exact read/serialize round trip", () => {
  const samples = [
    "",
    "Jednoduchý popis",
    "Prvý riadok\nDruhý riadok\n\nNový odsek.",
    "## Program\n\n**Tučné** a *kurzíva*\n\n- Vstup\n- Doklady\n\n1. Príchod\n2. Štart\n\n[Web](/podujatia/test)",
    "### Praktické informácie\n\n[Prihláška](https://example.org/prihlaska) a **dôležitý** údaj",
    "<script>alert(1)</script> a &lt;script&gt; sú iba text",
    "České a slovenské znaky: ľščťžýáô 🐕",
  ];
  for (const source of samples) {
    const doc = eventMarkdownToEditorial(source);
    assert.ok(doc, "A supported Markdown source should open in Lexical: " + source);
    assert.equal(editorialToEventMarkdown(doc), source);
  }
});

test("noncanonical or unsupported event Markdown stays in the original source editor", () => {
  const legacy = [
    "* stará odrážka",
    "1. Prvý\n3. Tretí",
    "## Nadpis\n\n\nText",
    "Text s CRLF\r\nNový riadok",
    "[Email](mailto:klub@example.org)",
    "[Sekcia](#sekcia)",
    "[Web](https://example.org)",
    "Text\n",
    "\nText",
  ];
  for (const source of legacy) {
    assert.equal(eventMarkdownToEditorial(source), null, "Must preserve legacy source: " + source);
  }
});

test("Lexical changes continue to be saved as Markdown strings without API migration", () => {
  const before = eventMarkdownToEditorial("## Program\n\nPôvodný odsek");
  assert.ok(before);
  const edited = {
    ...before,
    content: [...before.content, { type: "bulletList", items: [[{ type: "text", text: "Nová položka" }]] }],
  };
  assert.equal(editorialToEventMarkdown(edited), "## Program\n\nPôvodný odsek\n\n- Nová položka");
});

test("huge source is never silently truncated during a Lexical conversion", () => {
  assert.equal(eventMarkdownToEditorial("x".repeat(20_001)), null);
});
