import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { planArticleSourceDisplay } from "../lib/article-source-dedup.ts";

test("bibliography links already in the article are not rendered twice", () => {
  const duplicateUrl = "https://pubmed.ncbi.nlm.nih.gov/35883300/";
  const uniqueUrl = "https://www.vet.cornell.edu/clinical-guide";
  const blocks = [
    { id: "intro", type: "text", content: "Praktické informácie o spánku." },
    { id: "source-heading", type: "h2", text: "Odborné zdroje" },
    { id: "manual-list", type: "bullet-list", items: [
      "[Tooley & Heath](https://pubmed.ncbi.nlm.nih.gov/35883300/) – primárna štúdia",
    ] },
    { id: "duplicate-source", type: "source", label: "Tooley & Heath", url: duplicateUrl },
    { id: "additional-source", type: "source", label: "Cornell", url: uniqueUrl },
  ];
  const plan = planArticleSourceDisplay(blocks);
  assert.equal(plan.hasManualSourceSection, true);
  assert.deepEqual(plan.sourceBlocks.map(block => block.id), ["additional-source"]);
  assert.equal(plan.contentBlocks.length, 3);
});

test("all structured sources remain visible without a manual bibliography", () => {
  const blocks = [
    { id: "h2", type: "h2", text: "Socializácia psa" },
    { id: "p", type: "text", content: "Pravidelný odpočinok." },
    { id: "source", type: "source", label: "Cornell", url: "https://www.vet.cornell.edu/" },
  ];
  const plan = planArticleSourceDisplay(blocks);
  assert.equal(plan.hasManualSourceSection, false);
  assert.equal(plan.sourceBlocks.length, 1);
});

test("a plain article section mentioning a source URL is not treated as a bibliography", () => {
  const url = "https://pubmed.ncbi.nlm.nih.gov/35883300/";
  const plan = planArticleSourceDisplay([
    { id: "h2", type: "h2", text: "Čo hovoria štúdie" },
    { id: "body", type: "text", content: "Pozri " + url },
    { id: "source", type: "source", label: "Study", url },
  ]);
  assert.equal(plan.sourceBlocks.length, 1);
  const detail = readFileSync(new URL("../components/article-detail.tsx", import.meta.url), "utf8");
  assert.match(detail, /planArticleSourceDisplay\(blocks\)/);
  assert.match(detail, /sourceHeading=\{hasManualSourceSection/);
});
