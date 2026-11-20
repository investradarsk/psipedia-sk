/**
 * Three-way field merge against the last independently verified common snapshot.
 * Record-level updated_at/last_edited_time are NOT human field revisions.
 * Same-field concurrent edits therefore fail closed; no fabricated LWW.
 */
export type FieldSnapshot = Record<string, unknown>;
export type FieldConflict = {
  field: string;
  reason: "BASELINE_UNAVAILABLE" | "AMBIGUOUS_SAME_FIELD" | "UNVERIFIED_DELETE"
    | "PROTECTED_FIELD" | "MISSING_FIELD";
};
export type FieldResolution = {
  kind: "MERGE" | "UNCHANGED" | "CONFLICT";
  merged: FieldSnapshot;
  conflicts: FieldConflict[];
  notionFields: string[];
  psipediaFields: string[];
};

/** Only authenticated, field-scoped human edit receipts may establish LWW.
 * Never substitute D1 profile updated_at or Notion page last_edited_time. */
export type VerifiedFieldEdit = {
  observedAt: string;
  editId: string;
  value: unknown;
};
export type VerifiedFieldEditPair = {
  notion: VerifiedFieldEdit;
  psipedia: VerifiedFieldEdit;
};

function leaves(value: unknown, prefix = "", output: Record<string, unknown> = {}) {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const entries = Object.entries(value);
    // An empty object is a value, not an omitted field. Do not silently
    // discard empty-to-filled (or filled-to-empty) structural changes.
    if (!entries.length && prefix) output[prefix] = value;
    for (const [key, child] of entries) {
      leaves(child, prefix ? `${prefix}.${key}` : key, output);
    }
  } else if (prefix) output[prefix] = value;
  return output;
}
function setLeaf(target: FieldSnapshot, path: string, value: unknown) {
  const segments = path.split(".");
  let cursor = target;
  for (const segment of segments.slice(0, -1)) cursor = cursor[segment] as FieldSnapshot;
  cursor[segments[segments.length - 1]] = value;
}
/**
 * JSON-value equality: object-property insertion order is not editorial data,
 * but array order (including nested arrays) is. Do not change the historical
 * mapping-hash algorithm: existing D1 hashes are evidence, not migrations.
 */
function same(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b)
      && a.length === b.length && a.every((value, i) => same(value, b[i]));
  }
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") {
    return false;
  }
  // Only plain JSON records are comparable this way. Unknown object types
  // (e.g. Date) must not be declared equal by comparing their empty key lists.
  const plain = (value: object) => {
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  };
  if (!plain(a) || !plain(b)) return false;
  const left = a as Record<string, unknown>, right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length
    && keys.every((key) => Object.hasOwn(right, key) && same(left[key], right[key]));
}
function protectedPath(path: string, protectedFields: ReadonlySet<string>): boolean {
  if (protectedFields.has(path)) return true;
  // Protect a whole subtree when a caller locks its parent object.
  for (let index = path.lastIndexOf("."); index > 0; index = path.lastIndexOf(".", index - 1)) {
    if (protectedFields.has(path.slice(0, index))) return true;
  }
  return false;
}
function blank(value: unknown) {
  return value === null || value === undefined
    || (typeof value === "string" && !value.trim())
    || (Array.isArray(value) && !value.length);
}

/** Both source receipts must be authenticated by the caller and exactly bound
 * to current compared field values. Invalid evidence never chooses a winner. */
function verifiedLatestWinner(
  evidence: VerifiedFieldEditPair | undefined,
  notionValue: unknown, adminValue: unknown,
): "notion" | "psipedia" | null {
  if (!evidence?.notion || !evidence.psipedia) return null;
  const n = evidence.notion, p = evidence.psipedia;
  const valid = (r: VerifiedFieldEdit) => typeof r.observedAt === "string"
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(r.observedAt)
    && Number.isFinite(Date.parse(r.observedAt))
    && new Date(Date.parse(r.observedAt)).toISOString() === r.observedAt
    && typeof r.editId === "string" && r.editId.length > 0;
  if (!valid(n) || !valid(p) || !same(n.value, notionValue)
      || !same(p.value, adminValue)) return null;
  const nt = Date.parse(n.observedAt), pt = Date.parse(p.observedAt);
  if (nt === pt) return null;
  return nt > pt ? "notion" : "psipedia";
}

/** verifiedDeletes are field-specific trusted human intent receipts, not blank inference. */
export function reconcileProfileFields(input: {
  baseline: FieldSnapshot | null;
  notion: FieldSnapshot;
  psipedia: FieldSnapshot;
  protectedFields: ReadonlySet<string>;
  /** Psipedia-owned fields are mirrored back to Notion, not treated as a record conflict. */
  canonicalFieldsWin?: boolean;
  verifiedDeletes?: ReadonlySet<string>;
  /** Optional agenda-specific canonical value equality; does not rewrite data. */
  equalField?: (path: string, left: unknown, right: unknown) => boolean;
  /** Per-field operator authority; never overrides protectedFields or baseline checks. */
  authorities?: Readonly<Record<string, "safe" | "notion" | "admin" | "latest">>;
  /** Directory only: trust the verified one-sided baseline difference over
   * a historical static authority setting. */
  changedSideWins?: boolean;
  /** OPTIONAL: only independently authenticated human field edits, each
   * paired with the actual observed value. No caller supplies these yet. */
  verifiedFieldEdits?: Readonly<Record<string, VerifiedFieldEditPair>>;
}): FieldResolution {
  const merged = structuredClone(input.psipedia);
  if (!input.baseline) return {
    kind: "CONFLICT", merged, conflicts: [{ field: "*", reason: "BASELINE_UNAVAILABLE" }],
    notionFields: [], psipediaFields: [],
  };
  const base = leaves(input.baseline);
  const remote = leaves(input.notion);
  const local = leaves(input.psipedia);
  const conflicts: FieldConflict[] = [], notionFields: string[] = [], psipediaFields: string[] = [];
  const equal = input.equalField ?? ((_path: string, left: unknown, right: unknown) => same(left, right));
  for (const path of new Set([...Object.keys(base), ...Object.keys(remote), ...Object.keys(local)])) {
    if (!Object.hasOwn(base, path) || !Object.hasOwn(remote, path) || !Object.hasOwn(local, path)) {
      conflicts.push({ field: path, reason: "MISSING_FIELD" });
      continue;
    }
    const n = !equal(path, base[path], remote[path]);
    const p = !equal(path, base[path], local[path]);
    if (n) notionFields.push(path);
    if (p) psipediaFields.push(path);
    if (!n && !p) continue;
    if (protectedPath(path, input.protectedFields)) {
      // Changed-field evidence was already recorded above. When the caller
      // explicitly owns this field, retain its canonical value and request a
      // Notion write-back; do not report a duplicate change or a conflict.
      if (!input.canonicalFieldsWin && n) {
        conflicts.push({ field: path, reason: "PROTECTED_FIELD" });
      }
      continue;
    }
    const authority = input.authorities?.[path] ?? "safe";
    // When one side is hash-proven unchanged, an old preferred-source setting
    // cannot turn a newer edit from the other side back into the baseline.
    const singleSideWins = input.changedSideWins === true && n !== p;
    if (authority === "admin" && !(singleSideWins && n)) continue;
    if ((n && !blank(base[path]) && blank(remote[path]) && !input.verifiedDeletes?.has(`notion:${path}`))
      || (p && !blank(base[path]) && blank(local[path]) && !input.verifiedDeletes?.has(`psipedia:${path}`))) {
      conflicts.push({ field: path, reason: "UNVERIFIED_DELETE" });
      continue;
    }
    if (n && p && !equal(path, remote[path], local[path])) {
      const latest = authority === "latest"
        ? verifiedLatestWinner(input.verifiedFieldEdits?.[path], remote[path], local[path])
        : null;
      if (latest === "notion") {
        setLeaf(merged, path, remote[path]);
        continue;
      }
      if (latest === "psipedia") continue;
      if (authority !== "notion") {
        conflicts.push({ field: path, reason: "AMBIGUOUS_SAME_FIELD" });
        continue;
      }
    }
    // Only the actually changed side wins when the caller supplies a verified
    // baseline. Never pull the unchanged Notion value over a new Admin edit.
    if (n || (authority === "notion" && p && !singleSideWins))
      setLeaf(merged, path, remote[path]);
  }
  return {
    kind: conflicts.length ? "CONFLICT" : notionFields.length || psipediaFields.length ? "MERGE" : "UNCHANGED",
    merged, conflicts, notionFields, psipediaFields,
  };
}


/**
 * A missing historical baseline is not evidence of a last edit. Only
 * explicitly configured per-field authority (or immutable canonical
 * ownership) can resolve different current values without guessing.
 *
 * Unresolved fields remain conflicts. The caller may independently persist
 * authorized, non-destructive fields using targeted writes, but MUST NOT
 * advance a full-record mapping hash while any conflict remains.
 */
export function reconcileProfileFieldsWithoutBaseline(input: {
  notion: FieldSnapshot;
  psipedia: FieldSnapshot;
  protectedFields: ReadonlySet<string>;
  canonicalFieldsWin?: boolean;
  verifiedDeletes?: ReadonlySet<string>;
  authorities?: Readonly<Record<string, "safe" | "notion" | "admin" | "latest">>;
}): FieldResolution {
  const merged = structuredClone(input.psipedia);
  const remote = leaves(input.notion);
  const local = leaves(input.psipedia);
  const conflicts: FieldConflict[] = [];
  const notionFields: string[] = [];
  const psipediaFields: string[] = [];
  for (const path of new Set([...Object.keys(remote), ...Object.keys(local)])) {
    if (!Object.hasOwn(remote, path) || !Object.hasOwn(local, path)) {
      conflicts.push({ field: path, reason: "MISSING_FIELD" });
      continue;
    }
    if (same(remote[path], local[path])) continue;
    if (protectedPath(path, input.protectedFields)) {
      // Without a verified common snapshot we cannot prove a publication or
      // identity change was canonical-only. Never silently overwrite a
      // simultaneously edited Notion status, slug or category.
      if (!input.canonicalFieldsWin || ["status", "slug", "category"].includes(path)) {
        conflicts.push({ field: path, reason: "PROTECTED_FIELD" });
      } else if (blank(local[path]) && !blank(remote[path])
          && !input.verifiedDeletes?.has(`psipedia:${path}`)) {
        conflicts.push({ field: path, reason: "UNVERIFIED_DELETE" });
      } else psipediaFields.push(path);
      continue;
    }
    const authority = input.authorities?.[path] ?? "safe";
    if (authority === "notion") {
      if (blank(remote[path]) && !blank(local[path])
          && !input.verifiedDeletes?.has(`notion:${path}`)) {
        conflicts.push({ field: path, reason: "UNVERIFIED_DELETE" });
      } else {
        setLeaf(merged, path, remote[path]);
        notionFields.push(path);
      }
    } else if (authority === "admin") {
      if (blank(local[path]) && !blank(remote[path])
          && !input.verifiedDeletes?.has(`psipedia:${path}`)) {
        conflicts.push({ field: path, reason: "UNVERIFIED_DELETE" });
      } else psipediaFields.push(path);
    } else {
      // 'latest' cannot be established from record-level timestamps.
      conflicts.push({ field: path, reason: "BASELINE_UNAVAILABLE" });
    }
  }
  return {
    kind: conflicts.length ? "CONFLICT"
      : notionFields.length || psipediaFields.length ? "MERGE" : "UNCHANGED",
    merged, conflicts, notionFields, psipediaFields,
  };
}


/**
 * An unchanged side (matching the last acknowledged mapping hash) is a
 * cryptographically verified copy of the prior common editorial state.
 * Reconstruct that baseline without requiring a new D1 table. When both
 * sides diverge, only an independently stored, hash-verified baseline can
 * prove which different fields can safely be combined.
 *
 * Equal current sides can also be adopted as a common state, even when a
 * historical mapping hash is stale; no content is overwritten in that case.
 * Caller-provided hashes MUST be computed from the actual snapshots.
 */
export function trustedProfileBaselineFromHashes(input: {
  recorded: FieldSnapshot | null;
  notion: FieldSnapshot;
  psipedia: FieldSnapshot;
  mappingHash: string;
  notionHash: string;
  psipediaHash: string;
}): FieldSnapshot | null {
  if (input.recorded) return input.recorded;
  if (input.notionHash === input.psipediaHash) return input.psipedia;
  // Historical JSON hashes may differ solely because nested object keys
  // were inserted in different orders. Equal current content is a safe
  // common state: no independent edit is being chosen over another.
  if (same(input.notion, input.psipedia)) return input.psipedia;
  if (input.notionHash === input.mappingHash) return input.notion;
  if (input.psipediaHash === input.mappingHash) return input.psipedia;
  return null;
}
