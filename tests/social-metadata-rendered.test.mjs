import assert from "node:assert/strict";
import test from "node:test";

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function assertTagAttributes(html, tagName, attributes) {
  const lookaheads = Object.entries(attributes)
    .map(([name, value]) => `(?=[^>]*\\b${escapeRegExp(name)}=["']${escapeRegExp(value)}["'])`)
    .join("");
  assert.match(html, new RegExp(`<${tagName}${lookaheads}[^>]*>`, "i"));
}

test("rendered homepage emits one absolute canonical OG/Twitter contract", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("social-metadata", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 200);
  const html = await response.text();
  const title = "Psipedia.sk – rozumej svojmu psovi";
  const description = "Praktické a zrozumiteľné články o výcviku, zdraví, výžive, plemenách a živote so psom.";
  const canonical = "https://psipedia.sk/";
  const image = "https://psipedia.sk/images/hero-labrador.webp";

  assertTagAttributes(html, "link", { rel: "canonical", href: canonical });
  assertTagAttributes(html, "meta", { property: "og:title", content: title });
  assertTagAttributes(html, "meta", { property: "og:description", content: description });
  assertTagAttributes(html, "meta", { property: "og:url", content: canonical });
  assertTagAttributes(html, "meta", { property: "og:type", content: "website" });
  assertTagAttributes(html, "meta", { property: "og:locale", content: "sk_SK" });
  assertTagAttributes(html, "meta", { property: "og:site_name", content: "Psipedia.sk" });
  assertTagAttributes(html, "meta", { property: "og:image", content: image });
  assertTagAttributes(html, "meta", { name: "twitter:card", content: "summary_large_image" });
  assertTagAttributes(html, "meta", { name: "twitter:title", content: title });
  assertTagAttributes(html, "meta", { name: "twitter:description", content: description });
  assertTagAttributes(html, "meta", { name: "twitter:image", content: image });
});
