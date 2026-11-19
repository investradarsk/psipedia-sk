/**
 * 0173 Directory relational editorial mirror.
 *
 * Transitional dual-write plan only. The legacy profile JSON columns remain
 * the active readers until a separate, checked SQL-read cutover. Any explicit
 * empty value is a valid SQL write; an omitted field never clears a SQL row.
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

export type Directory0173MirrorInput = {
  identity:
    | { kind: "id"; profileId: number; updatedAt: string; actor: string }
    | { kind: "category-slug"; category: string; slug: string; updatedAt: string; actor: string };
  qualifications?: readonly string[];
  seo?: Directory0173Seo;
  /** Explicit, already-validated gallery edit, not a backfill of old JSON. */
  galleryUrls?: readonly string[];
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

  return statements;
}
