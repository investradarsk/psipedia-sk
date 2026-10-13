import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PATHS, modePlan, median, extractLab, summarizeRuns, toCsv, comparisons, probePage, probeException, queryCrux, diagnoseLighthouse, shouldRetryLighthouse, safeReportUrl, runLighthouse } from '../scripts/web-perf-observability.mjs';

test('bounded workloads, never user-supplied URLs', () => {
  assert.equal(PATHS.length, 8);
  assert.equal(modePlan('weekly').paths.length * 2 * modePlan('weekly').repeats, 4);
  assert.equal(modePlan('quick').paths.length * 2 * modePlan('quick').repeats, 16);
  assert.equal(modePlan('baseline').paths.length * 2 * modePlan('baseline').repeats, 48);
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


test('response cancellation failure cannot erase a valid HTTP 200 + HTML response', async () => {
  const response = () => ({
    status: 200, url: 'https://psipedia.sk/adresar/veterinari',
    headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }),
    body: { cancel: async () => { throw new TypeError('terminated; do not expose this message'); } },
  });
  let calls = 0;
  const result = await probePage('https://psipedia.sk/adresar/veterinari', async () => { calls++; return response(); }, { retryDelayMs: 0 });
  assert.equal(result.ok, true);
  assert.equal(result.status, 200);
  assert.equal(calls, 1);
  assert.equal(result.diagnostics[0].stream_warning, 'fetch_type_error');
  assert.doesNotMatch(JSON.stringify(result), /do not expose this message/);
});

test('transient Node fetch reset retries once and retains sanitized diagnostic', async () => {
  let count = 0;
  const result = await probePage('https://psipedia.sk/', async () => {
    count++;
    if (count === 1) throw Object.assign(new TypeError('private token could appear here'), { cause: { code: 'ECONNRESET', message: 'private' } });
    return { status: 200, url: 'https://psipedia.sk/', headers: new Headers({ 'content-type': 'text/html' }) };
  }, { sleep: async () => {} });
  assert.equal(result.ok, true);
  assert.equal(result.attempts, 2);
  assert.equal(result.diagnostics[0].error_code, 'ECONNRESET');
  assert.equal(result.diagnostics[0].reason, 'connection_error');
  assert.doesNotMatch(JSON.stringify(result), /private|token/);
});

test('two failed transient fetches stop after 2 attempts, without fake HTTP status', async () => {
  let count = 0;
  const result = await probePage('https://psipedia.sk/', async () => {
    count++;
    throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'UND_ERR_CONNECT_TIMEOUT' } });
  }, { sleep: async () => {} });
  assert.equal(count, 2);
  assert.equal(result.status, null);
  assert.equal(result.ok, false);
  assert.equal(result.error, 'undici_transport');
  assert.equal(result.diagnostics.length, 2);
});

test('404, 500 and non-HTML responses must never be retried or converted to success', async () => {
  for (const [status, contentType] of [[404, 'text/html'], [500, 'text/html'], [200, 'application/json']]) {
    let count = 0;
    const result = await probePage('https://psipedia.sk/', async () => {
      count++;
      return { status, url: 'https://psipedia.sk/', headers: new Headers({ 'content-type': contentType }) };
    }, { sleep: async () => {} });
    assert.equal(count, 1);
    assert.equal(result.status, status);
    assert.equal(result.ok, false);
    assert.equal(result.error, status === 200 ? 'unexpected_content_type' : 'unexpected_http_status');
  }
});

test('permanent DNS or TLS failures do not waste retry time or disclose raw messages', async () => {
  for (const code of ['ENOTFOUND', 'CERT_HAS_EXPIRED']) {
    let count = 0;
    const result = await probePage('https://psipedia.sk/', async () => {
      count++;
      throw Object.assign(new TypeError('secret-from-network-error'), { cause: { code } });
    }, { sleep: async () => {} });
    assert.equal(count, 1);
    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0].error_code, code);
    assert.doesNotMatch(JSON.stringify(result), /secret-from-network-error/);
  }
  assert.deepEqual(probeException({ name: 'TypeError', cause: { code: 'unexpected-secret' } }), {
    exception_name: 'TypeError', error_code: null, reason: 'fetch_type_error', retryable: true,
  });
});

test('timeout abort is diagnosed and retried only once', async () => {
  let count = 0;
  const result = await probePage('https://psipedia.sk/', (_url, opts) => {
    count++;
    return new Promise((_resolve, reject) =>
      opts.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true }));
  }, { timeoutMs: 8, sleep: async () => {} });
  assert.equal(count, 2);
  assert.equal(result.ok, false);
  assert.equal(result.error, 'probe_timeout');
  assert.equal(result.attempts, 2);
});

test('Quick mode can probe all eight URLs and admit exactly 16 device measurements', async () => {
  const plan = modePlan('quick');
  let probes = 0;
  let browserRunsEligible = 0;
  for (const path of plan.paths) {
    const url = new URL(path, 'https://psipedia.sk').href;
    const result = await probePage(url, async () => {
      probes++;
      return { status: 200, url, headers: new Headers({ 'content-type': 'text/html' }) };
    });
    if (result.ok) browserRunsEligible += 2 * plan.repeats;
  }
  assert.equal(probes, 8);
  assert.equal(browserRunsEligible, 16);
});

test('Lighthouse diagnostics distinguish navigation, runtime, audits and unavailable score', () => {
  const audits = Object.fromEntries([
    'first-contentful-paint', 'largest-contentful-paint', 'speed-index',
    'total-blocking-time', 'cumulative-layout-shift',
  ].map((id) => [id, { score: 0.5, scoreDisplayMode: 'numeric' }]));
  const report = (score) => ({ categories: { performance: { score } }, audits });
  const validZero = diagnoseLighthouse({ lhr: report(0) });
  assert.equal(validZero.failure_code, null, 'legitimate score zero must not be missing');
  assert.equal(diagnoseLighthouse({ lhr: report(null) }).failure_code, 'LH_SCORE_MISSING');
  assert.equal(diagnoseLighthouse({ lhr: report(2) }).failure_code, 'LH_SCORE_INVALID');
  assert.equal(diagnoseLighthouse({ lhr: { audits } }).failure_code, 'LH_CATEGORY_MISSING');
  assert.equal(diagnoseLighthouse({ lhr: { categories: { performance: { score: null } }, audits: {} } }).failure_code, 'LH_AUDITS_MISSING');
  const failure = diagnoseLighthouse({ lhr: { ...report(null), audits: {
    ...audits, 'largest-contentful-paint': { score: null, scoreDisplayMode: 'error' },
  } } });
  assert.equal(failure.failure_code, 'LH_AUDIT_FAILED');
  assert.equal(failure.audit_status['largest-contentful-paint'], 'error');
  assert.equal(diagnoseLighthouse({ reportStatus: 'invalid' }).failure_code, 'LH_REPORT_INVALID');
  assert.equal(diagnoseLighthouse({ reportStatus: 'missing', exitStatus: 1 }).failure_code, 'LH_CLI_NONZERO_EXIT');
  assert.equal(diagnoseLighthouse({ reportStatus: 'missing' }).failure_code, 'LH_REPORT_MISSING');
  assert.equal(diagnoseLighthouse({ lhr: report(0.9), spawnErrorCode: 'ETIMEDOUT' }).failure_code, 'LH_PROCESS_TIMEOUT');
  assert.equal(diagnoseLighthouse({ lhr: { ...report(null), runtimeError: { code: 'NO_FCP', message: 'secret' } } }).failure_code, 'LH_RUNTIME_FAILED');
  assert.equal(diagnoseLighthouse({ lhr: { ...report(null), runtimeError: { code: 'ERRORED_DOCUMENT_REQUEST', message: 'secret' } } }).failure_code, 'LH_NAVIGATION_FAILED');
});

test('Diagnostics redact untrusted error strings and retry only transient Quick failures', () => {
  const report = {
    categories: { performance: { score: null } },
    audits: { 'first-contentful-paint': { score: null } },
    runtimeError: { code: 'TOKEN-secret-https://private.example?cookie=123', message: 'cookie=123' },
  };
  const diagnostic = diagnoseLighthouse({ lhr: report });
  assert.equal(diagnostic.runtime_error_code, 'UNRECOGNIZED');
  assert.equal(diagnostic.failure_code, 'LH_RUNTIME_FAILED');
  assert.doesNotMatch(JSON.stringify(diagnostic), /cookie|private|secret/i);
  assert.equal(shouldRetryLighthouse({ ok: false, diagnostic }, 'quick'), true);
  assert.equal(shouldRetryLighthouse({ ok: false, diagnostic }, 'weekly'), false);
  assert.equal(shouldRetryLighthouse({ ok: false, diagnostic }, 'baseline'), false);
  assert.equal(shouldRetryLighthouse({ ok: false, diagnostic: diagnoseLighthouse({ reportStatus: 'missing', spawnErrorCode: 'ENOENT' }) }, 'quick'), false);
  assert.equal(shouldRetryLighthouse({ ok: true, diagnostic }, 'quick'), false);
});

test('One HTTP/HTML probe per eight fixed Quick paths, including /pomoc-psom', () => {
  assert.ok(PATHS.includes('/pomoc-psom'));
  assert.equal(modePlan('quick').paths.length * 2, 16);
  assert.equal(modePlan('weekly').paths.length * 2, 4);
});

test('fixed public URLs never leak arbitrary Lighthouse redirect query parameters', () => {
  assert.equal(safeReportUrl('https://psipedia.sk/'), 'https://psipedia.sk/');
  assert.equal(safeReportUrl('https://psipedia.sk/pomoc-psom'), 'https://psipedia.sk/pomoc-psom');
  assert.equal(safeReportUrl('https://psipedia.sk/?token=secret'), null);
  assert.equal(safeReportUrl('https://psipedia.sk/private/path'), null);
  assert.equal(safeReportUrl('https://example.org/'), null);
});

test('offline simulated Lighthouse wrapper: valid zero, invalid report and sanitized error', () => {
  const folder = mkdtempSync(join(tmpdir(), 'psipedia-web-perf-'));
  const base = join(folder, 'home-desktop-1');
  const audits = { 'first-contentful-paint': { score: 0, scoreDisplayMode: 'numeric' } };
  const makeSpawn = (lhr) => (_bin, args, options) => {
    assert.ok(args.includes('--preset=desktop'));
    assert.ok(options.timeout <= 120_000);
    writeFileSync(`${base}.report.json`, JSON.stringify(lhr));
    return { status: 0, error: null, signal: null };
  };
  try {
    const valid = runLighthouse('stub', 'https://psipedia.sk/', 'desktop', base,
      makeSpawn({ categories: { performance: { score: 0 } }, audits,
        finalUrl: 'https://psipedia.sk/?cookie=secret', lighthouseVersion: '12.8.2',
        fetchTime: '2026-10-13T21:00:00Z' }));
    assert.equal(valid.ok, true);
    assert.equal(valid.lab.score, 0);
    const report = JSON.parse(readFileSync(`${base}.report.json`, 'utf8'));
    assert.equal(report.final_url, null);
    assert.doesNotMatch(JSON.stringify(report), /cookie=secret/);

    const bad = runLighthouse('stub', 'https://psipedia.sk/', 'desktop', base,
      makeSpawn({ categories: { performance: { score: null } }, audits,
        runtimeError: { code: 'ERRORED_DOCUMENT_REQUEST', message: 'cookie=secret' } }));
    assert.equal(bad.ok, false);
    assert.equal(bad.error, 'LH_NAVIGATION_FAILED');
    assert.equal(bad.diagnostic.runtime_error_code, 'ERRORED_DOCUMENT_REQUEST');
    assert.equal(existsSync(`${base}.report.json`), false);
    assert.doesNotMatch(JSON.stringify(bad), /cookie=secret/);
    const missing = runLighthouse('stub', 'https://psipedia.sk/', 'desktop', base,
      () => ({ status: 1, error: null, signal: null }));
    assert.equal(missing.error, 'LH_CLI_NONZERO_EXIT');
    assert.equal(missing.ok, false);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
