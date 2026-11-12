/**
 * Read-only, sequential cold/warm HTML cache probe for canonical public routes.
 * Manual: npm run perf:html-cache:probe -- / /adresar/veterinari
 */
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isExplicitAnonymousHtmlRoute } from "../lib/public-anonymous-html-cache.ts";

const BASE = "https://psipedia.sk";
const DEFAULT_PATHS = ["/", "/adresar/veterinari", "/plemena"];

export function permittedProbePath(path) {
  return typeof path === "string"
    && path.startsWith("/")
    && !path.startsWith("//")
    && !/[?#\s]/.test(path)
    && isExplicitAnonymousHtmlRoute(path);
}

export async function probePublicHtmlCache(path, fetcher = fetch, pause = (ms) => new Promise((done) => setTimeout(done, ms))) {
  if (!permittedProbePath(path)) throw new TypeError("Use only a canonical public path without a query.");
  const attempts = [];
  for (let i = 0; i < 2; i++) {
    const started = performance.now();
    // No Cookie, Authorization or RSC headers; the probe performs no writes.
    const response = await fetcher(BASE + path, {
      method: "GET",
      redirect: "manual",
      headers: { Accept: "text/html", "User-Agent": "Psipedia-HTML-Cache-Probe/1.0" },
    });
    const ttfbMs = Math.round(performance.now() - started);
    // Drain the body but never read, log or persist its contents.
    await response.arrayBuffer();
    const xStatus = response.headers.get("x-psipedia-cache");
    attempts.push({
      status: response.status,
      ttfb_ms: ttfbMs,
      edge: xStatus === "HIT" || xStatus === "MISS" ? xStatus : "BYPASS_OR_UNKNOWN",
      cf_status: (response.headers.get("cf-cache-status") ?? "UNKNOWN").slice(0, 24),
    });
    if (i === 0) await pause(350);
  }
  return { path, first: attempts[0], second: attempts[1] };
}

async function main() {
  const paths = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_PATHS;
  if (!paths.every(permittedProbePath)) {
    throw new TypeError("Probe only anonymous public HTML paths (no query, private routes or credentials).");
  }
  for (const path of paths) {
    // Sequential by design; no production load-test or parallel request storm.
    process.stdout.write(JSON.stringify(await probePublicHtmlCache(path)) + "\n");
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(() => {
    process.stderr.write("HTML cache probe failed; no authenticated requests were attempted.\n");
    process.exitCode = 1;
  });
}
