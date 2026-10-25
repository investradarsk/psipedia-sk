/**
 * Build a minimal Notion PATCH from a current page and a canonical serializer.
 * Only known property types are compared. Missing remote properties fail closed:
 * an omitted API field must never be interpreted as an intentional deletion.
 *
 * Sync metadata is updated along with an actual editorial edit, or when the
 * metadata itself needs repair. Changing "Posledný sync" alone is not work.
 */
const METADATA = new Set(["Sync stav", "Sync chyba", "Sync hash", "Posledný sync"]);
const REPAIR_METADATA = new Set(["Sync stav", "Sync chyba", "Sync hash", "Psipedia ID"]);

type RecordValue = Record<string, unknown>;

function obj(value: unknown): RecordValue | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : null;
}

function richText(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  return value.map(item => {
    const record = obj(item);
    const text = obj(record?.text);
    if (typeof text?.content === "string") return text.content;
    return typeof record?.plain_text === "string" ? record.plain_text : null;
  }).every(item => item !== null)
    ? value.map(item => {
      const r = obj(item);
      return String(obj(r?.text)?.content ?? r?.plain_text ?? "");
    }).join("")
    : null;
}

export function sameNotionProperty(remote: unknown, desired: unknown): boolean {
  const old = obj(remote);
  const next = obj(desired);
  if (!old || !next) return false;
  if ("rich_text" in next || "title" in next) {
    const type = "title" in next ? "title" : "rich_text";
    // Notion GET /pages can truncate a large rich-text property to its first
    // 25 items. Never infer equality or overwrite that partial remote value.
    if (Array.isArray(old[type]) && old[type].length >= 25) {
      throw new Error("NOTION_LONG_PROPERTY_REQUIRES_COMPLETE_READ");
    }
    const from = richText(old[type]), to = richText(next[type]);
    return from !== null && to !== null && from === to;
  }
  if ("multi_select" in next) {
    const names = (v: unknown) => Array.isArray(v) ? v.map(x => obj(x)?.name).sort() : null;
    const a = names(old.multi_select), b = names(next.multi_select);
    return a !== null && b !== null && JSON.stringify(a) === JSON.stringify(b);
  }
  if ("select" in next || "status" in next) {
    const type = "status" in next ? "status" : "select";
    return (obj(old[type])?.name ?? null) === (obj(next[type])?.name ?? null);
  }
  if ("date" in next) {
    const oldDate = obj(old.date)?.start ?? null;
    const nextDate = obj(next.date)?.start ?? null;
    return oldDate === nextDate || (typeof oldDate === "string" && typeof nextDate === "string"
      && Date.parse(oldDate) === Date.parse(nextDate));
  }
  for (const field of ["checkbox", "number", "url", "email", "phone_number"]) {
    if (field in next) return (old[field] ?? null) === (next[field] ?? null);
  }
  // Unknown property types are never silently declared equal.
  return false;
}

export function selectiveNotionProperties(
  remote: Record<string, unknown>,
  desired: Record<string, unknown>,
): Record<string, unknown> | null {
  const changed: Record<string, unknown> = {};
  let editorialChanged = false;
  let metadataRepair = false;
  for (const [name, value] of Object.entries(desired)) {
    if (!Object.hasOwn(remote, name)) throw new Error("NOTION_PROPERTY_MISSING_IN_RESPONSE");
    if (sameNotionProperty(remote[name], value)) continue;
    changed[name] = value;
    if (!METADATA.has(name)) editorialChanged = true;
    if (REPAIR_METADATA.has(name)) metadataRepair = true;
  }
  if (!editorialChanged && !metadataRepair) return null;
  if (editorialChanged || metadataRepair) {
    // Only change last-synced timestamp when other work actually happened.
    if ("Posledný sync" in desired) changed["Posledný sync"] = desired["Posledný sync"];
  }
  return changed;
}
