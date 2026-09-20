import { env } from "cloudflare:workers";
import {
  AD_PLACEMENTS,
  SPONSORED_LABEL,
  assertSafeDestinationUrl,
  assertValidWindow,
  isCampaignActive,
  isKnownPlacement,
  isPromotableEntityType,
  isPromotionVisible,
  isSafeCreativeAsset,
  isSafeDestinationUrl,
  normalizeDateTime,
  normalizePriority,
  validateMonetizationEventInput,
  type AdPlacementId,
  type MonetizationStatus,
  type PromotableEntityType,
} from "./monetization";

type RuntimeBindings = { DB?: D1Database };

export type DirectCampaign = {
  id: string;
  name: string;
  advertiserName: string;
  status: MonetizationStatus;
  startAt: string | null;
  endAt: string | null;
  imageUrl: string;
  imageAlt: string;
  headline: string;
  copy: string;
  destinationUrl: string;
  priority: number;
  isAffiliate: boolean;
  adminNote: string;
  placements: AdPlacementId[];
  impressions: number;
  clicks: number;
};

export type PromotionRecord = {
  id: string;
  entityType: PromotableEntityType;
  entityId: string;
  status: MonetizationStatus;
  startAt: string | null;
  endAt: string | null;
  label: typeof SPONSORED_LABEL;
  priority: number;
  provenance: string;
  adminNote: string;
};

type CampaignRow = {
  id: string; name: string; advertiser_name: string; status: MonetizationStatus;
  start_at: string | null; end_at: string | null; creative_image_url: string;
  creative_alt: string; headline: string; body_copy: string; destination_url: string;
  priority: number; is_affiliate: number; admin_note: string;
};

function database() {
  const db = (env as unknown as RuntimeBindings).DB;
  return db && typeof db.prepare === "function" ? db : null;
}

function requiredDatabase() {
  const db = database();
  if (!db) throw new Error("Monetization databáza nie je pripojená.");
  return db;
}

function rowToCampaign(
  row: CampaignRow,
  placements: string[] = [],
  metrics: { impressions?: number; clicks?: number } = {},
): DirectCampaign {
  return {
    id: row.id,
    name: row.name,
    advertiserName: row.advertiser_name,
    status: row.status,
    startAt: row.start_at,
    endAt: row.end_at,
    imageUrl: row.creative_image_url,
    imageAlt: row.creative_alt,
    headline: row.headline,
    copy: row.body_copy,
    destinationUrl: row.destination_url,
    priority: row.priority,
    isAffiliate: row.is_affiliate === 1,
    adminNote: row.admin_note,
    placements: placements.filter(isKnownPlacement),
    impressions: metrics.impressions ?? 0,
    clicks: metrics.clicks ?? 0,
  };
}

export async function getActiveCampaignForPlacement(placementId: AdPlacementId, now = new Date()) {
  const db = database();
  if (!db) return null;
  const iso = now.toISOString();
  let row: CampaignRow | null;
  try {
    row = await db.prepare(`
      SELECT c.id, c.name, c.advertiser_name, c.status, c.start_at, c.end_at,
        c.creative_image_url, c.creative_alt, c.headline, c.body_copy,
        c.destination_url, c.priority, c.is_affiliate, c.admin_note
      FROM monetization_campaigns c
      INNER JOIN monetization_campaign_placements p ON p.campaign_id = c.id
      WHERE p.placement_id = ?
        AND c.status = 'active'
        AND (c.start_at IS NULL OR c.start_at <= ?)
        AND (c.end_at IS NULL OR c.end_at > ?)
      ORDER BY c.priority DESC, c.updated_at DESC
      LIMIT 1
    `).bind(placementId, iso, iso).first<CampaignRow>();
  } catch (error) {
    if (String(error).includes("no such table") && String(error).includes("monetization_")) return null;
    throw error;
  }
  if (!row) return null;
  const campaign = rowToCampaign(row, [placementId]);
  if (!isCampaignActive(campaign, now)) return null;
  if (!isSafeDestinationUrl(campaign.destinationUrl) || !isSafeCreativeAsset(campaign.imageUrl)) return null;
  return campaign;
}

export async function listMonetizationAdminData() {
  const db = requiredDatabase();
  const [campaignRows, placementRows, promotionRows, metricRows] = await Promise.all([
    db.prepare(`SELECT id, name, advertiser_name, status, start_at, end_at, creative_image_url, creative_alt,
      headline, body_copy, destination_url, priority, is_affiliate, admin_note
      FROM monetization_campaigns ORDER BY updated_at DESC`).all<CampaignRow>(),
    db.prepare("SELECT campaign_id, placement_id FROM monetization_campaign_placements ORDER BY placement_id").all<{campaign_id:string;placement_id:string}>(),
    db.prepare(`SELECT id, entity_type, entity_id, status, start_at, end_at, label, priority, provenance, admin_note
      FROM monetization_promotions ORDER BY updated_at DESC`).all<{
        id:string;entity_type:string;entity_id:string;status:MonetizationStatus;start_at:string|null;end_at:string|null;
        label:string;priority:number;provenance:string;admin_note:string;
      }>(),
    db.prepare(`SELECT campaign_id,
        SUM(CASE WHEN event_type = 'impression' THEN 1 ELSE 0 END) AS impressions,
        SUM(CASE WHEN event_type = 'click' THEN 1 ELSE 0 END) AS clicks
      FROM monetization_events GROUP BY campaign_id`).all<{campaign_id:string;impressions:number;clicks:number}>(),
  ]);
  const placementsByCampaign = new Map<string,string[]>();
  for (const row of placementRows.results ?? []) {
    const items = placementsByCampaign.get(row.campaign_id) ?? [];
    items.push(row.placement_id);
    placementsByCampaign.set(row.campaign_id, items);
  }
  const metricsByCampaign = new Map((metricRows.results ?? []).map((row) => [
    row.campaign_id,
    { impressions: Number(row.impressions) || 0, clicks: Number(row.clicks) || 0 },
  ]));
  return {
    placements: Object.values(AD_PLACEMENTS),
    campaigns: (campaignRows.results ?? []).map((row) =>
      rowToCampaign(row, placementsByCampaign.get(row.id) ?? [], metricsByCampaign.get(row.id)),
    ),
    promotions: (promotionRows.results ?? [])
      .filter((row) => isPromotableEntityType(row.entity_type))
      .map((row) => ({
        id: row.id, entityType: row.entity_type as PromotableEntityType, entityId: row.entity_id, status: row.status,
        startAt: row.start_at, endAt: row.end_at, label: SPONSORED_LABEL, priority: row.priority,
        provenance: row.provenance, adminNote: row.admin_note,
      } satisfies PromotionRecord)),
  };
}

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function createDirectCampaign(payload: Record<string, unknown>, actor: string) {
  const db = requiredDatabase();
  const name = text(payload.name, 160);
  const advertiserName = text(payload.advertiserName, 160);
  const headline = text(payload.headline, 180);
  if (!name || !advertiserName || !headline) throw new Error("Doplň názov kampane, zadávateľa a nadpis.");
  const destinationUrl = assertSafeDestinationUrl(text(payload.destinationUrl, 1000));
  const imageUrl = text(payload.imageUrl, 500);
  const imageAlt = text(payload.imageAlt, 220);
  if (!imageUrl || !isSafeCreativeAsset(imageUrl)) throw new Error("Creative obrázok musí používať interný media/images asset.");
  if (!imageAlt) throw new Error("Doplň alt text creative obrázka.");
  const rawPlacements = Array.isArray(payload.placements) ? payload.placements.map(String) : [];
  const placements = [...new Set(rawPlacements.filter(isKnownPlacement))];
  if (!placements.length) throw new Error("Vyber aspoň jeden platný placement.");
  const startAt = normalizeDateTime(payload.startAt);
  const endAt = normalizeDateTime(payload.endAt);
  assertValidWindow(startAt, endAt);
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await db.prepare(`INSERT INTO monetization_campaigns (
    id, name, advertiser_name, status, start_at, end_at, creative_image_url, creative_alt,
    headline, body_copy, destination_url, priority, is_affiliate, admin_note,
    created_at, updated_at, created_by, updated_by
  ) VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
    id, name, advertiserName, startAt, endAt, imageUrl, imageAlt,
    headline, text(payload.copy, 500), destinationUrl, normalizePriority(payload.priority),
    payload.isAffiliate === true ? 1 : 0, text(payload.adminNote, 1000), now, now, actor, actor,
  ).run();
  for (const placement of placements) {
    await db.prepare("INSERT INTO monetization_campaign_placements (campaign_id, placement_id, created_at) VALUES (?, ?, ?)")
      .bind(id, placement, now).run();
  }
  return id;
}

export async function updateDirectCampaignStatus(id: string, status: MonetizationStatus, actor: string) {
  if (!["draft","active","paused","archived"].includes(status)) throw new Error("Neplatný stav kampane.");
  const db = requiredDatabase();
  const result = await db.prepare("UPDATE monetization_campaigns SET status = ?, updated_at = ?, updated_by = ? WHERE id = ?")
    .bind(status, new Date().toISOString(), actor, id).run();
  if (!result.meta.changes) throw new Error("Kampaň neexistuje.");
}

export async function createPromotion(payload: Record<string, unknown>, actor: string) {
  const db = requiredDatabase();
  const entityType = text(payload.entityType, 60);
  const entityId = text(payload.entityId, 120);
  if (!isPromotableEntityType(entityType) || !entityId) throw new Error("Doplň podporovaný canonical typ a ID entity.");
  const startAt = normalizeDateTime(payload.startAt);
  const endAt = normalizeDateTime(payload.endAt);
  assertValidWindow(startAt, endAt);
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await db.prepare(`INSERT INTO monetization_promotions (
    id, entity_type, entity_id, status, start_at, end_at, label, priority, provenance,
    admin_note, created_at, updated_at, created_by, updated_by
  ) VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
    id, entityType, entityId, startAt, endAt, SPONSORED_LABEL, normalizePriority(payload.priority),
    text(payload.provenance, 500), text(payload.adminNote, 1000), now, now, actor, actor,
  ).run();
  return id;
}

export async function getVisiblePromotionForEntity(
  entityType: PromotableEntityType,
  entityId: string,
  entityPublic: boolean,
  now = new Date(),
) {
  if (!entityPublic) return null;
  const db = database();
  if (!db) return null;
  const iso = now.toISOString();
  const row = await db.prepare(`SELECT id, entity_type, entity_id, status, start_at, end_at, label, priority, provenance, admin_note
    FROM monetization_promotions
    WHERE entity_type = ? AND entity_id = ? AND status = 'active'
      AND (start_at IS NULL OR start_at <= ?)
      AND (end_at IS NULL OR end_at > ?)
    ORDER BY priority DESC, updated_at DESC LIMIT 1`)
    .bind(entityType, entityId, iso, iso)
    .first<{id:string;entity_type:string;entity_id:string;status:MonetizationStatus;start_at:string|null;end_at:string|null;label:string;priority:number;provenance:string;admin_note:string}>();
  if (!row) return null;
  const candidate = {
    id: row.id,
    entityType,
    entityId: row.entity_id,
    status: row.status,
    startAt: row.start_at,
    endAt: row.end_at,
    label: row.label,
    priority: row.priority,
    provenance: row.provenance,
    adminNote: row.admin_note,
    entityPublic,
  };
  return isPromotionVisible(candidate, now) ? candidate : null;
}

export async function updatePromotionStatus(id: string, status: MonetizationStatus, actor: string) {
  if (!["draft","active","paused","archived"].includes(status)) throw new Error("Neplatný stav promotion.");
  const db = requiredDatabase();
  const result = await db.prepare("UPDATE monetization_promotions SET status = ?, updated_at = ?, updated_by = ? WHERE id = ?")
    .bind(status, new Date().toISOString(), actor, id).run();
  if (!result.meta.changes) throw new Error("Promotion záznam neexistuje.");
}

export async function recordMonetizationEvent(payload: unknown) {
  const input = validateMonetizationEventInput(payload);
  const db = requiredDatabase();
  const now = new Date();
  const campaign = await getActiveCampaignForPlacement(input.placementId, now);
  if (!campaign || campaign.id !== input.campaignId) throw new Error("Kampaň nie je aktívna pre tento placement.");

  const burstSince = new Date(now.getTime() - 10_000).toISOString();
  const burst = await db.prepare(`SELECT COUNT(*) AS count FROM monetization_events
    WHERE campaign_id = ? AND placement_id = ? AND event_type = ? AND created_at >= ?`)
    .bind(input.campaignId, input.placementId, input.eventType, burstSince)
    .first<{count:number}>();
  if ((burst?.count ?? 0) >= 120) throw new Error("Tracking burst guard.");

  const result = await db.prepare(`INSERT OR IGNORE INTO monetization_events
    (event_type, campaign_id, placement_id, event_key, created_at) VALUES (?, ?, ?, ?, ?)`)
    .bind(input.eventType, input.campaignId, input.placementId, input.eventKey, now.toISOString()).run();
  return { accepted: true, deduplicated: !result.meta.changes };
}
