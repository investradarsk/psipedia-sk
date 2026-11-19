import {
  BREED_PUBLIC_COLUMN_MAP, BREED_PUBLIC_CONTROLLED_COLUMN_MAP,
  BREED_PUBLIC_EXISTING_COLUMN_MAP, BREED_PUBLIC_LIST_KINDS,
} from "./breed-public-sql-contract.mjs";

/**
 * Build an exact, PUBLIC-ONLY relational transfer from a Notion workcopy page.
 * 'fields' is the output of breedWorkcopyEventValues(), never legacy D1 JSON.
 * Missing Notion fields are left blank in the new SQL schema or untouched
 * in managed_breeds. They can be filled manually after the one-off transfer.
 */
export function planBreedPublicSqlTransfer({ breedId, fields, controlled = {} }) {
  if (!Number.isSafeInteger(breedId) || breedId < 1) throw Error("BREED_SQL_INVALID_ID");
  if (!Array.isArray(fields)) throw Error("BREED_SQL_FIELDS_INVALID");
  const profile = { breed_id: breedId };
  const existing = {};
  const lists = {};
  const seen = new Set();
  const collections = {};
  for (const entry of fields) {
    const field = entry?.field;
    if (typeof field !== "string" || seen.has(field)) {
      throw Error("BREED_SQL_FIELD_DUPLICATE_OR_INVALID");
    }
    seen.add(field);
    const value = entry.value;
    if (Object.hasOwn(BREED_PUBLIC_COLUMN_MAP, field)) {
      const col = BREED_PUBLIC_COLUMN_MAP[field];
      profile[col] = field === "seo.noindex" ? (value === true ? 1 : 0) :
        (typeof value === "string" ? value : "");
    } else if (Object.hasOwn(BREED_PUBLIC_EXISTING_COLUMN_MAP, field)) {
      const col = BREED_PUBLIC_EXISTING_COLUMN_MAP[field];
      if (typeof value === "string" || Number.isFinite(value) || typeof value === "boolean" || value === null) {
        existing[col] = typeof value === "boolean" ? (value ? 1 : 0) : value;
      }
    } else if (BREED_PUBLIC_LIST_KINDS.includes(field)) {
      lists[field] = Array.isArray(value) ? value.filter(x => typeof x === "string" && x.trim()).map(x => x.trim()) : [];
    } else if (["gallery","sports","sources","relatedBreedIds"].includes(field)) {
      collections[field] = Array.isArray(value) ? value : [];
    }
    // Intentionally ignore historical, hidden, editorial-only and unrendered fields.
  }
  for (const [key, col] of Object.entries(BREED_PUBLIC_CONTROLLED_COLUMN_MAP)) {
    if (!Object.hasOwn(controlled, key)) continue;
    const value = controlled[key];
    if (value === null) profile[col] = col.includes("_min_") || col.includes("_max_") ? null : "";
    else if (typeof value === "string" || Number.isFinite(value)) profile[col] = value;
  }
  for (const kind of ["originCountries","coatTypes","useTypes"]) {
    const value = controlled[kind];
    lists[kind] = Array.isArray(value) ? value.filter(x => typeof x === "string" && x.trim()).map(x => x.trim()) : [];
  }
  for (const kind of BREED_PUBLIC_LIST_KINDS) lists[kind] ??= [];
  for (const kind of ["gallery","sports","sources","relatedBreedIds"]) collections[kind] ??= [];
  return { breedId, profile, existing, lists, collections };
}

export function sqlLiteral(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw Error("BREED_SQL_NUMBER_NOT_FINITE");
    return String(value);
  }
  if (typeof value === "boolean") return value ? "1" : "0";
  if (typeof value !== "string" || value.includes("\0"))
    throw Error("BREED_SQL_LITERAL_INVALID");
  return "'" + value.replaceAll("'", "''") + "'";
}

const safeId = value => {
  if (!Number.isSafeInteger(value) || value < 1) throw Error("BREED_SQL_INVALID_ID");
  return value;
};
const allowed = identifier => {
  if (!/^[a-z][a-z0-9_]*$/.test(identifier)) throw Error("BREED_SQL_COLUMN_INVALID");
  return identifier;
};
const rowInsert = (table, row, conflict) => {
  const keys = Object.keys(row).map(allowed);
  const values = keys.map(key => sqlLiteral(row[key]));
  const statement = `INSERT INTO ${table} (${keys.join(",")}) VALUES (${values.join(",")})`;
  return statement + (conflict && keys.length > 1
    ? ` ON CONFLICT(${conflict}) DO UPDATE SET ${keys.filter(k => k !== conflict).map(k=>k+"=excluded."+k).join(",")}`
    : " ON CONFLICT DO NOTHING") + ";";
};

/** Import statements are deterministic and can run multiple times for partial
 * transfers. This intentionally has ZERO JSON storage anywhere in the target.
 * Call only after the new tables have been installed in D1. */
export function breedPublicSqlStatements(plan) {
  const id = safeId(plan.breedId);
  const statements = [];
  const existing = Object.entries(plan.existing);
  if (existing.length) {
    const assignments = existing.map(([key, value])=>allowed(key)+"="+sqlLiteral(value));
    if ("image_url" in plan.existing) assignments.push("image_key=NULL");
    statements.push(`UPDATE managed_breeds SET ${assignments.join(",")},updated_at=CURRENT_TIMESTAMP WHERE id=${id};`);
  }
  statements.push(rowInsert("breed_public_profile", plan.profile, "breed_id"));
  for (const kind of BREED_PUBLIC_LIST_KINDS) {
    statements.push(`DELETE FROM breed_public_list_items WHERE breed_id=${id} AND kind=${sqlLiteral(kind)};`);
    for (const [position, value] of plan.lists[kind].entries()) {
      statements.push(rowInsert("breed_public_list_items", {
        breed_id:id, kind, position, value,
      }));
    }
  }
  for (const [type, table] of [
    ["gallery","breed_public_gallery"],
    ["sports","breed_public_sports"],
    ["sources","breed_public_sources"],
    ["relatedBreedIds","breed_public_related_breeds"],
  ]) {
    statements.push(`DELETE FROM ${table} WHERE breed_id=${id};`);
    for (const [position, item] of plan.collections[type].entries()) {
      let row;
      if (type === "gallery") {
        if (!item || typeof item.imageUrl !== "string" || !item.imageUrl.trim()) continue;
        row = {breed_id:id,position,image_url:item.imageUrl,alt:typeof item.alt === "string" ? item.alt : ""};
      } else if (type === "sports") {
        const rating = Number(item?.rating);
        if (!item || !Number.isInteger(rating) || rating < 1 || rating > 5 ||
            typeof item.key !== "string" || typeof item.label !== "string" ||
            !item.key.trim() || !item.label.trim()) continue;
        row = {breed_id:id,position,sport_key:item.key,label:item.label,rating,note:item.note ?? ""};
      } else if (type === "sources") {
        if (!item || typeof item.label !== "string" || !item.label.trim()) continue;
        row = {breed_id:id,position,label:item.label,url:typeof item.url==="string" ? item.url : ""};
      } else {
        if (!Number.isSafeInteger(item) || item < 1 || item === id) continue;
        row = {breed_id:id,related_breed_id:item,position};
      }
      statements.push(rowInsert(table,row));
    }
  }
  return statements;
}
