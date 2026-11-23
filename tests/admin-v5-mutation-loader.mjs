import { existsSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { pathToFileURL } from "node:url";

// Isolated test-only mocks. The production runtime always validates Cloudflare Access in the Worker.
const count = 'function count(key) { const writes = globalThis.__v5Writes ??= {}; writes[key] = (writes[key] ?? 0) + 1; }';
const mocked = {
  "cloudflare:workers": `export const env = {
    ADMIN_EMAILS: "admin@example.com", AUTH_MODE: "chatgpt",
    BUCKET: { async put() { const w = globalThis.__v5Writes ??= {}; w.upload = (w.upload ?? 0) + 1; } },
  };`,
  "next/headers": 'export async function headers() { return globalThis.__v5TrustedHeaders ?? new Headers({ host: "psipedia.sk" }); }',
  "next/navigation": 'export function redirect() { throw new Error("Unexpected redirect"); }',
  "@/app/chatgpt-auth": 'export async function getChatGPTUser() { return globalThis.__v5TestIdentity ?? null; } export async function requireChatGPTUser() { return getChatGPTUser(); }',
  "@/lib/internal-traffic": 'export const INTERNAL_TRAFFIC_COOKIE_NAME = "psipedia_internal"; export function hasInternalTrafficCookie(value) { return Boolean(value?.includes("psipedia_internal=1")); }',
  "@/lib/facebook-image-store": 'export class FacebookImageSchemaUnavailable extends Error {} export function facebookImageDb() { return {}; } export async function requireFacebookImageSchema() {}',
  "@/lib/dog-name-day-store": `${count}
    export async function createDogNameDayRecord() { count("name"); return { id: 1 }; }
    export async function getDogNameDayRecord() { return { id: 1 }; }
    export async function updateDogNameDayRecord() { count("name"); return { id: 1 }; }
    export async function archiveDogNameDayRecord() { count("name"); return { id: 1 }; }
    export async function listDogNameDayRecords() { return []; }
    export function isDogNameDayConflict() { return false; }`,
  "@/lib/dog-name-day-import": 'export function planDogNameDayImport() { return { summary: { ERROR: 0 } }; } export async function applyDogNameDayImportPlan() { const w = globalThis.__v5Writes ??= {}; w.name = (w.name ?? 0) + 1; return { applied: 1 }; }',
  "@/lib/directory-address-research-import": `${count}
    export const ADDRESS_RESEARCH_IMPORT_APPLY_BATCH_SIZE = 100;
    export async function applyAddressResearchBatch() { count("address"); return { updated: 1 }; }`,
  "@/lib/monetization-store": `${count}
    export async function listMonetizationAdminData() { return {}; }
    export async function createDirectCampaign() { count("monetization"); return "campaign"; }
    export async function createPromotion() { count("monetization"); return "promotion"; }
    export async function updateDirectCampaignStatus() { count("monetization"); }
    export async function updatePromotionStatus() { count("monetization"); }`,
};

export async function resolve(specifier, context, nextResolve) {
  if (Object.hasOwn(mocked, specifier)) {
    return { url: "data:text/javascript," + encodeURIComponent(mocked[specifier]), shortCircuit: true };
  }
  if (specifier.startsWith("@/")) {
    const base = resolvePath(process.cwd(), specifier.slice(2));
    for (const file of [base, base + ".ts", base + ".mjs", base + ".js"]) {
      if (existsSync(file)) return { url: pathToFileURL(file).href, shortCircuit: true };
    }
  }
  return nextResolve(specifier, context);
}
