import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { compareSummaries, renderMarkdown } from '../scripts/web-perf-compare.mjs';

const BEFORE_SHA = '0123456789abcdef0123456789abcdef01234567';
const AFTER_SHA = 'fedcba9876543210fedcba9876543210fedcba98';
const DEPLOY = { beforeDeploymentSha: BEFORE_SHA, afterDeploymentSha: AFTER_SHA };

function fixture({ lcp = 3000, score = 70, paths = ['/', '/adresar'], repeats = 3 } = {}) {
  const lab_rows = paths.flatMap((path) => ['mobile', 'desktop'].map((device) => ({
    path, device, http_status: 200, probe_error: null,
    runs: repeats, successful_runs: repeats, score, lcp_ms: lcp, cls: 0.1,
    ttfb_ms: 400, tbt_ms: 300, js_transfer_bytes: 40000,
    css_transfer_bytes: 6000, image_transfer_bytes: 80000,
    field_status: 'not_configured', field_scope: null, field_inp_p75_ms: null,
  })));
  return {
    manifest: {
      schema_version: 2, source: 'https://psipedia.sk', mode: 'baseline', repeats,
      pages: paths.length, devices: 2, planned_lighthouse_runs: paths.length * repeats * 2,
      runner: 'Linux', node: 'v22.19.0', chrome: 'Google Chrome 154.0.0',
      lighthouse: '12.8.2', throttling: 'simulate',
      profile: { mobile: 'Lighthouse default mobile', desktop: 'Lighthouse desktop preset' },
      field_data_source: 'none', git_sha: 'a'.repeat(40),
    },
    lab_rows,
  };
}

const pair = () => [fixture(), fixture({ lcp: 2500, score: 80 })];
const slot = (report, path = '/', device = 'mobile') => report.slots.find((r) => r.path === path && r.device === device);

test('improvement: LCP/score lower and higher directions with signed delta', () => {
  const [a, b] = pair();
  const report = compareSummaries(a, b, DEPLOY);
  assert.equal(report.totals.comparable_slots, 4);
  assert.deepEqual(slot(report).metrics.lcp_ms, {
    before: 3000, after: 2500, delta: -500, delta_percent: -500 / 3000 * 100,
    status: 'IMPROVEMENT',
  });
  assert.equal(slot(report).metrics.score.status, 'IMPROVEMENT');
  assert.equal(report.comparison.before_production_deployment_sha, BEFORE_SHA);
  assert.equal(report.totals.improvements, 8);
});

test('regression: latency, transfers and Lighthouse score are directionally labelled', () => {
  const [a, b] = pair();
  b.lab_rows[0].lcp_ms = 3500;
  b.lab_rows[0].score = 55;
  b.lab_rows[0].js_transfer_bytes = 90000;
  const metrics = slot(compareSummaries(a, b, DEPLOY)).metrics;
  assert.equal(metrics.lcp_ms.status, 'REGRESSION');
  assert.equal(metrics.lcp_ms.delta, 500);
  assert.equal(metrics.score.status, 'REGRESSION');
  assert.equal(metrics.js_transfer_bytes.status, 'REGRESSION');
  assert.equal(metrics.css_transfer_bytes.status, 'UNCHANGED');
});

test('zero, null, missing and UNKNOWN have no fabricated values or percentage', () => {
  const [a, b] = pair();
  a.lab_rows[0].score = 0;
  b.lab_rows[0].score = 20;
  a.lab_rows[0].ttfb_ms = null;
  b.lab_rows[0].ttfb_ms = 0;
  b.lab_rows[0].tbt_ms = 'UNKNOWN';
  const result = slot(compareSummaries(a, b, DEPLOY));
  assert.equal(result.metrics.score.status, 'IMPROVEMENT');
  assert.equal(result.metrics.score.delta, 20);
  assert.equal(result.metrics.score.delta_percent, null);
  assert.equal(result.metrics.ttfb_ms.status, 'UNKNOWN');
  assert.equal(result.metrics.ttfb_ms.delta, null);
  assert.equal(result.metrics.tbt_ms.after, null);
  assert.equal(result.before.field_inp_p75_ms, null);
  assert.equal(result.after.field_inp_p75_ms, null);
  assert.doesNotMatch(renderMarkdown(compareSummaries(a, b, DEPLOY)), /NaN|Infinity/);
});

test('missing URL is excluded, not treated as a speed improvement', () => {
  const [a, b] = pair();
  b.lab_rows = b.lab_rows.filter((r) => !(r.path === '/adresar' && r.device === 'mobile'));
  const report = compareSummaries(a, b, DEPLOY);
  assert.equal(slot(report, '/adresar').status, 'MISSING_URL');
  assert.equal(slot(report, '/adresar').metrics.lcp_ms.delta, null);
  assert.equal(report.totals.missing_urls, 1);
});

test('HTTP 500 / failed probe is unavailable and excluded', () => {
  const [a, b] = pair();
  b.lab_rows[0].http_status = 500;
  b.lab_rows[0].successful_runs = 0;
  assert.equal(slot(compareSummaries(a, b, DEPLOY)).status, 'UNAVAILABLE_URL');
});

test('partial measurement cannot produce regression or improvement', () => {
  const [a, b] = pair();
  b.lab_rows[0].successful_runs = 2;
  const report = compareSummaries(a, b, DEPLOY);
  assert.equal(slot(report).status, 'INCOMPLETE_MEASUREMENT');
  assert.equal(slot(report).metrics.lcp_ms.status, 'UNKNOWN');
  assert.equal(report.totals.incomplete_slots, 1);
});

test('CrUX INP is exposed only when actually available at URL level, not derived from TBT', () => {
  const [a, b] = pair();
  a.lab_rows[0].field_inp_p75_ms = 180;
  a.lab_rows[0].field_scope = 'origin';
  a.lab_rows[0].field_status = 'available';
  b.lab_rows[0].field_inp_p75_ms = 160;
  b.lab_rows[0].field_scope = 'url';
  b.lab_rows[0].field_status = 'available';
  const result = slot(compareSummaries(a, b, DEPLOY));
  assert.equal(result.before.field_inp_p75_ms, null);
  assert.equal(result.after.field_inp_p75_ms, 160);
  assert.equal(Object.hasOwn(result.metrics, 'inp'), false);
});

test('different Lighthouse/Chrome/runner/mode/repeat/profile or source is refused', () => {
  for (const [key, value] of [['chrome', 'Google Chrome 150'], ['runner', 'Windows'], ['mode', 'quick'], ['repeats', 1], ['throttling', 'devtools']]) {
    const [a, b] = pair();
    b.manifest[key] = value;
    if (key === 'repeats') b.manifest.planned_lighthouse_runs = 4;
    assert.throws(() => compareSummaries(a, b, DEPLOY), /INCOMPARABLE_MEASUREMENT_CONFIG/);
  }
  const [a, b] = pair();
  b.manifest.profile.desktop = 'custom';
  assert.throws(() => compareSummaries(a, b, DEPLOY), /INCOMPARABLE_MEASUREMENT_CONFIG/);
  b.manifest.source = 'https://preview.psipedia.sk';
  assert.throws(() => compareSummaries(a, b, DEPLOY), /NON_PRODUCTION_SOURCE/);
});

test('rejects unverified/missing or mismatching deployment attestation and staging', () => {
  const [a, b] = pair();
  assert.throws(() => compareSummaries(a, b), /INVALID_PRODUCTION_DEPLOYMENT_SHA/);
  a.manifest.production_deployment_sha = BEFORE_SHA;
  assert.throws(() => compareSummaries(a, b, { ...DEPLOY, beforeDeploymentSha: AFTER_SHA }), /DEPLOYMENT_ATTESTATION_MISMATCH/);
  b.manifest.environment = 'staging';
  assert.throws(() => compareSummaries(a, b, DEPLOY), /NON_PRODUCTION_ENVIRONMENT/);
});

test('invalid schema, missing environment metadata, duplicate rows are rejected', () => {
  const [a, b] = pair();
  a.manifest.schema_version = 1;
  assert.throws(() => compareSummaries(a, b, DEPLOY), /UNSUPPORTED_SUMMARY_SCHEMA/);
  a.manifest.schema_version = 2;
  delete a.manifest.chrome;
  assert.throws(() => compareSummaries(a, b, DEPLOY), /MISSING_MEASUREMENT_CONFIG/);
  a.manifest.chrome = b.manifest.chrome;
  a.lab_rows.push({ ...a.lab_rows[0] });
  assert.throws(() => compareSummaries(a, b, DEPLOY), /DUPLICATE_LAB_ROW/);
});

test('offline CLI writes JSON + Markdown; invalid comparison writes nothing', () => {
  const root = mkdtempSync(join(tmpdir(), 'psipedia-perf-compare-'));
  try {
    const [a, b] = pair();
    const oldFile = join(root, 'before.json'), newFile = join(root, 'after.json');
    writeFileSync(oldFile, JSON.stringify(a));
    writeFileSync(newFile, JSON.stringify(b));
    const script = fileURLToPath(new URL('../scripts/web-perf-compare.mjs', import.meta.url));
    const args = [script, '--before', oldFile, '--after', newFile,
      '--before-deploy-sha', BEFORE_SHA, '--after-deploy-sha', AFTER_SHA,
      '--out', join(root, 'good')];
    execFileSync(process.execPath, args, { encoding: 'utf8', timeout: 5000 });
    const result = JSON.parse(readFileSync(join(root, 'good/compare.json'), 'utf8'));
    const md = readFileSync(join(root, 'good/compare.md'), 'utf8');
    assert.equal(result.totals.comparable_slots, 4);
    assert.match(md, /IMPROVEMENT/);
    assert.match(md, /TBT is NOT INP/);
    b.manifest.lighthouse = '13.0.0';
    writeFileSync(newFile, JSON.stringify(b));
    const failure = spawnSync(process.execPath, [...args.slice(0, -1), join(root, 'bad')], { encoding: 'utf8', timeout: 5000 });
    assert.equal(failure.status, 1);
    assert.match(failure.stderr, /INCOMPARABLE_MEASUREMENT_CONFIG/);
    assert.equal(existsSync(join(root, 'bad')), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
