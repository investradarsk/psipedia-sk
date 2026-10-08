import { createCanonicalDraft, type CanonicalDraftInput } from "./canonical-draft-service.ts";
import { getGeminiCatalogItem } from "./gemini-automation-catalog.ts";
import { createGeminiDiscoveryRequest, parseGeminiDiscoveryEnvelope, type GeminiDiscoveryCandidateV1 } from "./gemini-automation-discovery-contract.ts";
import { checkGeminiCandidateDedupe } from "./gemini-automation-dedupe.ts";
import { geminiCandidateSignals } from "./gemini-automation-identity.ts";
import { ensureDirectoryProfileInNotion, type NotionDirectorySyncBindings } from "./notion-directory-sync.ts";

type Concept = {
  id: number; stable_key: string; discovery_key: string; canonical_entity_type: "DIRECTORY";
  canonical_entity_id: number | null; notion_page_id: string | null;
  status: "RESERVED" | "CREATING" | "DRAFT_CREATED" | "NOTION_CREATING" | "NOTION_UNCERTAIN" | "NOTION_LINKED";
};
export type GeminiConceptBridgeResult = {
  stableKey: string; conceptId: number; canonicalEntityType: "DIRECTORY";
  canonicalEntityId: number; notionPageId: string | null;
  created: boolean; status: "NOTION_LINKED";
};
export type GeminiConceptBridgeInput = {
  database: D1Database; notion: NotionDirectorySyncBindings;
  stableKey: string; candidate: GeminiDiscoveryCandidateV1;
};
const ACTOR = "gemini-automation@psipedia.sk";
const hex = (data: Uint8Array) => [...data].map((n) => n.toString(16).padStart(2, "0")).join("");

/** Identity comes from the existing normalization helpers, never a description or provider request ID. */
export async function geminiBridgeDiscoveryKey(stableKey: string, candidate: GeminiDiscoveryCandidateV1) {
  const signals = geminiCandidateSignals(candidate);
  if (!signals.name || (!signals.city && !signals.website))
    throw new Error("GEMINI_BRIDGE_INSUFFICIENT_IDENTITY");
  const identity = [signals.name, signals.city, signals.website?.url ?? ""].join("|");
  const bytes = new TextEncoder().encode(["gemini-bridge-v1", stableKey, identity].join("\u0000"));
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
}
export function mapGeminiDirectoryCandidate(stableKey: string, candidate: GeminiDiscoveryCandidateV1, discoveryKey: string): CanonicalDraftInput {
  const catalog = getGeminiCatalogItem(stableKey);
  if (!catalog || catalog.section !== "directory") throw new Error("GEMINI_BRIDGE_NOT_READY");
  return {
    entityType: "DIRECTORY",
    externalSourceUrl: candidate.primary_url ?? candidate.source_urls[0],
    slugSuffix: discoveryKey.slice(0, 12),
    data: {
      name: candidate.name,
      category: catalog.subcategory,
      description: candidate.description ?? "",
      city: candidate.location.city ?? "",
      district: candidate.location.district ?? "",
      region: candidate.location.region ?? "",
      address: candidate.location.address ?? "",
      websiteUrl: candidate.contacts.website ?? "",
      publicPhone: candidate.contacts.phone ?? "",
      publicEmail: candidate.contacts.email ?? "",
      facebookUrl: candidate.contacts.facebook ?? "",
      instagramUrl: candidate.contacts.instagram ?? "",
      importKey: "gemini:" + discoveryKey,
    },
  };
}
function snapshot(row: Concept, created: boolean): GeminiConceptBridgeResult {
  if (!row.canonical_entity_id || row.status !== "NOTION_LINKED")
    throw new Error("GEMINI_BRIDGE_NOT_COMPLETE");
  return {
    stableKey: row.stable_key, conceptId: row.id, canonicalEntityType: "DIRECTORY",
    canonicalEntityId: row.canonical_entity_id, notionPageId: row.notion_page_id,
    created, status: "NOTION_LINKED",
  };
}
async function getConcept(db: D1Database, stableKey: string, key: string): Promise<Concept | null> {
  return db.prepare("SELECT id,stable_key,discovery_key,canonical_entity_type,canonical_entity_id,notion_page_id,status FROM gemini_automation_concepts WHERE stable_key=? AND discovery_key=? LIMIT 1")
    .bind(stableKey, key).first<Concept>();
}
async function claim(db: D1Database, row: Concept, from: string, to: string) {
  const at = new Date().toISOString();
  const result = await db.prepare("UPDATE gemini_automation_concepts SET status=?,updated_at=? WHERE id=? AND status=?")
    .bind(to, at, row.id, from).run();
  return (result.meta.changes ?? 0) === 1;
}
async function updateConcept(db: D1Database, id: number, status: string, entityId: number | null, notionPageId: string | null) {
  await db.prepare("UPDATE gemini_automation_concepts SET status=?, canonical_entity_id=COALESCE(?,canonical_entity_id), notion_page_id=COALESCE(?,notion_page_id), updated_at=? WHERE id=?")
    .bind(status,entityId,notionPageId,new Date().toISOString(),id).run();
}
/**
 * Server-side only. No routes, cron, scheduler, provider calls or publish hooks.
 * External POST uncertainty is fail-closed; recovery only queries existing Notion.
 */
export async function bridgeGeminiCandidateToNotion(input: GeminiConceptBridgeInput): Promise<GeminiConceptBridgeResult> {
  const catalog = getGeminiCatalogItem(input.stableKey);
  if (!catalog || catalog.section !== "directory") throw new Error("GEMINI_BRIDGE_NOT_READY");
  // Reparse even typed inputs: a caller cannot bypass strict Candidate V1 validation.
  const request = createGeminiDiscoveryRequest({ stableKey: input.stableKey, maxCandidates: 1 });
  const candidate = parseGeminiDiscoveryEnvelope({
    schema_version: 1, category_key: input.stableKey, candidates: [input.candidate],
  }, request).candidates[0];
  const key = await geminiBridgeDiscoveryKey(input.stableKey, candidate);
  const db = input.database;
  let row = await getConcept(db, input.stableKey, key);
  if (row?.status === "NOTION_LINKED") return snapshot(row, false);
  if (!row) {
    const dedupe = await checkGeminiCandidateDedupe(db, {
      stableKey: input.stableKey, section: "directory", subcategory: catalog.subcategory, candidate,
    });
    if (dedupe.status !== "NEW") throw new Error("GEMINI_BRIDGE_DEDUPE_" + dedupe.status);
    const at = new Date().toISOString();
    await db.prepare(`INSERT INTO gemini_automation_concepts
      (stable_key, discovery_key, canonical_entity_type, status, primary_source_url, source_urls_json, discovered_at, created_at, updated_at)
      VALUES (?,?,'DIRECTORY','RESERVED',?,?,?,?,?)
      ON CONFLICT(stable_key,discovery_key) DO NOTHING`)
      .bind(input.stableKey,key,candidate.primary_url ?? candidate.source_urls[0],
        JSON.stringify(candidate.source_urls.slice(0,8)),at,at,at).run();
    row = await getConcept(db,input.stableKey,key);
  }
  if (!row) throw new Error("GEMINI_BRIDGE_LINKAGE_WRITE_FAILED");
  if (row.canonical_entity_type !== "DIRECTORY") throw new Error("GEMINI_BRIDGE_INVALID_ENTITY");
  let created = false;
  if (!row.canonical_entity_id) {
    if (row.status === "RESERVED") {
      if (!await claim(db,row,"RESERVED","CREATING")) throw new Error("GEMINI_BRIDGE_CONCURRENT_OPERATION");
    } else if (row.status === "CREATING") {
      // Uncertain creation after an interrupted request: never create again until
      // the deterministic import_key has been checked and a human resolves an orphan.
      const cutoff = new Date(Date.now()-120_000).toISOString();
      const r = await db.prepare("UPDATE gemini_automation_concepts SET updated_at=? WHERE id=? AND status='CREATING' AND updated_at < ?")
        .bind(new Date().toISOString(),row.id,cutoff).run();
      if ((r.meta.changes ?? 0) !== 1) throw new Error("GEMINI_BRIDGE_CONCURRENT_OPERATION");
    } else throw new Error("GEMINI_BRIDGE_INVALID_STATE");
    // Recovery before insert if canonical succeeded but linkage persistence failed.
    const imported = await db.prepare("SELECT id FROM directory_profiles WHERE import_key=? LIMIT 2")
      .bind("gemini:"+key).all<{id:number}>();
    if (imported.results.length > 1) throw new Error("GEMINI_BRIDGE_AMBIGUOUS_CANONICAL");
    let id = imported.results[0]?.id;
    if (!id) {
      // Fresh ownership must pass dedupe again to block other concurrently added entities.
      const dedupe = await checkGeminiCandidateDedupe(db, {
        stableKey: input.stableKey, section: "directory", subcategory: catalog.subcategory, candidate,
      });
      if (dedupe.status !== "NEW") throw new Error("GEMINI_BRIDGE_DEDUPE_" + dedupe.status);
      id = (await createCanonicalDraft(
        mapGeminiDirectoryCandidate(input.stableKey,candidate,key),
        {actor:ACTOR,createdAt:new Date().toISOString()},db,
      )).canonicalEntityId;
      created = true;
    }
    await updateConcept(db,row.id,"DRAFT_CREATED",id,null);
    row = await getConcept(db,input.stableKey,key);
    if (!row) throw new Error("GEMINI_BRIDGE_LINKAGE_WRITE_FAILED");
  }
  if (row.status === "NOTION_LINKED") return snapshot(row,created);
  if (!row.canonical_entity_id) throw new Error("GEMINI_BRIDGE_CANONICAL_MISSING");
  if (row.status === "DRAFT_CREATED") {
    if (!await claim(db,row,"DRAFT_CREATED","NOTION_CREATING"))
      throw new Error("GEMINI_BRIDGE_CONCURRENT_OPERATION");
    try {
      const result = await ensureDirectoryProfileInNotion({
        database: db, bindings: input.notion, profileId: row.canonical_entity_id, allowCreate: true,
      });
      await updateConcept(db,row.id,"NOTION_LINKED",null,result.notionPageId);
    } catch (error) {
      await updateConcept(db,row.id,"NOTION_UNCERTAIN",null,null);
      throw error;
    }
  } else if (row.status === "NOTION_UNCERTAIN" || row.status === "NOTION_CREATING") {
    // Recover a saved mapping or remote page, never issue a second Notion POST.
    const result = await ensureDirectoryProfileInNotion({
      database: db, bindings: input.notion, profileId: row.canonical_entity_id,
      allowCreate: false,
    });
    await updateConcept(db,row.id,"NOTION_LINKED",null,result.notionPageId);
  } else throw new Error("GEMINI_BRIDGE_INVALID_STATE");
  row = await getConcept(db,input.stableKey,key);
  if (!row) throw new Error("GEMINI_BRIDGE_LINKAGE_WRITE_FAILED");
  return snapshot(row,created);
}
