#!/usr/bin/env node
// Read-only, sequential Lighthouse measurements of fixed public URLs.
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const ORIGIN = 'https://psipedia.sk';
export const PATHS = Object.freeze([
  '/',
  '/adresar',
  '/adresar/veterinari',
  '/adresar/treneri',
  '/adresar/veterinari/ab-vet-piestany',
  '/podujatia',
  '/clanky/nasli-ste-tulaveho-psa-co-robit',
]);
const WEEKLY_PATHS = ['/', '/adresar/veterinari'];
const DEVICES = ['mobile', 'desktop'];
const ALLOWED_HEADERS = ['cache-control', 'cdn-cache-control', 'cf-cache-status', 'age', 'x-cache', 'x-psipedia-cache', 'cloudflare-cdn-cache-control', 'content-type'];
const NUMERIC_FIELDS = ['score', 'lcp_ms', 'cls', 'ttfb_ms', 'tbt_ms', 'js_transfer_bytes', 'css_transfer_bytes', 'image_transfer_bytes'];
const CSV_COLUMNS = ['path', 'device', 'http_status', 'probe_attempts', 'probe_error', 'probe_error_code', 'final_url', 'cf_cache_status', 'psipedia_cache_status', 'runs', 'successful_runs', ...NUMERIC_FIELDS, 'lcp_element', 'field_inp_p75_ms', 'field_scope', 'field_status'];

export function modePlan(mode) {
  if (mode === 'weekly') return { paths: WEEKLY_PATHS, repeats: 1 };
  if (mode === 'quick') return { paths: PATHS, repeats: 1 };
  if (mode === 'baseline') return { paths: PATHS, repeats: 3 };
  throw new Error('Invalid mode (weekly, quick, baseline only)');
}

export function numeric(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function median(values) {
  const finite = values.filter((v) => typeof v === 'number' && Number.isFinite(v)).sort((a, b) => a - b);
  if (!finite.length) return null;
  const mid = Math.floor(finite.length / 2);
  return finite.length % 2 ? finite[mid] : (finite[mid - 1] + finite[mid]) / 2;
}

function lcpNode(audits) {
  const findNode = (root, depth = 0) => {
    if (!root || typeof root !== 'object' || depth > 7) return null;
    if ((root.type === 'node' || root.selector) && (root.selector || root.snippet)) return root;
    if (root.node?.type === 'node') return root.node;
    for (const [key, value] of Object.entries(root)) {
      if (key === 'screenshot' || key === 'data' || key === 'timing' || key === 'debugData') continue;
      if (Array.isArray(value)) {
        for (const item of value.slice(0, 20)) {
          const found = findNode(item, depth + 1);
          if (found) return found;
        }
      } else if (value && typeof value === 'object') {
        const found = findNode(value, depth + 1);
        if (found) return found;
      }
    }
    return null;
  };
  for (const id of ['largest-contentful-paint-element', 'lcp-breakdown-insight', 'lcp-discovery-insight', 'lcp-phases-insight']) {
    const node = findNode(audits[id]?.details);
    if (node) return String(node.selector || node.snippet).slice(0, 240);
  }
  return null;
}

function resourceSizes(audits) {
  const sums = { js_transfer_bytes: 0, css_transfer_bytes: 0, image_transfer_bytes: 0 };
  const summary = audits['resource-summary']?.details?.items;
  const items = Array.isArray(summary) && summary.length ? summary : audits['network-requests']?.details?.items;
  if (!Array.isArray(items)) return Object.fromEntries(Object.keys(sums).map((key) => [key, null]));
  for (const item of items) {
    const type = String(item.resourceType ?? '').toLowerCase();
    const bytes = numeric(item.transferSize);
    if (bytes === null || bytes < 0) continue;
    if (type === 'script') sums.js_transfer_bytes += bytes;
    else if (type === 'stylesheet') sums.css_transfer_bytes += bytes;
    else if (type === 'image') sums.image_transfer_bytes += bytes;
  }
  return sums;
}

export function extractLab(lhr) {
  const audits = lhr?.audits ?? {};
  const metrics = audits.metrics?.details?.items?.[0] ?? {};
  const val = (id) => numeric(audits[id]?.numericValue);
  return {
    score: numeric(lhr?.categories?.performance?.score) === null ? null : Math.round(lhr.categories.performance.score * 100),
    lcp_ms: val('largest-contentful-paint'),
    cls: val('cumulative-layout-shift'),
    // Observed navigation TTFB (not the server-response-time diagnostic).
    ttfb_ms: numeric(metrics.observedTimeToFirstByte) ?? numeric(metrics.timeToFirstByte) ?? val('time-to-first-byte'),
    tbt_ms: val('total-blocking-time'),
    ...resourceSizes(audits),
    lcp_element: lcpNode(audits),
    runtime_error: lhr?.runtimeError?.code ?? null,
  };
}

export function summarizeRuns(path, device, probe, attempts, field) {
  const successful = attempts.filter((r) => r.ok);
  const row = {
    path, device, http_status: probe?.status ?? null, probe_attempts: probe?.attempts ?? null,
    probe_error: probe?.error ?? null, probe_error_code: probe?.diagnostics?.at(-1)?.error_code ?? null,
    final_url: probe?.final_url ?? null,
    cache_headers: probe?.cache_headers ?? {}, runs: attempts.length, successful_runs: successful.length,
  };
  for (const key of NUMERIC_FIELDS) row[key] = median(successful.map((r) => r.lab?.[key]));
  row.lcp_element = successful.map((r) => r.lab?.lcp_element).find(Boolean) ?? null;
  row.field_inp_p75_ms = field?.inp_p75_ms ?? null;
  row.field_scope = field?.scope ?? null;
  row.field_status = field?.status ?? 'not_configured';
  return row;
}

export function toCsv(rows) {
  const cell = (value) => {
    const v = value == null ? '' : String(value);
    return /[",\r\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v;
  };
  return [CSV_COLUMNS.join(','), ...rows.map((row) => CSV_COLUMNS.map((key) => cell(key === 'cf_cache_status' ? row.cache_headers?.['cf-cache-status'] : key === 'psipedia_cache_status' ? row.cache_headers?.['x-psipedia-cache'] : row[key])).join(','))].join('\n') + '\n';
}

// Never serialize raw exception messages, URLs or headers: these can contain secrets.
// These constant labels and restricted error codes are safe for Actions logs/artifacts.
const TRANSIENT_CODES = new Set([
  'ECONNRESET', 'ECONNREFUSED', 'EPIPE', 'ETIMEDOUT', 'EAI_AGAIN',
  'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_SOCKET',
  'UND_ERR_BODY_TIMEOUT', 'ENETUNREACH', 'EHOSTUNREACH',
]);
const ERROR_CODES = new Set([...TRANSIENT_CODES, 'ENOTFOUND', 'ERR_TLS_CERT_ALTNAME_INVALID',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT']);
const PROBE_TIMEOUT_MS = 20_000;
const PROBE_ATTEMPTS = 2; // One retry only, no retries on HTTP 404/500 or HTML/origin failures.
const PROBE_RETRY_DELAY_MS = 350;

export function probeException(error, timedOut = false) {
  const names = new Set(['TypeError', 'AbortError', 'TimeoutError', 'Error', 'SyntaxError']);
  const exception_name = names.has(error?.name) ? error.name : 'UnknownError';
  const candidates = [error?.cause?.code, error?.cause?.cause?.code, error?.code];
  const error_code = candidates.find((value) => typeof value === 'string' && ERROR_CODES.has(value)) ?? null;
  const retryable = timedOut || exception_name === 'AbortError' || exception_name === 'TimeoutError' ||
    (exception_name === 'TypeError' && (error_code === null || TRANSIENT_CODES.has(error_code))) ||
    (error_code !== null && TRANSIENT_CODES.has(error_code));
  let reason = 'probe_exception';
  if (timedOut) reason = 'probe_timeout';
  else if (error_code === 'ENOTFOUND') reason = 'dns_name_not_found';
  else if (error_code === 'EAI_AGAIN') reason = 'dns_transient';
  else if (error_code?.startsWith('UND_ERR_')) reason = 'undici_transport';
  else if (error_code?.startsWith('ECONN') || error_code === 'EPIPE') reason = 'connection_error';
  else if (error_code?.startsWith('ERR_TLS_') || error_code?.includes('CERT') || error_code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') reason = 'tls_validation';
  else if (error_code === 'ETIMEDOUT' || exception_name === 'TimeoutError' || exception_name === 'AbortError') reason = 'timeout_or_abort';
  else if (exception_name === 'TypeError') reason = 'fetch_type_error';
  return { exception_name, error_code, reason, retryable };
}

export async function probePage(url, fetcher = fetch, options = {}) {
  const timeoutMs = options.timeoutMs ?? PROBE_TIMEOUT_MS;
  const maxAttempts = options.maxAttempts ?? PROBE_ATTEMPTS;
  const retryDelayMs = options.retryDelayMs ?? PROBE_RETRY_DELAY_MS;
  const sleep = options.sleep ?? ((delay) => new Promise((resolve) => setTimeout(resolve, delay)));
  // The calling workflow supplies fixed paths. Do not accept arbitrary URLs.
  const target = new URL(url);
  if (target.origin !== ORIGIN || !/^https:$/.test(target.protocol)) {
    return { status: null, final_url: null, cache_headers: {}, ok: false,
      error: 'disallowed_origin', attempts: 0, diagnostics: [] };
  }
  const diagnostics = [];
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const started = Date.now();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetcher(url, {
        method: 'GET', redirect: 'follow', signal: controller.signal,
        headers: { accept: 'text/html', 'user-agent': 'Psipedia-Lighthouse-Observability/1.0' },
      });
      // Snapshot status/headers BEFORE touching the response stream.
      // Undici body.cancel() may reject after a successful fetch; that is NOT a failed HTTP probe.
      const headers = Object.fromEntries(ALLOWED_HEADERS.flatMap((name) => {
        const value = response.headers.get(name);
        return value === null ? [] : [[name, value.slice(0, 250)]];
      }));
      const final = new URL(response.url || url);
      let stream_warning = null;
      try {
        await response.body?.cancel();
      } catch (error) {
        stream_warning = probeException(error).reason;
      }
      const ok = response.status === 200 && final.origin === ORIGIN &&
        (headers['content-type'] ?? '').toLowerCase().includes('text/html');
      const reason = ok ? null :
        response.status !== 200 ? 'unexpected_http_status' :
        final.origin !== ORIGIN ? 'redirected_off_origin' : 'unexpected_content_type';
      diagnostics.push({ attempt, status: response.status,
        reason: reason ?? 'ok', stream_warning, elapsed_ms: Date.now() - started });
      // Never retry real HTTP errors, redirects or non-HTML content.
      return { status: response.status, final_url: final.origin === ORIGIN ? final.href : null,
        cache_headers: headers, ok, error: reason, attempts: attempt, diagnostics };
    } catch (error) {
      const classified = probeException(error, controller.signal.aborted);
      diagnostics.push({ attempt, status: null, ...classified, elapsed_ms: Date.now() - started });
      if (!classified.retryable || attempt === maxAttempts) {
        return { status: null, final_url: null, cache_headers: {}, ok: false,
          error: classified.reason, attempts: attempt, diagnostics };
      }
      await sleep(retryDelayMs);
    } finally {
      clearTimeout(timeout);
    }
  }
}
export async function queryCrux(url, device, key, fetcher = fetch) {
  if (!key) return { status: 'not_configured', scope: null, inp_p75_ms: null };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetcher(`https://chromeuxreport.googleapis.com/v1/records:queryRecord?key=${encodeURIComponent(key)}`, {
      method: 'POST', signal: controller.signal, headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url, formFactor: device === 'mobile' ? 'PHONE' : 'DESKTOP', metrics: ['interaction_to_next_paint'] }),
    });
    if (!response.ok) return { status: response.status === 404 ? 'insufficient_url_data' : `api_http_${response.status}`, scope: null, inp_p75_ms: null };
    const body = await response.json();
    const percentile = numeric(body.record?.metrics?.interaction_to_next_paint?.percentiles?.p75);
    return { status: percentile === null ? 'metric_unavailable' : 'available', scope: 'url', inp_p75_ms: percentile };
  } catch {
    return { status: 'request_failed', scope: null, inp_p75_ms: null };
  } finally {
    clearTimeout(timeout);
  }
}

export function comparisons(rows) {
  const result = [];
  for (const path of PATHS) {
    const mobile = rows.find((r) => r.path === path && r.device === 'mobile');
    const desktop = rows.find((r) => r.path === path && r.device === 'desktop');
    if (!mobile || !desktop) continue;
    result.push({ path, mobile_minus_desktop: Object.fromEntries(NUMERIC_FIELDS.map((key) => [key, mobile[key] === null || desktop[key] === null ? null : mobile[key] - desktop[key]])) });
  }
  return result;
}

function parseArgs(argv) {
  const opts = { mode: 'quick', out: 'reports/web-perf', bin: process.env.LIGHTHOUSE_BIN || 'lighthouse' };
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i], value = argv[i + 1];
    if (!value || !['--mode', '--out', '--bin'].includes(key)) throw new Error(`Invalid argument: ${key}`);
    opts[{ '--mode': 'mode', '--out': 'out', '--bin': 'bin' }[key]] = value;
  }
  modePlan(opts.mode);
  return opts;
}

function runLighthouse(bin, url, device, base) {
  const args = [url, '--quiet', '--only-categories=performance', '--throttling-method=simulate',
    '--disable-full-page-screenshot', '--output=json', '--output=html', `--output-path=${base}`,
    '--chrome-flags=--headless --no-sandbox --disable-dev-shm-usage'];
  if (device === 'desktop') args.push('--preset=desktop');
  const started = Date.now();
  const { CRUX_API_KEY: _unusedSecret, ...childEnv } = process.env;
  const proc = spawnSync(bin, args, { encoding: 'utf8', timeout: 120_000, maxBuffer: 1024 * 1024,
    env: { ...childEnv, CI: '1' } });
  const elapsed_ms = Date.now() - started;
  const jsonPath = `${base}.report.json`, htmlPath = `${base}.report.html`;
  if (proc.status !== 0 || !existsSync(jsonPath)) {
    if (existsSync(jsonPath)) unlinkSync(jsonPath);
    if (existsSync(htmlPath)) unlinkSync(htmlPath);
    return { ok: false, elapsed_ms, error: proc.error?.code === 'ETIMEDOUT' ? 'Lighthouse timeout' : `Lighthouse exit ${proc.status ?? 'unknown'}` };
  }
  try {
    const lhr = JSON.parse(readFileSync(jsonPath, 'utf8'));
    const lab = extractLab(lhr);
    if (lab.runtime_error || lab.score === null) {
      unlinkSync(jsonPath);
      if (existsSync(htmlPath)) unlinkSync(htmlPath);
      return { ok: false, elapsed_ms, error: lab.runtime_error || 'Missing performance score' };
    }
    // Retain only aggregate JSON + Lighthouse HTML. Raw JSON may expose request details.
    // HTML contains only unauthenticated public pages; treat GitHub artifact access as private.
    writeFileSync(jsonPath, JSON.stringify({ requested_url: url, final_url: lhr.finalUrl, fetch_time: lhr.fetchTime, lighthouse_version: lhr.lighthouseVersion, user_agent: lhr.userAgent, lab }, null, 2) + '\n');
    return { ok: true, elapsed_ms, lab, json_file: jsonPath, html_file: existsSync(htmlPath) ? htmlPath : null };
  } catch {
    if (existsSync(jsonPath)) unlinkSync(jsonPath);
    if (existsSync(htmlPath)) unlinkSync(htmlPath);
    return { ok: false, elapsed_ms, error: 'Invalid Lighthouse JSON' };
  }
}

export async function main(argv = process.argv.slice(2)) {
  const { mode, out, bin } = parseArgs(argv);
  const plan = modePlan(mode);
  const dir = resolve(out);
  mkdirSync(dir, { recursive: true });
  const started = new Date();
  const version = (command, args) => { try { return execFileSync(command, args, { encoding: 'utf8', timeout: 8_000 }).trim(); } catch { return 'unknown'; } };
  const manifest = {
    schema_version: 1, source: ORIGIN, mode, started_at: started.toISOString(),
    git_sha: process.env.GITHUB_SHA ?? version('git', ['rev-parse', 'HEAD']),
    runner: process.env.RUNNER_OS ?? process.platform, node: process.version,
    chrome: version(process.env.CHROME_PATH || 'google-chrome', ['--version']),
    lighthouse: version(bin, ['--version']),
    pages: plan.paths.length, devices: DEVICES.length, repeats: plan.repeats,
    planned_lighthouse_runs: plan.paths.length * DEVICES.length * plan.repeats,
    throttling: 'simulate', profile: { mobile: 'Lighthouse default mobile', desktop: 'Lighthouse desktop preset' },
    field_data_source: process.env.CRUX_API_KEY ? 'CrUX API URL-level (optional)' : 'none',
  };
  const runs = [], rows = [], probes = [];
  for (const path of plan.paths) {
    const url = new URL(path, ORIGIN).href;
    const probe = await probePage(url);
    probes.push({ path, ...probe });
    if (!probe.ok) console.warn(`URL check failed ${path}: ${probe.error} (${probe.status ?? 'no status'}); diagnostics=${JSON.stringify(probe.diagnostics)}`);
    for (const device of DEVICES) {
      const field = probe.ok ? await queryCrux(url, device, process.env.CRUX_API_KEY) : { status: 'url_unavailable', scope: null, inp_p75_ms: null };
      const attempts = [];
      if (probe.ok) for (let i = 1; i <= plan.repeats; i++) {
        const slug = path === '/' ? 'home' : path.slice(1).replaceAll('/', '--');
        const base = join(dir, `${slug}-${device}-${i}`);
        console.log(`Lighthouse ${path} ${device} ${i}/${plan.repeats}`);
        let result = runLighthouse(bin, url, device, base);
        // A missing score is not a usable measurement. Retry once in manual Quick
        // mode only; do not add hidden 42-run baseline or weekly overhead.
        let invocations = 1;
        let first_error = null;
        if (mode === 'quick' && !result.ok && result.error === 'Missing performance score') {
          first_error = result.error;
          console.warn(`Lighthouse incomplete ${path} ${device}: ${first_error}; retrying once`);
          const next = runLighthouse(bin, url, device, base);
          result = { ...next, elapsed_ms: result.elapsed_ms + next.elapsed_ms };
          invocations = 2;
        }
        attempts.push({ repeat: i, ...result, invocations, first_error });
        runs.push({ path, device, repeat: i, ok: result.ok, elapsed_ms: result.elapsed_ms,
          invocations, first_error, lab: result.lab ?? null, error: result.error ?? null });
      }
      rows.push(summarizeRuns(path, device, probe, attempts, field));
    }
  }
  manifest.completed_at = new Date().toISOString();
  manifest.wall_time_seconds = Math.round((Date.now() - started.valueOf()) / 1000);
  manifest.actual_lighthouse_runs = runs.length;
  manifest.lighthouse_invocations = runs.reduce((total, r) => total + r.invocations, 0);
  manifest.successful_lighthouse_runs = runs.filter((r) => r.ok).length;
  manifest.lighthouse_elapsed_seconds = Math.round(runs.reduce((sum, r) => sum + r.elapsed_ms, 0) / 1000);
  manifest.failed_urls = probes.filter((p) => !p.ok).map((p) => p.path);
  manifest.failed_runs = runs.filter((r) => !r.ok).map(({ path, device, repeat, error }) => ({ path, device, repeat, error }));
  const summary = { manifest, probes, lab_rows: rows, mobile_desktop_comparison: comparisons(rows), runs };
  writeFileSync(join(dir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  writeFileSync(join(dir, 'summary.csv'), toCsv(rows));
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`Report: ${dir}; success ${manifest.successful_lighthouse_runs}/${manifest.actual_lighthouse_runs}; elapsed ${manifest.wall_time_seconds}s`);
  if (manifest.failed_urls.length || manifest.failed_runs.length ||
    manifest.actual_lighthouse_runs !== manifest.planned_lighthouse_runs ||
    manifest.successful_lighthouse_runs !== manifest.planned_lighthouse_runs) process.exitCode = 1;
  return summary;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
