import test from 'node:test';
import assert from 'node:assert/strict';
import { PATHS, modePlan, median, extractLab, summarizeRuns, toCsv, comparisons, probePage, queryCrux } from '../scripts/web-perf-observability.mjs';

test('bounded workloads, never user-supplied URLs', () => {
  assert.equal(PATHS.length, 7);
  assert.equal(modePlan('weekly').paths.length * 2 * modePlan('weekly').repeats, 4);
  assert.equal(modePlan('quick').paths.length * 2 * modePlan('quick').repeats, 14);
  assert.equal(modePlan('baseline').paths.length * 2 * modePlan('baseline').repeats, 42);
  assert.throws(() => modePlan('unknown'), /Invalid mode/);
});

test('median excludes missing metrics; no synthetic results', () => {
  assert.equal(median([null, 200, 100, undefined, 300]), 200);
  assert.equal(median([100, 300]), 200);
  assert.equal(median([undefined, null, NaN]), null);
});

test('extract lab metrics and actual LCP node, separating true TTFB from server diagnostic', () => {
  const report = {
    categories: { performance: { score: 0.88 } },
    audits: {
      'largest-contentful-paint': { numericValue: 2400 },
      'cumulative-layout-shift': { numericValue: 0.02 },
      'total-blocking-time': { numericValue: 80 },
      'server-response-time': { numericValue: 10 },
      metrics: { details: { items: [{ observedTimeToFirstByte: 328 }] } },
      'largest-contentful-paint-element': { details: { items: [{ node: { type: 'node', selector: 'img.hero' } }] } },
      'resource-summary': { details: { items: [
        { resourceType: 'script', transferSize: 32000 },
        { resourceType: 'stylesheet', transferSize: 6000 },
        { resourceType: 'image', transferSize: 47000 },
      ] } },
    },
  };
  assert.deepEqual(extractLab(report), {
    score: 88, lcp_ms: 2400, cls: 0.02, ttfb_ms: 328, tbt_ms: 80,
    js_transfer_bytes: 32000, css_transfer_bytes: 6000, image_transfer_bytes: 47000,
    lcp_element: 'img.hero', runtime_error: null,
  });
  assert.equal(extractLab({ audits: { 'server-response-time': { numericValue: 20 } } }).ttfb_ms, null);
});

test('summaries report only successful Lighthouse runs; field INP is independent', () => {
  const probe = { status: 200, final_url: 'https://psipedia.sk/', cache_headers: { 'cf-cache-status': 'HIT', 'x-psipedia-cache': 'HIT' } };
  const a = summarizeRuns('/', 'mobile', probe, [
    { ok: true, lab: { score: 70, lcp_ms: 2000, lcp_element: '#hero' } },
    { ok: true, lab: { score: 80, lcp_ms: 1500 } },
    { ok: false },
  ], { status: 'available', scope: 'url', inp_p75_ms: 122 });
  assert.equal(a.score, 75);
  assert.equal(a.lcp_ms, 1750);
  assert.equal(a.successful_runs, 2);
  assert.equal(a.field_inp_p75_ms, 122);
  assert.match(toCsv([a]), /HIT,HIT,3,2,75/);
  assert.equal(comparisons([a, { ...a, device: 'desktop', score: 90 }])[0].mobile_minus_desktop.score, -15);
});

test('CSV safely quotes the LCP selector', () => {
  assert.match(toCsv([{ path: '/', device: 'mobile', lcp_element: 'img[data-x="a,b"]' }]), /"img\[data-x=""a,b""\]"/);
});

test('probe checks real origin, 200 HTML, and allowlisted cache headers', async () => {
  const mock = async () => ({ status: 200, url: 'https://psipedia.sk/', headers: new Headers({ 'content-type': 'text/html', 'cf-cache-status': 'HIT', 'x-psipedia-cache': 'HIT', 'set-cookie': 'private' }), body: { cancel: async () => {} } });
  const good = await probePage('https://psipedia.sk/', mock);
  assert.equal(good.ok, true);
  assert.equal(good.cache_headers['cf-cache-status'], 'HIT');
  assert.equal(good.cache_headers['x-psipedia-cache'], 'HIT');
  assert.equal(good.cache_headers['set-cookie'], undefined);
  const bad = await probePage('https://psipedia.sk/', async () => ({ ...(await mock()), url: 'https://example.com/' }));
  assert.equal(bad.ok, false);
});

test('CrUX data is optional and does not fabricate INP', async () => {
  assert.deepEqual(await queryCrux('https://psipedia.sk/', 'mobile', ''), { status: 'not_configured', scope: null, inp_p75_ms: null });
  const found = await queryCrux('https://psipedia.sk/', 'mobile', 'sample', async (_url, req) => {
    assert.equal(JSON.parse(req.body).formFactor, 'PHONE');
    return { ok: true, json: async () => ({ record: { metrics: { interaction_to_next_paint: { percentiles: { p75: 210 } } } } }) };
  });
  assert.deepEqual(found, { status: 'available', scope: 'url', inp_p75_ms: 210 });
});
