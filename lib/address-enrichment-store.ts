import { env } from "cloudflare:workers";
import {
  assessDirectoryAddressCandidate,
  boundedBatchSize,
  summarizeAddressEnrichmentPreview,
  type AddressCandidate,
  type AddressEnrichmentPreview,
  type AddressEnrichmentPreviewItem,
  type DirectoryAddressInventory,
  type DirectoryEnrichmentTarget,
} from "./address-enrichment";
import { evaluateDirectoryServiceAddress } from "./directory-service-address";
import { readDirectoryPublicContacts } from "./directory-profile-metadata";

type Database = Pick<D1Database, "prepare">;
type RuntimeBindings = { DB?: D1Database };

type TargetRow = {
  id: number;
  name: string;
  category: string;
  status: string;
  region: string;
  district: string;
  city: string;
  postal_code: string;
  street: string;
  house_number: string;
  address_format: string;
  service_address_confirmation: string;
  online: number;
  address: string;
  website_url: string | null;
  source_data_json: string;
  updated_at: string;
};

type EvidenceRow = {
  canonical_entity_id: number;
  cluster_id: number;
  source_id: number;
  source_url: string | null;
  source_label: string;
  source_role: string;
  authority_score: number;
  confidence: number;
  field_name: string;
  raw_value_json: string;
  normalized_value: string;
  evidence_id: number;
};

function database(input?: Database) {
  if (input?.prepare) return input;
  const bound = (env as unknown as RuntimeBindings).DB;
  if (bound?.prepare) return bound;
  throw new Error("Address enrichment nemá pripojenú databázu.");
}

function parseObject(value: string) {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function parseRaw(value: string) {
  try {
    const parsed = JSON.parse(value);
    return parsed == null ? "" : String(parsed).trim();
  } catch {
    return value.trim();
  }
}

function targetFromRow(row: TargetRow): DirectoryEnrichmentTarget {
  const contacts = readDirectoryPublicContacts(parseObject(row.source_data_json) as Record<string, string | number | null>, row.website_url ?? "");
  return {
    id: Number(row.id),
    name: String(row.name ?? ""),
    category: String(row.category ?? ""),
    status: String(row.status ?? ""),
    region: String(row.region ?? ""),
    district: String(row.district ?? ""),
    city: String(row.city ?? ""),
    postalCode: String(row.postal_code ?? ""),
    street: String(row.street ?? ""),
    houseNumber: String(row.house_number ?? ""),
    addressFormat: row.address_format === "STREET" || row.address_format === "MUNICIPALITY_NUMBER" ? row.address_format : "",
    serviceAddressConfirmation: row.service_address_confirmation === "CONFIRMED_SERVICE_LOCATION"
      ? "CONFIRMED_SERVICE_LOCATION"
      : "LEGACY_UNCONFIRMED",
    online: Boolean(row.online),
    legacyAddress: String(row.address ?? ""),
    websiteUrl: String(row.website_url ?? ""),
    phone: contacts.phone,
    email: contacts.email,
    updatedAt: String(row.updated_at ?? ""),
  };
}

export async function auditDirectoryAddressInventory(dbInput?: Database): Promise<DirectoryAddressInventory> {
  const db = database(dbInput);
  const rows = await db.prepare(`SELECT
      id,status,region,district,city,postal_code,street,house_number,address_format,
      service_address_confirmation,online,address,website_url
    FROM directory_profiles`).all<Record<string, unknown>>();

  const inventory: DirectoryAddressInventory = {
    total: rows.results.length,
    published: 0,
    draft: 0,
    archived: 0,
    canonicalComplete: 0,
    legacyUnconfirmed: 0,
    missingOrIncompleteCanonical: 0,
    onlineOnly: 0,
    legacyFreeTextAddress: 0,
    websiteAvailable: 0,
  };

  for (const row of rows.results) {
    const status = String(row.status ?? "").toLowerCase();
    if (status === "published") inventory.published += 1;
    else if (status === "archived") inventory.archived += 1;
    else inventory.draft += 1;
    if (String(row.service_address_confirmation ?? "") === "LEGACY_UNCONFIRMED") inventory.legacyUnconfirmed += 1;
    if (String(row.address ?? "").trim()) inventory.legacyFreeTextAddress += 1;
    if (String(row.website_url ?? "").trim()) inventory.websiteAvailable += 1;

    const evaluation = evaluateDirectoryServiceAddress({
      region: String(row.region ?? ""),
      district: String(row.district ?? ""),
      city: String(row.city ?? ""),
      postalCode: String(row.postal_code ?? ""),
      street: String(row.street ?? ""),
      houseNumber: String(row.house_number ?? ""),
      addressFormat: row.address_format === "STREET" || row.address_format === "MUNICIPALITY_NUMBER" ? row.address_format : "",
      serviceAddressConfirmation: String(row.service_address_confirmation ?? "") === "CONFIRMED_SERVICE_LOCATION"
        ? "CONFIRMED_SERVICE_LOCATION"
        : "LEGACY_UNCONFIRMED",
      online: Boolean(row.online),
    });
    if (evaluation.state === "COMPLETE") inventory.canonicalComplete += 1;
    else inventory.missingOrIncompleteCanonical += 1;
    if (evaluation.reason === "ONLINE_ONLY") inventory.onlineOnly += 1;
  }
  return inventory;
}

async function loadTargets(limit: number, db: Database) {
  const rows = await db.prepare(`SELECT
      id,name,category,status,region,district,city,postal_code,street,house_number,address_format,
      service_address_confirmation,online,address,website_url,source_data_json,updated_at
    FROM directory_profiles
    WHERE status <> 'archived'
    ORDER BY
      CASE WHEN service_address_confirmation='LEGACY_UNCONFIRMED' THEN 0 ELSE 1 END,
      CASE WHEN website_url IS NOT NULL AND TRIM(website_url) <> '' THEN 0 ELSE 1 END,
      updated_at DESC,id DESC
    LIMIT ?`).bind(limit).all<TargetRow>();
  return rows.results.map(targetFromRow);
}

async function loadEvidence(targetIds: number[], db: Database) {
  if (!targetIds.length) return [] as EvidenceRow[];
  const placeholders = targetIds.map(() => "?").join(",");
  const rows = await db.prepare(`SELECT
      c.canonical_entity_id,c.id AS cluster_id,e.source_id,s.source_url,s.label AS source_label,
      e.source_role,e.authority_score,e.confidence,e.field_name,e.raw_value_json,e.normalized_value,e.id AS evidence_id
    FROM automation_entity_clusters c
    JOIN automation_field_evidence e ON e.cluster_id=c.id AND e.is_current=1 AND e.is_preferred=1
    JOIN automation_sources s ON s.id=e.source_id
    WHERE c.entity_type='DIRECTORY'
      AND c.semantic_kind='FACILITY_OR_SERVICE_PROFILE'
      AND c.canonical_entity_id IN (${placeholders})
      AND e.field_name IN ('municipality','street','houseNumber','postalCode')
    ORDER BY c.canonical_entity_id,e.field_name,e.authority_score DESC,e.confidence DESC,e.id DESC`)
    .bind(...targetIds).all<EvidenceRow>();
  return rows.results;
}

function candidateForTarget(target: DirectoryEnrichmentTarget, rows: EvidenceRow[]): AddressCandidate | null {
  if (!rows.length) return null;
  const best = new Map<string, EvidenceRow>();
  for (const row of rows) if (!best.has(row.field_name)) best.set(row.field_name, row);
  const municipality = best.get("municipality");
  const street = best.get("street");
  const houseNumber = best.get("houseNumber");
  const postalCode = best.get("postalCode");
  if (!municipality || !houseNumber || !postalCode) return null;

  const representative = [street, houseNumber, postalCode, municipality]
    .filter((row): row is EvidenceRow => Boolean(row))
    .sort((a, b) => Number(b.authority_score) - Number(a.authority_score))[0]!;
  const city = parseRaw(municipality.raw_value_json) || municipality.normalized_value;
  const streetValue = street ? (parseRaw(street.raw_value_json) || street.normalized_value) : "";
  const house = parseRaw(houseNumber.raw_value_json) || houseNumber.normalized_value;
  const postal = parseRaw(postalCode.raw_value_json) || postalCode.normalized_value;
  const addressFormat = streetValue ? "STREET" : "MUNICIPALITY_NUMBER";
  const confidence = Math.min(...[municipality, houseNumber, postalCode, ...(street ? [street] : [])].map((row) => Number(row.confidence ?? 0))) / 100;

  return {
    targetType: "DIRECTORY_PROFILE",
    targetId: target.id,
    evidence: {
      sourceId: representative.source_id,
      sourceUrl: representative.source_url,
      sourceLabel: representative.source_label,
      sourceRole: representative.source_role,
      authorityScore: representative.authority_score,
      evidenceId: representative.evidence_id,
    },
    rawAddressText: [streetValue || city, house, postal, city].filter(Boolean).join(", "),
    region: target.region,
    district: target.district,
    city,
    postalCode: postal,
    street: streetValue,
    houseNumber: house,
    addressFormat,
    entityMatchConfidence: "HIGH",
    entityMatchSignals: ["verified_canonical_cluster_linkage"],
    addressExtractionConfidence: confidence,
    serviceLocationConfidence: confidence,
    providerVerification: "NOT_RUN",
  };
}

export async function previewDirectoryAddressEnrichment(input: {
  limit?: unknown;
  database?: Database;
} = {}): Promise<AddressEnrichmentPreview> {
  const db = database(input.database);
  const limit = boundedBatchSize(input.limit);
  const targets = await loadTargets(limit, db);
  const evidence = await loadEvidence(targets.map((target) => target.id), db);
  const byTarget = new Map<number, EvidenceRow[]>();
  for (const row of evidence) {
    const id = Number(row.canonical_entity_id);
    const list = byTarget.get(id) ?? [];
    list.push(row);
    byTarget.set(id, list);
  }

  const items: AddressEnrichmentPreviewItem[] = targets.map((target) => {
    const candidate = candidateForTarget(target, byTarget.get(target.id) ?? []);
    return {
      target,
      candidate,
      assessment: candidate ? assessDirectoryAddressCandidate(target, candidate) : null,
    };
  });

  return summarizeAddressEnrichmentPreview(items, limit);
}
