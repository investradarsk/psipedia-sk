import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  ARTICLE_PARTNER_DISCLOSURE,
  prepareArticlePartnerDisclosure,
} from "../lib/article-affiliate-disclosure.ts";

const view = readFileSync("components/article-detail.tsx", "utf8");

test("standalone Notion disclaimer is hidden but cannot trigger the footer by itself", () => {
  const blocks = [
    { id: "product", type: "text", content: "Drevená hračka na aport." },
    { id: "legacy-note", type: "text", content: "Obsahuje reklamné odkazy." },
    { id: "sources", type: "h2", text: "Odborné zdroje" },
  ];
  const result = prepareArticlePartnerDisclosure(blocks);
  assert.deepEqual(result.blocks.map((block) => block.id), ["product", "sources"]);
  assert.equal(result.showDisclosure, false);
  assert.deepEqual(blocks.map((block) => block.id), ["product", "legacy-note", "sources"], "notion and D1 are not mutated");
  assert.equal(ARTICLE_PARTNER_DISCLOSURE, "Článok obsahuje partnerské odkazy.");
});

test("partner link in a Notion rich-text mark triggers the footer without an inline notice", () => {
  const blocks = [{
    id: "product", type: "text", content: "Hračka Chinka wood",
    richText: {
      type: "doc", version: 1, content: [{
        type: "paragraph", content: [{
          type: "text", text: "Chinka wood",
          marks: [{ type: "link", href: "https://go.dognet.com/?chid=PW4rE4bS" }],
        }],
      }],
    },
  }];
  const result = prepareArticlePartnerDisclosure(blocks);
  assert.equal(result.showDisclosure, true);
  assert.equal(result.blocks.length, 1);
});

test("Dognet link triggers the footer even when a legacy sentence is also present", () => {
  const blocks = [
    { id: "manual", type: "text", content: "Obsahuje reklamné odkazy." },
    {
      id: "product", type: "text", content: "Odporúčaná hračka",
      richText: {
        version: 2, type: "doc", content: [{
          type: "paragraph", content: [{
            type: "text", text: "Hračka",
            marks: [{ type: "link", href: "https://go.dognet.com/?campaign=123" }],
          }],
        }],
      },
    },
  ];
  const result = prepareArticlePartnerDisclosure(blocks);
  assert.equal(result.showDisclosure, true);
  assert.deepEqual(result.blocks.map((block) => block.id), ["product"]);
});

test("Dognet link within rich-text introduction is detected", () => {
  const intro = {
    version: 2, type: "doc", content: [{
      type: "paragraph", content: [{
        type: "text", text: "Pomôcka", marks: [{
          type: "link", href: "https://go.dognet.com/?cid=1",
        }],
      }],
    }],
  };
  const result = prepareArticlePartnerDisclosure([], intro);
  assert.equal(result.showDisclosure, true);
});

test("editorial articles without affiliate links retain their body and no disclaimer", () => {
  const blocks = [
    { id: "normal", type: "text", content: "V článku vysvetľujeme reklamné odkazy ako tému." },
    { id: "ordinary-link", type: "source", label: "Veterinárny zdroj", url: "https://example.org/articles/" },
  ];
  const result = prepareArticlePartnerDisclosure(blocks);
  assert.equal(result.showDisclosure, false);
  assert.deepEqual(result.blocks, blocks);
});

test("a full explanatory paragraph is not removed as a standalone disclosure", () => {
  const blocks = [{ id: "long", type: "text", content: "Obsahuje reklamné odkazy. Ďalší text vysvetľuje pravidlá." }];
  assert.deepEqual(prepareArticlePartnerDisclosure(blocks).blocks, blocks);
});

test("public article renders partner disclosure only at its existing bottom disclaimer", () => {
  assert.match(view, /prepareArticlePartnerDisclosure\(blocks, introDocument, takeawayDocument\)/);
  const beforeFooter = view.slice(0, view.indexOf('<p className="article-disclaimer">'));
  assert.doesNotMatch(beforeFooter, /ARTICLE_PARTNER_DISCLOSURE/);
  const afterFooter = view.slice(view.indexOf('<p className="article-disclaimer">'));
  assert.match(afterFooter, /data-article-partner-disclosure/);
  assert.match(afterFooter, /ARTICLE_PARTNER_DISCLOSURE/);
  assert.doesNotMatch(view, /je označený priamo pri príslušnom odkaze/);
});
