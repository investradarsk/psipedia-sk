
  const tipPage = await worker.fetch(new Request("http://localhost/novinky/poslat-tip", { headers: { accept: "text/html" } }), bindings, context);
  assert.equal(tipPage.status, 200);
  const tipHtml = await tipPage.text();
  assert.match(tipHtml, /Pošli tip Psipedii/);
  assert.match(tipHtml, /Čo by sme mali preveriť/);
  assert.match(tipHtml, /Odoslať tip redakcii/);
  assert.match(tipHtml, /Tip nie je automaticky článok/);
});

test("searches the whole portal on a dedicated results URL", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("search-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const response = await worker.fetch(
    new Request("http://localhost/hladat?q=labrador", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );

  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Čo hľadáš/);
  // SEARCH-1 intentionally renders a contextual zero-result state when the
  // isolated rendered-HTML fixture has no searchable corpus. The dedicated
  // search-engine tests cover populated heterogeneous result ranking.
  assert.match(html, /Výsledky pre|Nenašli sme presnú zhodu/);
  assert.match(html, /labrador/i);
});

test("renders article freshness and expert sources", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("article-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
