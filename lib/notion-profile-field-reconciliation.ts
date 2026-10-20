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

function leaves(value: unknown, prefix = "", output: Record<string, unknown> = {}) {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) {
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
function same(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}
function blank(value: unknown) {
  return value === null || value === undefined
    || (typeof value === "string" && !value.trim())
    || (Array.isArray(value) && !value.length);
}

/** verifiedDeletes are field-specific trusted human intent receipts, not blank inference. */
export function reconcileProfileFields(input: {
  baseline: FieldSnapshot | null;
  notion: FieldSnapshot;
  psipedia: FieldSnapshot;
  protectedFields: ReadonlySet<string>;
  verifiedDeletes?: ReadonlySet<string>;
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
  for (const path of new Set([...Object.keys(base), ...Object.keys(remote), ...Object.keys(local)])) {
    if (!Object.hasOwn(base, path) || !Object.hasOwn(remote, path) || !Object.hasOwn(local, path)) {
      conflicts.push({ field: path, reason: "MISSING_FIELD" });
      continue;
    }
    const n = !same(base[path], remote[path]);
    const p = !same(base[path], local[path]);
    if (n) notionFields.push(path);
    if (p) psipediaFields.push(path);
    if (!n && !p) continue;
    if (input.protectedFields.has(path)) {
      if (n) conflicts.push({ field: path, reason: "PROTECTED_FIELD" });
      continue;
    }
    if ((n && !blank(base[path]) && blank(remote[path]) && !input.verifiedDeletes?.has(`notion:${path}`))
      || (p && !blank(base[path]) && blank(local[path]) && !input.verifiedDeletes?.has(`psipedia:${path}`))) {
      conflicts.push({ field: path, reason: "UNVERIFIED_DELETE" });
      continue;
    }
    if (n && p && !same(remote[path], local[path])) {
      conflicts.push({ field: path, reason: "AMBIGUOUS_SAME_FIELD" });
      continue;
    }
    if (n) setLeaf(merged, path, remote[path]);
  }
  return {
    kind: conflicts.length ? "CONFLICT" : notionFields.length || psipediaFields.length ? "MERGE" : "UNCHANGED",
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
  if (input.notionHash === input.mappingHash) return input.notion;
  if (input.psipediaHash === input.mappingHash) return input.psipedia;
  return null;
}
