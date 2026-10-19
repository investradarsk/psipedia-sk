#!/usr/bin/env node
// Offline comparison of sanitized web-perf-observability summary.json artifacts.
// Deliberately no import from the live measurement script and no network calls.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const METRICS = Object.freeze({
  lcp_ms: { label: 'LCP', unit: 'ms', better: 'lower' },
  cls: { label: 'CLS', unit: '', better: 'lower' },
  ttfb_ms: { label: 'TTFB', unit: 'ms', better: 'lower' },
  tbt_ms: { label: 'TBT', unit: 'ms', better: 'lower' },
  js_transfer_bytes: { label: 'JS transfer', unit: 'B', better: 'lower' },
  css_transfer_bytes: { label: 'CSS transfer', unit: 'B', better: 'lower' },
  image_transfer_bytes: { label: 'Image transfer', unit: 'B', better: 'lower' },
  score: { label: 'Lighthouse score', unit: 'points', better: 'higher' },
});

const ORIGIN = 'https://psipedia.sk';
const DEVICES = ['mobile', 'desktop'];
const SHA = /^[a-f0-9]{7,40}$/i;
const PATH = /^\/(?:[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*)?$/;
const UNKNOWN = 'UNKNOWN';
const CONFIG_KEYS = [
  'schema_version', 'source', 'mode', 'repeats', 'pages', 'devices',
  'planned_lighthouse_runs', 'runner', 'node', 'chrome', 'lighthouse',
  'throttling', 'profile.mobile', 'profile.desktop', 'field_data_source',
];

function reject(code) { throw new Error(code); }
function isObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function readKey(obj, path) { return path.split('.').reduce((value, key) => value?.[key], obj); }
function isKnown(value) {
  return value !== null && value !== undefined && value !== '' &&
    value !== 'unknown' && value !== 'UNKNOWN';
}
function nonnegative(value) { return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null; }
function positiveInteger(value) { return Number.isSafeInteger(value) && value > 0; }

function validateSummary(summary) {
  if (!isObject(summary) || !isObject(summary.manifest) || !Array.isArray(summary.lab_rows)) reject('INVALID_SUMMARY');
  const m = summary.manifest;
  if (m.schema_version !== 2) reject('UNSUPPORTED_SUMMARY_SCHEMA');
  if (m.source !== ORIGIN) reject('NON_PRODUCTION_SOURCE');
  for (const key of CONFIG_KEYS) if (!isKnown(readKey(m, key))) reject('MISSING_MEASUREMENT_CONFIG');
  if (!positiveInteger(m.repeats) || !positiveInteger(m.pages) || m.devices !== 2 ||
      !positiveInteger(m.planned_lighthouse_runs) ||
      m.planned_lighthouse_runs !== m.pages * m.devices * m.repeats) reject('INVALID_MEASUREMENT_PLAN');
  // Manifests from the existing collector do not record the deployed SHA.
  // Never treat manifest.git_sha (measurement checkout) as the deployed revision.
  for (const key of ['environment', 'deployment_environment']) {
    if (m[key] !== undefined && m[key] !== 'production') reject('NON_PRODUCTION_ENVIRONMENT');
  }
  const rows = new Map();
  for (const row of summary.lab_rows) {
    if (!isObject(row) || typeof row.path !== 'string' || !PATH.test(row.path) ||
        !DEVICES.includes(row.device)) reject('INVALID_LAB_ROW');
    const key = `${row.device}\u0000${row.path}`;
    if (rows.has(key)) reject('DUPLICATE_LAB_ROW');
    rows.set(key, row);
  }
  if (rows.size > m.pages * m.devices) reject('EXCESS_LAB_ROWS');
  return rows;
}

function deploymentSha(value) {
  if (typeof value !== 'string' || !SHA.test(value)) reject('INVALID_PRODUCTION_DEPLOYMENT_SHA');
  return value.toLowerCase();
}
function assertDeployment(manifest, provided) {
  const deployed = deploymentSha(provided);
  if (manifest.production_deployment_sha !== undefined &&
      deploymentSha(manifest.production_deployment_sha) !== deployed) reject('DEPLOYMENT_ATTESTATION_MISMATCH');
  return deployed;
}

function metricDelta(before, after, better) {
  const a = nonnegative(before), b = nonnegative(after);
  if (a === null || b === null) return { before: a, after: b, delta: null, delta_percent: null, status: UNKNOWN };
  const delta = b - a;
  const status = delta === 0 ? 'UNCHANGED' :
    (better === 'lower' ? delta < 0 : delta > 0) ? 'IMPROVEMENT' : 'REGRESSION';
  return { before: a, after: b, delta, delta_percent: a === 0 ? null : (delta / a) * 100, status };
}

function slotState(before, after, repeats) {
  if (!before || !after) return 'MISSING_URL';
  if (before.http_status !== 200 || after.http_status !== 200 || before.probe_error || after.probe_error) return 'UNAVAILABLE_URL';
  if (before.runs !== repeats || after.runs !== repeats ||
      before.successful_runs !== repeats || after.successful_runs !== repeats) return 'INCOMPLETE_MEASUREMENT';
  return 'COMPARABLE';
}
function inp(row) {
  // CrUX is rolling real-user field data, not a Lighthouse lab metric.
  // Preserve it for context only; never derive it from TBT or compare it.
  return row?.field_status === 'available' && row.field_scope === 'url'
    ? nonnegative(row.field_inp_p75_ms) : null;
}
function slotEvidence(row, repeats) {
  return {
    http_status: Number.isInteger(row?.http_status) ? row.http_status : null,
    runs: Number.isInteger(row?.runs) ? row.runs : null,
    successful_runs: Number.isInteger(row?.successful_runs) ? row.successful_runs : null,
    expected_runs: repeats,
    field_inp_p75_ms: inp(row),
    field_status: typeof row?.field_status === 'string' && /^[a-z_]+$/.test(row.field_status)
      ? row.field_status : UNKNOWN,
  };
}

// Compare anonymous summaries. Deployment SHAs must be independently supplied from production records.
export function compareSummaries(before, after, { beforeDeploymentSha, afterDeploymentSha } = {}) {
  const a = validateSummary(before), b = validateSummary(after);
  const am = before.manifest, bm = after.manifest;
  const beforeSha = assertDeployment(am, beforeDeploymentSha);
  const afterSha = assertDeployment(bm, afterDeploymentSha);
  for (const key of CONFIG_KEYS) {
    if (readKey(am, key) !== readKey(bm, key)) reject('INCOMPARABLE_MEASUREMENT_CONFIG');
  }
  const keys = [...new Set([...a.keys(), ...b.keys()])].sort();
  const totals = { comparable_slots: 0, missing_urls: 0, unavailable_urls: 0,
    incomplete_slots: 0, improvements: 0, regressions: 0, unchanged: 0, unknown: 0 };
  const slots = keys.map((key) => {
    const [device, path] = key.split('\u0000');
    const left = a.get(key), right = b.get(key);
    const status = slotState(left, right, am.repeats);
    if (status === 'COMPARABLE') totals.comparable_slots++;
    else if (status === 'MISSING_URL') totals.missing_urls++;
    else if (status === 'UNAVAILABLE_URL') totals.unavailable_urls++;
    else totals.incomplete_slots++;
    const metrics = {};
    for (const [name, desc] of Object.entries(METRICS)) {
      metrics[name] = status === 'COMPARABLE'
        ? metricDelta(left[name], right[name], desc.better)
        : { before: nonnegative(left?.[name]), after: nonnegative(right?.[name]),
            delta: null, delta_percent: null, status: UNKNOWN };
      const stat = metrics[name].status;
      if (stat === 'IMPROVEMENT') totals.improvements++;
      else if (stat === 'REGRESSION') totals.regressions++;
      else if (stat === 'UNCHANGED') totals.unchanged++;
      else totals.unknown++;
    }
    return { path, device, status, before: slotEvidence(left, am.repeats),
      after: slotEvidence(right, am.repeats), metrics };
  });
  return {
    schema_version: 1,
    comparison: {
      source: ORIGIN,
      before_production_deployment_sha: beforeSha,
      after_production_deployment_sha: afterSha,
      production_deployment_identity: 'independently supplied; not verified online',
      before_measurement_git_sha: typeof am.git_sha === 'string' ? am.git_sha : UNKNOWN,
      after_measurement_git_sha: typeof bm.git_sha === 'string' ? bm.git_sha : UNKNOWN,
      config: Object.fromEntries(CONFIG_KEYS.map((key) => [key, readKey(am, key)])),
    },
    totals, slots,
  };
}

function safeMd(text) { return String(text).replace(/[|\\\r\n`<>]/g, (ch) => ({
  '|': '\\|', '\\': '\\\\', '\r': ' ', '\n': ' ', '`': "'", '<': '&lt;', '>': '&gt;',
})[ch]); }
function valueText(v) { return v === null || v === undefined ? UNKNOWN : Number.isInteger(v) ? String(v) : String(Number(v.toFixed(3))); }
function signedText(v) { return v === null || v === undefined ? UNKNOWN : `${v > 0 ? '+' : ''}${valueText(v)}`; }

export function renderMarkdown(report) {
  const { comparison: c, totals: t, slots } = report;
  const lines = [
    '# Psipedia — public Lighthouse before/after comparison', '',
    `Production: \`${safeMd(c.before_production_deployment_sha)}\` → \`${safeMd(c.after_production_deployment_sha)}\``,
    `Source: ${safeMd(c.source)}; mode: ${safeMd(c.config.mode)}; repeats: ${c.config.repeats}.`, '',
    '> Deployment identities were supplied separately; this offline tool cannot verify Cloudflare deployment provenance. The collector git_sha is only the measurement checkout.',
    '> Lab direction is not statistical significance. TBT is NOT INP; optional URL-level CrUX INP is context only.', '',
    `Comparable slots: **${t.comparable_slots}**; missing URL rows: **${t.missing_urls}**; unavailable URLs: **${t.unavailable_urls}**; incomplete slots: **${t.incomplete_slots}**.`,
    `Metric directions: **${t.improvements} improvements**, **${t.regressions} regressions**, ${t.unchanged} unchanged, ${t.unknown} UNKNOWN.`, '',
    '| URL | Device | Slot status | Metric | Before | After | Δ after−before | Δ % | Direction |',
    '| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |',
  ];
  for (const slot of slots) {
    for (const [metric, spec] of Object.entries(METRICS)) {
      const m = slot.metrics[metric];
      lines.push(`| ${safeMd(slot.path)} | ${slot.device} | ${slot.status} | ${spec.label} (${spec.unit || 'ratio'}) | ${valueText(m.before)} | ${valueText(m.after)} | ${signedText(m.delta)} | ${m.delta_percent === null ? UNKNOWN : signedText(m.delta_percent) + '%'} | ${m.status} |`);
    }
  }
  lines.push('', '## Incomplete or unavailable measurements', '');
  const excluded = slots.filter((s) => s.status !== 'COMPARABLE');
  if (!excluded.length) lines.push('None.');
  for (const slot of excluded) lines.push(`- \`${safeMd(slot.path)}\` ${slot.device}: **${slot.status}**; before HTTP ${valueText(slot.before.http_status)}, ${valueText(slot.before.successful_runs)}/${slot.before.expected_runs} runs; after HTTP ${valueText(slot.after.http_status)}, ${valueText(slot.after.successful_runs)}/${slot.after.expected_runs} runs.`);
  lines.push('', '## Field INP (informational only)', '',
    '| URL | Device | Before CrUX INP p75 (ms) | After CrUX INP p75 (ms) |',
    '| --- | --- | ---: | ---: |');
  for (const slot of slots) lines.push(`| ${safeMd(slot.path)} | ${slot.device} | ${valueText(slot.before.field_inp_p75_ms)} | ${valueText(slot.after.field_inp_p75_ms)} |`);
  return lines.join('\n') + '\n';
}

function parseArgs(argv) {
  if (argv.length === 1 && argv[0] === '--help') return null;
  const fields = new Map([
    ['--before', 'before'], ['--after', 'after'],
    ['--before-deploy-sha', 'beforeDeploymentSha'], ['--after-deploy-sha', 'afterDeploymentSha'],
    ['--out', 'out'],
  ]);
  const opts = {};
  if (argv.length !== fields.size * 2) reject('INVALID_ARGUMENTS');
  for (let i = 0; i < argv.length; i += 2) {
    const field = fields.get(argv[i]);
    if (!field || Object.hasOwn(opts, field) || typeof argv[i + 1] !== 'string' ||
        argv[i + 1].startsWith('--')) reject('INVALID_ARGUMENTS');
    opts[field] = argv[i + 1];
  }
  if (Object.keys(opts).length !== fields.size) reject('INVALID_ARGUMENTS');
  return opts;
}

export function main(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv);
  if (opts === null) {
    console.log('node scripts/web-perf-compare.mjs --before OLD/summary.json --after NEW/summary.json --before-deploy-sha <production git SHA> --after-deploy-sha <production git SHA> --out REPORT_DIR');
    return null;
  }
  const MAX_BYTES = 25 * 1024 * 1024;
  const parse = (file) => {
    const content = readFileSync(file);
    if (content.length > MAX_BYTES) reject('SUMMARY_TOO_LARGE');
    try { return JSON.parse(content.toString('utf8')); }
    catch { reject('INVALID_SUMMARY_JSON'); }
  };
  // Complete validation and comparison before creating any output files.
  const report = compareSummaries(parse(opts.before), parse(opts.after), opts);
  const json = JSON.stringify(report, null, 2) + '\n';
  const md = renderMarkdown(report);
  mkdirSync(opts.out, { recursive: true });
  writeFileSync(join(opts.out, 'compare.json'), json, { flag: 'w' });
  writeFileSync(join(opts.out, 'compare.md'), md, { flag: 'w' });
  console.log(`Comparison: ${report.totals.comparable_slots} comparable slots; ${report.totals.regressions} directional regressions; ${report.totals.incomplete_slots + report.totals.unavailable_urls + report.totals.missing_urls} excluded slots.`);
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(); }
  catch (error) {
    // Constant error labels only, never file paths or raw JSON values in logs.
    console.error(/^([A-Z_]+)$/.test(error?.message) ? error.message : 'OFFLINE_COMPARISON_FAILED');
    process.exitCode = 1;
  }
}
