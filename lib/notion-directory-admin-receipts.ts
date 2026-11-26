import { BREEDER_EDITORIAL_PATHS, type BreederEditorialField } from "./notion-breeder-field-events.ts";

/** SQL-only projection used on both sides of the same Admin transaction.
 * Structured catalog choices and trainer prose have distinct owners. */
const scalarFields = {
  name: "name", excerpt: "excerpt", description: "description", region: "region",
  district: "district", city: "city", address: "address", postalCode: "postal_code",
  street: "street", houseNumber: "house_number", addressFormat: "address_format",
  priceNote: "price_note", websiteUrl: "website_url", publicPhone: "public_phone",
  publicEmail: "public_email", facebookUrl: "facebook_url", instagramUrl: "instagram_url",
} as const;
const seoFields = {
  title: "title", description: "description", focusKeyword: "focus_keyword",
  canonicalUrl: "canonical_url", ogTitle: "og_title", ogDescription: "og_description",
  ogImage: "og_image_url",
} as const;
const scalarProjection = [
  ...Object.entries(scalarFields).map(([key, column]) => "'" + key + "',COALESCE(p." + column + ",'')"),
  ...Object.entries(seoFields).map(([key, column]) => "'seo." + key + "',COALESCE(s." + column + ",'')"),
  "'qualifications',json((SELECT json_group_array(qualification_text) FROM (SELECT qualification_text FROM directory_profile_qualifications WHERE profile_id=p.id ORDER BY item_order)))",
  "'additionalCategories',json((SELECT json_group_array(category) FROM (SELECT category FROM directory_profile_additional_categories WHERE profile_id=p.id ORDER BY category)))",
];
const supported = new Set<string>([
  ...Object.keys(scalarFields), ...Object.keys(seoFields).map(k => "seo." + k), "qualifications", "additionalCategories",
]);

export function planDirectoryAdminReceipts(database: D1Database, input: {
  id: number; expectedRevision: string; nextRevision: string; editor: string;
  fields: readonly (BreederEditorialField | "additionalCategories")[];
  /** SQL expressions come exclusively from server-owned registry/column allowlists. */
  structured?: readonly { key: string; expression: string; bindings: readonly (string | number)[] }[];
}): { before: D1PreparedStatement[]; after: D1PreparedStatement[] } {
  const fields = [...new Set(input.fields)].filter(field => supported.has(field) && (field === "additionalCategories" || BREEDER_EDITORIAL_PATHS.includes(field)));
  const structured = input.structured ?? [];
  if (!fields.length && !structured.length) return { before: [], after: [] };
  const keys = [...fields, ...structured.map(field => field.key)];
  const projection = "json_object(" + [...scalarProjection,
    ...structured.map(field => "?," + field.expression),
  ].join(",") + ")";
  const projectionBindings = structured.flatMap(field => [field.key, ...field.bindings]);
  const editId = crypto.randomUUID();
  const before = database.prepare(
    "INSERT INTO notion_directory_admin_edit_intent(edit_id,entity_id,notion_page_id,baseline_json,fields_json) " +
    "SELECT ?,p.id,m.notion_page_id," + projection + ",? FROM directory_profiles p " +
    "JOIN directory_notion_sync m ON m.directory_profile_id=p.id " +
    "LEFT JOIN directory_profile_seo s ON s.profile_id=p.id WHERE p.id=? AND p.updated_at=?",
  ).bind(editId, ...projectionBindings, JSON.stringify(keys), input.id, input.expectedRevision);
  const after = database.prepare(
    "INSERT INTO notion_unified_admin_field_edits(agenda,entity_id,notion_page_id,field_key,edit_id,baseline_version,canonical_revision,observed_at,value_json,explicit_clear) " +
    "SELECT 'directory',CAST(p.id AS TEXT),m.notion_page_id,n.key,i.edit_id||':'||n.key," +
    "COALESCE(CAST(fs.version AS TEXT),m.content_hash),p.updated_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')," +
    "CASE WHEN n.type IN ('array','object') THEN n.value ELSE json_quote(n.value) END," +
    "CASE WHEN n.value IS NULL OR (n.type='text' AND trim(n.value)='') OR (n.type='array' AND json_array_length(n.value)=0) THEN 1 ELSE 0 END " +
    "FROM notion_directory_admin_edit_intent i JOIN directory_profiles p ON p.id=i.entity_id " +
    "JOIN directory_notion_sync m ON m.directory_profile_id=p.id AND m.notion_page_id=i.notion_page_id " +
    "LEFT JOIN directory_profile_seo s ON s.profile_id=p.id " +
    "JOIN json_each(" + projection + ") n JOIN json_each(i.baseline_json) o ON o.key=n.key " +
    "LEFT JOIN notion_unified_field_state fs ON fs.agenda='directory' AND fs.entity_id=CAST(p.id AS TEXT) AND fs.notion_page_id=m.notion_page_id AND fs.field_key=n.key " +
    "WHERE i.edit_id=? AND p.updated_at=? AND p.updated_by=? " +
    "AND EXISTS(SELECT 1 FROM json_each(i.fields_json) k WHERE k.value=n.key) " +
    "AND (n.type IS NOT o.type OR n.value IS NOT o.value) " +
    "AND COALESCE(CAST(fs.version AS TEXT),m.content_hash) IS NOT NULL " +
    "ON CONFLICT(agenda,entity_id,notion_page_id,field_key) DO UPDATE SET " +
    "edit_id=excluded.edit_id,baseline_version=excluded.baseline_version,canonical_revision=excluded.canonical_revision," +
    "observed_at=excluded.observed_at,value_json=excluded.value_json,explicit_clear=excluded.explicit_clear",
  ).bind(...projectionBindings, editId, input.nextRevision, input.editor);
  return { before: [before], after: [after, database.prepare("DELETE FROM notion_directory_admin_edit_intent WHERE edit_id=?").bind(editId)] };
}

/** SQL owner for one category-specific filter. Scope is bound, not interpolated. */
export function directoryFacetReceiptField(category: string, field: string) {
  return {
    key: "facet:" + category + ":" + field,
    expression: "(SELECT value_text FROM directory_profile_filter_values WHERE profile_id=p.id AND category=? AND filter_id=?)",
    bindings: [category, field],
  };
}

/** Explicit text fact or hours receipt, using exactly the selected SQL owner. */
export function directoryMetadataReceiptField(field: string, owner: "hours" | "fact" | "extra") {
  return {
    key: "meta:" + field,
    expression: owner === "hours"
      ? "COALESCE((SELECT hours_text FROM directory_profile_opening_hours WHERE profile_id=p.id AND day_of_week=0),'')"
      : owner === "fact"
        ? "COALESCE((SELECT value_text FROM directory_profile_public_facts WHERE profile_id=p.id AND field_key=?),'')"
        : "COALESCE((SELECT text_value FROM directory_profile_extra_fields WHERE profile_id=p.id AND field_key=? AND value_kind='text'),'')",
    bindings: owner === "hours" ? [] : [field],
  };
}

export function directoryBreederRelationReceiptField(field: "breedIds" | "clubIds") {
  return {
    key: "relation:" + field,
    expression: field === "breedIds"
      ? "json((SELECT json_group_array(breed_id) FROM (SELECT breed_id FROM breed_directory_relations WHERE profile_id=p.id ORDER BY breed_id)))"
      : "json((SELECT json_group_array(club_profile_id) FROM (SELECT club_profile_id FROM directory_breeder_club_relations WHERE station_profile_id=p.id ORDER BY club_profile_id)))",
    bindings: [],
  };
}
