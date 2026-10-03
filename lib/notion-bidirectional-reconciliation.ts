export type BidirectionalDecision =
  | "UNCHANGED"
  | "PULL_NOTION"
  | "PUSH_PSIPEDIA"
  | "CONFLICT";

export type BidirectionalChangeState = {
  notionChanged: boolean;
  psipediaChanged: boolean;
  decision: BidirectionalDecision;
};

export function decideBidirectionalChange(input: {
  baselineHash: string;
  notionHash: string;
  psipediaHash: string;
}): BidirectionalChangeState {
  const notionChanged = input.notionHash !== input.baselineHash;
  const psipediaChanged = input.psipediaHash !== input.baselineHash;

  if (notionChanged && psipediaChanged && input.notionHash === input.psipediaHash) {
    return { notionChanged, psipediaChanged, decision: "UNCHANGED" };
  }
  if (notionChanged && psipediaChanged) {
    return { notionChanged, psipediaChanged, decision: "CONFLICT" };
  }
  if (notionChanged) {
    return { notionChanged, psipediaChanged, decision: "PULL_NOTION" };
  }
  if (psipediaChanged) {
    return { notionChanged, psipediaChanged, decision: "PUSH_PSIPEDIA" };
  }
  return { notionChanged, psipediaChanged, decision: "UNCHANGED" };
}

function normalizedUrl(value: string) {
  const clean = value.trim();
  if (!clean) return "";
  try {
    const url = new URL(clean);
    url.hash = "";
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString();
  } catch {
    return clean.replace(/\/+$/, "");
  }
}

export type IdentityPage = {
  id: string;
  psipediaId: string;
  url: string;
};

export type IdentityMatch =
  | { kind: "NONE" }
  | { kind: "MATCH"; page: IdentityPage; matchedBy: "id" | "url" }
  | { kind: "CONFLICT"; pageIds: string[]; reason: "DUPLICATE_ID" | "DUPLICATE_URL" | "IDENTITY_MISMATCH" };

export function matchCanonicalIdentity(
  entityId: string,
  url: string,
  pages: IdentityPage[],
): IdentityMatch {
  const cleanId = entityId.trim();
  const cleanUrl = normalizedUrl(url);
  const byId = cleanId ? pages.filter((page) => page.psipediaId.trim() === cleanId) : [];
  if (byId.length > 1) {
    return { kind: "CONFLICT", pageIds: byId.map((page) => page.id), reason: "DUPLICATE_ID" };
  }

  const byUrl = cleanUrl
    ? pages.filter((page) => normalizedUrl(page.url) === cleanUrl)
    : [];
  if (byUrl.length > 1) {
    return { kind: "CONFLICT", pageIds: byUrl.map((page) => page.id), reason: "DUPLICATE_URL" };
  }

  if (byId.length === 1 && byUrl.length === 1 && byId[0].id !== byUrl[0].id) {
    return {
      kind: "CONFLICT",
      pageIds: [byId[0].id, byUrl[0].id],
      reason: "IDENTITY_MISMATCH",
    };
  }
  if (byId.length === 1) return { kind: "MATCH", page: byId[0], matchedBy: "id" };
  if (byUrl.length === 1) return { kind: "MATCH", page: byUrl[0], matchedBy: "url" };
  return { kind: "NONE" };
}

export function stableSnapshotJson(values: Record<string, unknown>) {
  const normalized = Object.fromEntries(
    Object.entries(values)
      .sort(([left], [right]) => left.localeCompare(right, "sk-SK"))
      .map(([key, value]) => [
        key,
        typeof value === "string" ? value.replace(/\r\n?/g, "\n").trim() : value ?? null,
      ]),
  );
  return JSON.stringify(normalized);
}

function normalizeComparableInstant(value: unknown) {
  if (typeof value !== "string") return value;
  const clean = value.replace(/\r\n?/g, "\n").trim();
  if (!clean || /^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
  // Only normalize timezone-aware instants. Naive local datetimes are left
  // untouched because assuming a timezone could hide a real content change.
  if (!/T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(clean)) return clean;
  const timestamp = Date.parse(clean);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : clean;
}

export function stableAgendaSnapshotJson(
  agenda: string,
  values: Record<string, unknown>,
) {
  if (agenda !== "lost-found") return stableSnapshotJson(values);
  return stableSnapshotJson({
    ...values,
    // Notion normalizes timezone-aware date properties to an equivalent UTC
    // representation. Treat equal instants as equal without changing any
    // other agenda's established hash semantics.
    "Naposledy videný": normalizeComparableInstant(values["Naposledy videný"]),
  });
}

export function differingAgendaSnapshotFields(
  agenda: string,
  left: Record<string, unknown>,
  right: Record<string, unknown>,
) {
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])]
    .sort((a, b) => a.localeCompare(b, "sk-SK"));
  return keys.filter((key) => (
    stableAgendaSnapshotJson(agenda, { [key]: left[key] })
    !== stableAgendaSnapshotJson(agenda, { [key]: right[key] })
  ));
}
