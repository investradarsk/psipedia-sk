import { getPartnerDatabase } from "@/lib/partner-auth-store";
import { parseHelpResourceId } from "@/lib/partner-help-claims";
import { requirePartnerPermission } from "@/lib/partner-platform";
import {
  helpEditorFields, normalizeHelpEditorPatch,
  type HelpEditorPatch, type HelpEditorValue,
} from "@/lib/partner-help-editor-fields";

export class PartnerHelpEditorError extends Error {
  constructor(message: string, readonly status = 400) { super(message); this.name = "PartnerHelpEditorError"; }
}

const targets = {
  ADOPTION_DOG: { table: "adoption_dogs", claim: "adoption_dog_id", image: "main_image", gallery: "gallery_json" },
  LOST_FOUND_DOG: { table: "lost_found_dog_reports", claim: "lost_found_report_id", image: "main_image", gallery: "gallery_json" },
  HELP_CASE: { table: "help_cases", claim: "help_case_id", image: "image_url", gallery: null },
} as const;

/** Reads only the allowlisted public fields, not SEO, private contacts, source metadata, ownership or auth. */
export async function getPartnerHelpEditor(accountId: string, resourceId: string, database?: D1Database) {
  const parsed = parseHelpResourceId(resourceId);
  if (!parsed) throw new PartnerHelpEditorError("Záznam Pomoci psom neexistuje.", 404);
  const db = getPartnerDatabase(database);
  await requirePartnerPermission(accountId, resourceId, "HELP_EDIT_PUBLIC", db);
  const config = targets[parsed.entityType];
  const raw = await db.prepare(`SELECT * FROM ${config.table} WHERE id=?1 LIMIT 1`)
    .bind(parsed.canonicalId).first<Record<string, unknown>>();
  if (!raw) throw new PartnerHelpEditorError("Záznam neexistuje.", 404);
  const values: Record<string, HelpEditorValue> = {};
  for (const field of helpEditorFields[parsed.entityType]) {
    const value = raw[field.key];
    values[field.key] = field.kind === "checkbox" ? value === 1 || value === true
      : field.kind === "number" ? (typeof value === "number" ? value : null)
      : typeof value === "string" ? value : "";
  }
  const title = parsed.entityType === "ADOPTION_DOG" ? String(raw.name ?? "Adopcia")
    : parsed.entityType === "LOST_FOUND_DOG" ? String(raw.dog_name || "Pes")
      : String(raw.title ?? "Pomoc psom");
  const galleryRaw = config.gallery ? raw[config.gallery] : null;
  let gallery: string[] = [];
  try {
    const arr: unknown = typeof galleryRaw === "string" ? JSON.parse(galleryRaw) : [];
    if (Array.isArray(arr)) gallery = arr.filter((url): url is string => typeof url === "string").slice(0, 20);
  } catch { /* Keep old malformed content unchanged. */ }
  const originalImage = raw[config.image];
  const imageUrl = typeof originalImage === "string" ? originalImage : null;
  return {
    resourceId, entityType: parsed.entityType, canonicalId: parsed.canonicalId,
    title, values, fields: helpEditorFields[parsed.entityType],
    imageUrl, gallery, baseRevision: String(raw.updated_at ?? ""),
    status: String(raw.status ?? ""),
    publicHref: parsed.entityType === "ADOPTION_DOG" ? `/pomoc-psom/adopcia/${raw.slug}`
      : parsed.entityType === "LOST_FOUND_DOG" ? `/pomoc-psom/${raw.type === "FOUND" ? "najdene-psy" : "stratene-psy"}/${raw.slug}`
      : `/pomoc-psom/${raw.category}/${raw.slug}`,
  };
}

function versionAfter(baseRevision: string, now: Date) {
  const before = Date.parse(baseRevision);
  const proposed = now.getTime();
  return new Date(Number.isFinite(before) && proposed <= before ? before+1 : proposed).toISOString();
}

/** Direct public-field save for an already-approved canonical Help manager.
 * SQL includes the owner predicate in the mutation, preventing a revoked manager
 * from racing an approval/revocation event. Only patch keys change; other columns
 * remain untouched, including status, SEO, IDs, published_at and private data.
 */
export async function updatePartnerHelpPublic(input: {
  accountId: string;
  resourceId: string;
  baseRevision: unknown;
  patch: unknown;
  database?: D1Database;
  now?: Date;
}) {
  const parsed = parseHelpResourceId(input.resourceId);
  if (!parsed) throw new PartnerHelpEditorError("Neplatný záznam Pomoci psom.",404);
  const database = getPartnerDatabase(input.database);
  await requirePartnerPermission(input.accountId, input.resourceId, "HELP_EDIT_PUBLIC", database);
  const baseRevision = input.baseRevision;
  if (typeof baseRevision !== "string" || baseRevision.length < 10 || baseRevision.length > 64)
    throw new PartnerHelpEditorError("Chýba verzia záznamu.");
  const patch: HelpEditorPatch = normalizeHelpEditorPatch(parsed.entityType, input.patch);
  const keys = Object.keys(patch);
  const target = targets[parsed.entityType];
  const nowIso = versionAfter(baseRevision, input.now ?? new Date());
  const actor = `partner:${input.accountId}`;
  const values = keys.map((key) => {
    const v = patch[key];
    return typeof v === "boolean" ? v ? 1 : 0 : v;
  });
  const indexCols = parsed.entityType === "ADOPTION_DOG"
    ? ["name","breed_name","organization_name","city","region"]
    : parsed.entityType === "LOST_FOUND_DOG" ? ["dog_name","breed","color","city","region"] : [];
  const indexClause = indexCols.length
    ? `, search_text=lower(${indexCols.map(col => `coalesce(?,coalesce(${col},''))`).join("||' '||")})`
    : "";
  const indexArgs = indexCols.map(col => Object.prototype.hasOwnProperty.call(patch,col) ? patch[col] : null);
  const updateSql = `UPDATE ${target.table}
    SET ${keys.map(key => `${key}=?`).join(", ")}${indexClause}, updated_at=?${parsed.entityType!=="LOST_FOUND_DOG"?", updated_by=?":""}
    WHERE id=? AND updated_at=?
      AND EXISTS (
        SELECT 1 FROM partner_help_claims c JOIN partner_accounts a ON a.id=c.account_id
        WHERE c.${target.claim}=? AND c.entity_type=? AND c.account_id=?
          AND c.status='APPROVED' AND a.status='ACTIVE'
      )`;
  // All SQL identifiers come from static server-owned field definitions; only values are bound.
  const args: unknown[] = [
    ...values, ...indexArgs, nowIso, ...(parsed.entityType==="LOST_FOUND_DOG"?[]:[actor]),
    parsed.canonicalId,baseRevision,parsed.canonicalId,parsed.entityType,input.accountId,
  ];
  const eventId = crypto.randomUUID();
  const result = await database.batch([
    database.prepare(updateSql).bind(...args),
    database.prepare(`INSERT INTO partner_audit_events
      (id,actor_type,actor_ref,action,target_type,target_id,metadata_json,created_at)
      SELECT ?1,'PARTNER',?2,'PROFILE_CHANGE_APPROVED','PARTNER_HELP_CLAIM',?3,?4,?5
      WHERE EXISTS (
        SELECT 1 FROM ${target.table} WHERE id=?6 AND updated_at=?5
      )`)
      .bind(eventId,actor,input.resourceId,JSON.stringify({mode:"DIRECT_PUBLIC_SAVE",entityType:parsed.entityType,fields:keys,fromRevision:baseRevision}),nowIso,parsed.canonicalId),
  ]);
  if (Number(result[0]?.meta?.changes ?? 0) !== 1) throw new PartnerHelpEditorError("Záznam sa medzitým zmenil alebo už nemáte oprávnenie. Obnovte stránku.",409);
  return { resourceId: input.resourceId, baseRevision: nowIso, updatedFields: keys, published: true };
}
