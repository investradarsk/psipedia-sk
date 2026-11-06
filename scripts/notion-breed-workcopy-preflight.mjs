#!/usr/bin/env node
/**
 * Read-only verification of the 109-property production Notion breed database
 * against the 60-editorial + 2-technical-field working copy.
 *
 * NOTION_API_TOKEN=... node scripts/notion-breed-workcopy-preflight.mjs
 *
 * This script NEVER changes Notion, D1, Cloudflare, mappings or automation tasks.
 * A clean data comparison is NOT permission to switch production sync.
 */
import { pathToFileURL } from "node:url";
import { inspectBreedWorkCopy } from "../lib/notion-breed-workcopy-parity.mjs";
export { normalizeBreedWorkText, breedNotionScalar, projectBreed60, inspectBreedWorkCopy } from "../lib/notion-breed-workcopy-parity.mjs";

const SOURCE = process.env.NOTION_BREEDS_DATA_SOURCE_ID?.trim() ||
  "2054d277-2e1b-45b5-aeb6-b1a5dcdf2db2";
const WORK_COPY = process.env.NOTION_BREEDS_WORK_DATA_SOURCE_ID?.trim() ||
  "f460b1e5-4454-4a10-9200-3b35106f9e32";
const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2025-09-03";

async function notionQuery(dataSourceId, token) {
  const output = [];
  const seen = new Set();
  let cursor = null;
  do {
    const path = "/data_sources/" + encodeURIComponent(dataSourceId) + "/query";
    let payload;
    for (let attempt = 0; attempt < 5; attempt++) {
      const response = await fetch(NOTION_API + path, {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          "Notion-Version": NOTION_VERSION,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }),
      });
      if (response.ok) {
        payload = await response.json();
        break;
      }
      if (![429, 500, 502, 503, 504].includes(response.status) || attempt === 4)
        throw new Error("NOTION_QUERY_FAILED_" + response.status);
      const wait = Math.max(Number(response.headers.get("retry-after") ?? 0) * 1000,
        500 * 2 ** attempt);
      await new Promise(resolve => setTimeout(resolve, wait));
    }
    if (!payload) throw new Error("NOTION_NO_RESPONSE");
    for (const page of payload.results ?? []) {
      if (!page.id || seen.has(page.id)) throw new Error("NOTION_INVENTORY_DUPLICATE_PAGE");
      seen.add(page.id);
      output.push(page);
    }
    cursor = payload.has_more ? payload.next_cursor : null;
    if (payload.has_more && !cursor) throw new Error("NOTION_CURSOR_MISSING");
  } while (cursor);
  return output;
}

export async function main() {
  const token = process.env.NOTION_API_TOKEN?.trim();
  if (!token) throw new Error("NOTION_API_TOKEN_MISSING");
  if (SOURCE.replaceAll("-", "") === WORK_COPY.replaceAll("-", ""))
    throw new Error("SOURCE_AND_WORK_COPY_MUST_DIFFER");
  const [source, work] = await Promise.all([
    notionQuery(SOURCE, token), notionQuery(WORK_COPY, token),
  ]);
  const report = inspectBreedWorkCopy(source, work);
  console.log(JSON.stringify(report, null, 2));
  if (!report.dataParity) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
