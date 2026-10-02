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
