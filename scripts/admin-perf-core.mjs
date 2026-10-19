// Offline-only summary helpers. Never include credentials, response bodies, URLs or SQL.
export const SCREENS = Object.freeze([
  { id: "dashboard", path: "/admin" },
  { id: "attention", path: "/admin/operations" },
  { id: "articles", path: "/admin/clanky", table: true, filter: true, editor: true },
  { id: "events", path: "/admin/podujatia", table: true, filter: true, editor: true },
  { id: "directory", path: "/admin/adresar", table: true, filter: true, editor: true },
  { id: "partners", path: "/admin/partners", filter: true, editor: true },
  { id: "data_quality", path: "/admin/kvalita" },
  { id: "maps", path: "/admin/mapy" },
  { id: "gemini", path: "/admin/automatizacie-gemini" },
]);
export const DEVICES = Object.freeze({
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
});
export const METRICS = Object.freeze([
  "ready_ms", "dom_content_loaded_ms", "load_event_ms", "requests",
  "transfer_bytes", "api_requests", "api_transfer_bytes", "api_p50_ms", "api_p95_ms",
]);
export function requireLocalOrigin(raw) {
  if (typeof raw !== "string") throw new Error("Local --base-url required.");
  let u;
  try { u = new URL(raw); } catch { throw new Error("Invalid local URL."); }
  if (u.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(u.hostname)
    || !u.port || u.username || u.password || u.search || u.hash || u.pathname !== "/") {
    throw new Error("Only explicit http://localhost:PORT/ or http://127.0.0.1:PORT/ is allowed.");
  }
  const port = Number(u.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid local port.");
  return u.origin;
}
export function median(values) {
  const a = values.filter((n) => typeof n === "number" && Number.isFinite(n) && n >= 0).sort((x, y) => x - y);
  if (!a.length) return null;
  const middle = Math.floor(a.length / 2);
  return a.length % 2 ? a[middle] : (a[middle - 1] + a[middle]) / 2;
}
export function percentile(values, p) {
  const a = values.filter((n) => typeof n === "number" && Number.isFinite(n) && n >= 0).sort((x, y) => x - y);
  if (!a.length) return null;
  return a[Math.max(0, Math.ceil(p * a.length) - 1)];
}
export function safeNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value * 100) / 100 : null;
}
export function summarizeNetwork(records, complete = true) {
  const api = records.filter((r) => r.is_api);
  return {
    network_complete: complete,
    requests: complete ? records.length : null,
    transfer_bytes: complete && records.every((r) => r.bytes !== null)
      ? records.reduce((s, r) => s + r.bytes, 0) : null,
    api_requests: complete ? api.length : null,
    api_transfer_bytes: complete && api.every((r) => r.bytes !== null)
      ? api.reduce((s, r) => s + r.bytes, 0) : null,
    api_p50_ms: median(api.map((r) => r.ms)),
    api_p95_ms: percentile(api.map((r) => r.ms), 0.95),
    http_errors: records.filter((r) => r.status >= 400).length,
  };
}
export function summarizeSamples(samples) {
  const out = [];
  for (const screen of SCREENS) for (const device of Object.keys(DEVICES)) {
    const rows = samples.filter((s) => s.screen === screen.id && s.device === device);
    if (!rows.length) continue;
    const valid = rows.filter((r) => r.status === "ok");
    const metrics = Object.fromEntries(METRICS.map((key) => [key, median(valid.map((r) => r.navigation?.[key]))]));
    const steps = {};
    for (const name of ["pagination", "filter", "editor"]) {
      const observed = rows.map((r) => r.steps?.[name]).filter(Boolean);
      if (!observed.length) continue;
      const succeeded = observed.filter((r) => r.status === "ok");
      steps[name] = {
        status: succeeded.length === observed.length ? "ok" : succeeded.length ? "partial" :
          observed.every((r) => r.status === "not_applicable") ? "not_applicable" : "unavailable",
        successful_runs: succeeded.length,
        total_runs: observed.length,
        median_ms: median(succeeded.map((r) => r.duration_ms)),
        api_p95_ms: percentile(succeeded.map((r) => r.api_p95_ms), 0.95),
      };
    }
    out.push({ screen: screen.id, device, successful_runs: valid.length, total_runs: rows.length,
      status: valid.length === rows.length ? "ok" : valid.length ? "partial" : "unavailable",
      metrics, steps });
  }
  return out;
}
export function compareReports(before, after) {
  if (before?.schema !== 1 || after?.schema !== 1
    || before?.provenance !== "local_synthetic" || after?.provenance !== "local_synthetic") {
    throw new Error("Only comparable, local synthetic schema v1 reports are accepted.");
  }
  if (!before.fixture_id || before.fixture_id !== after.fixture_id || !before.browser_version
    || before.browser_version !== after.browser_version || before.repeats !== after.repeats
    || before.device !== after.device) {
    throw new Error("Different fixture, browser, device or repetition configuration.");
  }
  const byId = new Map(after.summary.map((row) => [row.screen + ":" + row.device, row]));
  return before.summary.map((original) => {
    const newer = byId.get(original.screen + ":" + original.device);
    const compatible = newer && newer.total_runs === original.total_runs &&
      original.status === "ok" && newer.status === "ok";
    const metricDelta = Object.fromEntries(METRICS.map((key) => {
      const a = original.metrics?.[key], b = newer?.metrics?.[key];
      return [key, compatible && a !== null && a !== undefined && b !== null && b !== undefined
        ? Math.round((b - a) * 100) / 100 : null];
    }));
    const steps = {};
    for (const name of ["pagination", "filter", "editor"]) {
      const a = original.steps?.[name], b = newer?.steps?.[name];
      steps[name] = a?.status === "ok" && b?.status === "ok" && a.total_runs === b.total_runs
        && a.median_ms !== null && b.median_ms !== null
        ? Math.round((b.median_ms - a.median_ms) * 100) / 100 : null;
    }
    return { screen: original.screen, device: original.device,
      comparable: Boolean(compatible), delta_after_minus_before: metricDelta, steps_delta_ms: steps };
  });
}
