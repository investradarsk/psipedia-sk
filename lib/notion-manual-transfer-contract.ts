/**
 * One-shot Notion <-> Psipedia transfer contract — part 1/3.
 *
 * Shared, read-only planning primitives. No provider calls or database writes.
 * The authoritative editable/locked field catalog is NOTION_AUTHORITY_GROUPS;
 * never let the caller supply a field whitelist or bypass locked fields.
 */
export const NOTION_MANUAL_TRANSFER_AREAS = [
  { id: "breeds", label: "Plemená" },
  { id: "directory", label: "Služby pre psov" },
  { id: "events", label: "Podujatia" },
  { id: "help", label: "Pomoc psom" },
  { id: "eshops", label: "E-shopy" },
] as const;

export type NotionManualTransferArea = (typeof NOTION_MANUAL_TRANSFER_AREAS)[number]["id"];
export type NotionManualTransferDirection = "NOTION_TO_ADMIN" | "ADMIN_TO_NOTION";
export type NotionManualTransferSelection = "ONE" | "ALL";

export type TransferCatalogField = Readonly<{
  id: string;
  label: string;
  notionLabel?: string;
  locked?: boolean;
  note?: string;
}>;
export type TransferCatalogGroup = Readonly<{
  scope: string;
  title: string;
  active: boolean;
  fields: readonly TransferCatalogField[];
}>;

/** These are the five areas approved by the owner; article and FB scopes are excluded. */
export function areaOfManualTransferScope(scope: string): NotionManualTransferArea | null {
  if (scope === "breeds") return "breeds";
  if (scope.startsWith("directory:") && scope.length > "directory:".length)
    return "directory";
  if (scope === "events") return "events";
  if (["organizations", "adoptions", "help-cases", "lost-found"].includes(scope))
    return "help";
  if (scope === "eshops") return "eshops";
  return null;
}

export function manualTransferCatalog(groups: readonly TransferCatalogGroup[]) {
  return NOTION_MANUAL_TRANSFER_AREAS.map((area) => {
    const scopes = groups
      .filter((group) => group.active && areaOfManualTransferScope(group.scope) === area.id)
      .map((group) => ({
        id: group.scope,
        label: group.title,
        fields: group.fields.length,
        editable: group.fields.filter((field) => !field.locked).length,
        locked: group.fields.filter((field) => field.locked).length,
      }));
    return {
      area: area.id,
      label: area.label,
      scopes,
      // A catalog entry does NOT imply that the bidirectional executor exists yet.
      executable: false,
    };
  });
}

export type ManualTransferRequest = Readonly<{
  area: NotionManualTransferArea;
  direction: NotionManualTransferDirection;
  selection: NotionManualTransferSelection;
  /** A sub-category can be selected; undefined means the whole selected area. */
  scope?: string;
  /** Numeric canonical Psipedia ID, used only when selection is ONE. */
  profileId?: number;
}>;

export function validateManualTransferRequest(
  value: unknown, groups: readonly TransferCatalogGroup[],
): ManualTransferRequest {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("TRANSFER_REQUEST_INVALID");
  const input = value as Record<string, unknown>;
  if (!NOTION_MANUAL_TRANSFER_AREAS.some((item) => item.id === input.area))
    throw new Error("TRANSFER_AREA_UNSUPPORTED");
  if (input.direction !== "NOTION_TO_ADMIN" && input.direction !== "ADMIN_TO_NOTION")
    throw new Error("TRANSFER_DIRECTION_INVALID");
  if (input.selection !== "ONE" && input.selection !== "ALL")
    throw new Error("TRANSFER_SELECTION_INVALID");
  if (input.scope !== undefined && (typeof input.scope !== "string"
    || areaOfManualTransferScope(input.scope) !== input.area
    || !groups.some((group) => group.scope === input.scope && group.active)))
    throw new Error("TRANSFER_SCOPE_UNSUPPORTED");
  if (input.selection === "ONE" && (typeof input.profileId !== "number"
    || !Number.isSafeInteger(input.profileId) || input.profileId < 1))
    throw new Error("TRANSFER_PROFILE_ID_INVALID");
  if (input.selection === "ALL" && input.profileId !== undefined)
    throw new Error("TRANSFER_PROFILE_ID_UNEXPECTED");
  return {
    area: input.area as NotionManualTransferArea,
    direction: input.direction as NotionManualTransferDirection,
    selection: input.selection as NotionManualTransferSelection,
    ...(input.scope === undefined ? {} : { scope: input.scope as string }),
    ...(input.selection !== "ONE" ? {} : { profileId: input.profileId as number }),
  };
}

export type ManualTransferFieldResult = Readonly<{
  field: string;
  label: string;
  status: "CHANGE" | "SAME" | "SKIPPED";
  reason?: "PROTECTED_FIELD" | "FIELD_MISSING" | "SPECIAL_ADAPTER_REQUIRED" | "IDENTITY_MISMATCH";
}>;

const BREED_SPECIAL_ADAPTER_FIELDS = new Set([
  "image", "gallery", "relatedBreedIds", "relatedArticleIds", "directoryProfileIds",
]);

function requiresSpecialAdapter(scope: string, field: string): boolean {
  // Unlike text, media/relations require an explicit side-effect-safe writer.
  return scope === "breeds" && BREED_SPECIAL_ADAPTER_FIELDS.has(field);
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, canonical(item)]));
  }
  return value;
}

/**
 * Compute an honest per-field preview from independently fetched current values.
 * Caller MUST verify the mapped profile/page identity in D1 and the Notion parent
 * before offering an execution; mismatched or unlinked records never get writes.
 *
 * Missing keys are not the same as explicit null/empty. JSON equality preserves
 * text whitespace, array order, and scalar types without storing field values.
 */
export function previewManualTransferRecord(args: {
  group: TransferCatalogGroup;
  direction: NotionManualTransferDirection;
  canonicalId: number;
  linkedCanonicalId: number | null;
  notionPageId: string | null;
  notion: Readonly<Record<string, unknown>>;
  admin: Readonly<Record<string, unknown>>;
}): {
  profileId: number;
  scope: string;
  totalChanged: number;
  skipped: number;
  same: number;
  fields: ManualTransferFieldResult[];
} {
  if (!args.group.active || areaOfManualTransferScope(args.group.scope) === null)
    throw new Error("TRANSFER_SCOPE_UNSUPPORTED");
  if (args.direction !== "NOTION_TO_ADMIN" && args.direction !== "ADMIN_TO_NOTION")
    throw new Error("TRANSFER_DIRECTION_INVALID");
  const matched = Number.isSafeInteger(args.canonicalId)
    && args.canonicalId > 0
    && args.linkedCanonicalId === args.canonicalId
    && typeof args.notionPageId === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(args.notionPageId);
  const from = args.direction === "NOTION_TO_ADMIN" ? args.notion : args.admin;
  const to = args.direction === "NOTION_TO_ADMIN" ? args.admin : args.notion;
  const fields = args.group.fields.map((field): ManualTransferFieldResult => {
    const base = { field: field.id, label: field.label };
    if (field.locked) return { ...base, status: "SKIPPED", reason: "PROTECTED_FIELD" };
    if (!matched) return { ...base, status: "SKIPPED", reason: "IDENTITY_MISMATCH" };
    if (requiresSpecialAdapter(args.group.scope, field.id))
      return { ...base, status: "SKIPPED", reason: "SPECIAL_ADAPTER_REQUIRED" };
    if (!Object.prototype.hasOwnProperty.call(from, field.id)
      || !Object.prototype.hasOwnProperty.call(to, field.id)
      || from[field.id] === undefined || to[field.id] === undefined)
      return { ...base, status: "SKIPPED", reason: "FIELD_MISSING" };
    return JSON.stringify(canonical(from[field.id])) === JSON.stringify(canonical(to[field.id]))
      ? { ...base, status: "SAME" } : { ...base, status: "CHANGE" };
  });
  return {
    profileId: args.canonicalId, scope: args.group.scope,
    totalChanged: fields.filter((field) => field.status === "CHANGE").length,
    skipped: fields.filter((field) => field.status === "SKIPPED").length,
    same: fields.filter((field) => field.status === "SAME").length,
    fields,
  };
}
