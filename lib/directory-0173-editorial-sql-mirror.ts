/**
 * 0173 Directory relational editorial mirror.
 *
 * SQL-only companion writes for explicit field edits. A deliberate empty
 * value clears only its own SQL row; omitted fields leave the row untouched.
 *
 * The row-existence predicate ties every companion operation to the same
 * successful canonical INSERT/UPDATE in the caller's D1 transaction.
 */
export type Directory0173Seo = {
  title?: string;
  description?: string;
  focusKeyword?: string;
  canonicalUrl?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  noindex?: boolean;
};

export const DIRECTORY_0173_QUALITY_FIELDS = ["phone", "email", "website", "image", "address"] as const;
export type Directory0173QualityField = (typeof DIRECTORY_0173_QUALITY_FIELDS)[number];

export type Directory0173MirrorInput = {
  identity:
    | { kind: "id"; profileId: number; updatedAt: string; actor: string }
    | { kind: "category-slug"; category: string; slug: string; updatedAt: string; actor: string };
  qualifications?: readonly string[];
  seo?: Directory0173Seo;
  /** Explicit, already-validated gallery edit, not a backfill of old JSON. */
  galleryUrls?: readonly string[];
  /** Explicit hours edit; losslessly stored as day 0 until a reviewed day-row cutover. */
  openingHoursText?: string;
  /** Explicit normalized SQL quality values; null deliberately clears one field. */
  qualityResolutions?: Partial<Record<Directory0173QualityField, {
    status: "DOES_NOT_EXIST" | "NOT_PUBLIC" | "NOT_APPLICABLE" | "NOT_FOUND";
    checkedAt: string;
  } | null>>;
};

export type Directory0173SqlStatement = { sql: string; bindings: Array<string | number> };

export function planDirectory0173EditorialSqlMirror(input: Directory0173MirrorInput): Directory0173SqlStatement[] {
  const id = input.identity;
  const where = id.kind === "id"
    ? "p.id=? AND p.updated_at=? AND p.updated_by=?"
    : "p.category=? AND p.slug=? AND p.updated_at=? AND p.updated_by=?";
  const guardValues: Array<string | number> = id.kind === "id"
    ? [id.profileId, id.updatedAt, id.actor]
    : [id.category, id.slug, id.updatedAt, id.actor];
  const updatedAt = id.updatedAt;
  const actor = id.actor;
  const statements: Directory0173SqlStatement[] = [];

  if (input.qualifications !== undefined) {
    if (!Array.isArray(input.qualifications) ||
      input.qualifications.some(value => typeof value !== "string")) {
      throw new Error("DIRECTORY_0173_INVALID_QUALIFICATIONS");
    }
    const values = input.qualifications.filter(value => value.trim().length > 0);
    statements.push({
      sql: "DELETE FROM directory_profile_qualifications WHERE profile_id IN " +
        "(SELECT p.id FROM directory_profiles p WHERE " + where + ")",
      bindings: [...guardValues],
    });
    for (const [order, value] of values.entries()) {
      statements.push({
        sql: "INSERT INTO directory_profile_qualifications " +
          "(profile_id,item_order,qualification_text,updated_at,updated_by) " +
          "SELECT p.id,?,?,?,? FROM directory_profiles p WHERE " + where,
        bindings: [order, value, updatedAt, actor, ...guardValues],
      });
    }
  }

  if (input.seo !== undefined) {
    const seo = input.seo;
    const keys: Array<keyof Omit<Directory0173Seo, "noindex">> = [
      "title", "description", "focusKeyword", "canonicalUrl",
      "ogTitle", "ogDescription", "ogImage",
    ];
    if (keys.some(key => seo[key] !== undefined && typeof seo[key] !== "string") ||
      (seo.noindex !== undefined && typeof seo.noindex !== "boolean")) {
      throw new Error("DIRECTORY_0173_INVALID_SEO");
    }
    const names = [
      "title","description","focus_keyword","canonical_url",
      "og_title","og_description","og_image_url","noindex","updated_at","updated_by",
    ];
    statements.push({
      sql: "INSERT INTO directory_profile_seo (profile_id," + names.join(",") + ") " +
        "SELECT p.id," + names.map(() => "?").join(",") +
        " FROM directory_profiles p WHERE " + where +
        " ON CONFLICT(profile_id) DO UPDATE SET " +
        names.map(column => column + "=excluded." + column).join(","),
      bindings: [
        seo.title ?? "", seo.description ?? "", seo.focusKeyword ?? "",
        seo.canonicalUrl ?? "", seo.ogTitle ?? "", seo.ogDescription ?? "",
        seo.ogImage ?? "", seo.noindex ? 1 : 0, updatedAt, actor, ...guardValues,
      ],
    });
  }
  if (input.galleryUrls !== undefined) {
    if (!Array.isArray(input.galleryUrls) || input.galleryUrls.length > 6 ||
        input.galleryUrls.some(value => typeof value !== "string" || !value.trim()) ||
        new Set(input.galleryUrls).size !== input.galleryUrls.length) {
      throw new Error("DIRECTORY_0173_INVALID_GALLERY");
    }
    // Never remove other profiles' media or affect the main image.
    statements.push({
      sql: "DELETE FROM directory_profile_media WHERE profile_id IN " +
        "(SELECT p.id FROM directory_profiles p WHERE " + where + ")",
      bindings: [...guardValues],
    });
    for (const [order, url] of input.galleryUrls.entries()) {
      statements.push({
        sql: "INSERT INTO directory_profile_media " +
          "(profile_id,item_order,image_url,image_key,alt_text,attribution_text,updated_at,updated_by) " +
          "SELECT p.id,?,?,NULL,?,?,?,? FROM directory_profiles p WHERE " + where,
        bindings: [order, url, "", "", updatedAt, actor, ...guardValues],
      });
    }
  }

  if (input.openingHoursText !== undefined) {
    if (typeof input.openingHoursText !== "string" || input.openingHoursText.length > 2000)
      throw new Error("DIRECTORY_0173_INVALID_OPENING_HOURS");
    const hours = input.openingHoursText.trim();
    // The existing Admin/Notion/partner editors accept free-form text, ranges,
    // split shifts and holiday notes. Keep the complete text intact in day 0;
    // do not guess weekday rows or lose a non-round-trippable schedule.
    // Empty is an explicit clear (zero rows), not a replacement of other fields.
    statements.push({
      sql: "DELETE FROM directory_profile_opening_hours WHERE profile_id IN " +
        "(SELECT p.id FROM directory_profiles p WHERE " + where + ")",
      bindings: [...guardValues],
    });
    if (hours) statements.push({
      sql: "INSERT INTO directory_profile_opening_hours " +
        "(profile_id,day_of_week,hours_text,updated_at,updated_by) " +
        "SELECT p.id,0,?,?,? FROM directory_profiles p WHERE " + where,
      bindings: [hours, updatedAt, actor, ...guardValues],
    });
  }

  if (input.qualityResolutions !== undefined) {
    if (!input.qualityResolutions || typeof input.qualityResolutions !== "object" ||
        Array.isArray(input.qualityResolutions) ||
        Object.keys(input.qualityResolutions).some(
          field => !DIRECTORY_0173_QUALITY_FIELDS.includes(field as Directory0173QualityField)))
      throw new Error("DIRECTORY_0173_INVALID_QUALITY_FIELDS");

    for (const [field, resolution] of Object.entries(input.qualityResolutions)) {
      if (resolution !== null) {
        if (!resolution || typeof resolution !== "object" ||
            !["DOES_NOT_EXIST", "NOT_PUBLIC", "NOT_APPLICABLE", "NOT_FOUND"].includes(resolution.status) ||
            typeof resolution.checkedAt !== "string" ||
            !resolution.checkedAt.trim() ||
            !Number.isFinite(Date.parse(resolution.checkedAt)))
          throw new Error("DIRECTORY_0173_INVALID_QUALITY_RESOLUTION");
      }
      statements.push({
        sql: "DELETE FROM directory_profile_quality_resolutions WHERE quality_field=? " +
          "AND profile_id IN (SELECT p.id FROM directory_profiles p WHERE " + where + ")",
        bindings: [field, ...guardValues],
      });
      if (resolution !== null) statements.push({
        sql: "INSERT INTO directory_profile_quality_resolutions " +
          "(profile_id,quality_field,resolution_status,checked_at,updated_at,updated_by) " +
          "SELECT p.id,?,?,?,?,? FROM directory_profiles p WHERE " + where,
        bindings: [field, resolution.status, resolution.checkedAt, updatedAt, actor, ...guardValues],
      });
    }
  }

  return statements;
}
