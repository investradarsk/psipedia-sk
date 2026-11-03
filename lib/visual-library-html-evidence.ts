import type { DynamicUrlKind } from "@/lib/visual-library-dynamic-urls-contract";

/**
 * Browser-only, on-demand public HTML evidence. A React import is NOT a visual
 * placement. This contract never upgrades a missing marker to a verified use.
 *
 * Only an existing public URL from the audited catalogue or published D1 URL
 * index may reach the UI. The validator additionally rules out off-site and
 * private routes. The browser makes a same-origin GET with credentials omitted.
 */
export type HtmlProbe = { kind: "anchor"; anchorId: string }
  | { kind: "profile"; profileKind: DynamicUrlKind };

export type HtmlEvidenceState = "verified" | "page-only" | "missing" | "unavailable";
export type HtmlEvidenceResult = {
  state: HtmlEvidenceState;
  explanation: string;
  checkedAt: string;
  checkedPath: string;
};

const ALLOWED_PUBLIC_ORIGIN = "https://psipedia.sk";
export const MAX_VISUAL_AUDIT_HTML_BYTES = 1_500_000;

/** No external origins, admin/partner/API paths, dynamic placeholders or query. */
export function safePublicHtmlAuditPath(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 512) return null;
  let url: URL;
  try { url = new URL(raw); } catch { return null; }
  if (url.origin !== ALLOWED_PUBLIC_ORIGIN || url.username || url.password ||
      url.search || url.hash || url.port || !/^\/[a-zA-Z0-9/_-]*$/.test(url.pathname) ||
      url.pathname.includes("//") || url.pathname.includes("..")) return null;
  if (["/admin", "/api", "/partner", "/prihlasenie", "/ucet"].some(
    blocked => url.pathname === blocked || url.pathname.startsWith(blocked + "/"),
  )) return null;
  return url.pathname;
}

export function validHtmlProbe(value: HtmlProbe): boolean {
  if (value.kind === "anchor") return /^[a-zA-Z][a-zA-Z0-9_-]{0,119}$/.test(value.anchorId);
  return ["directory", "organizations", "adoptions", "help", "lost-found",
    "events", "breeds", "articles", "eshops"].includes(value.profileKind);
}

export const profileHtmlSelectors: Partial<Record<DynamicUrlKind, string>> = {
  directory: "[data-public-profile-body]",
  adoptions: 'main[data-adoption-source="canonical"]',
  events: "[data-event-facts]",
  breeds: '[data-testid="breed-hero"]',
};

type InspectableDocument = {
  getElementById(id: string): Element | null;
  querySelector(selector: string): Element | null;
};

export function classifyHtmlInspection(
  doc: InspectableDocument, probe: HtmlProbe,
): { state: Exclude<HtmlEvidenceState, "unavailable">; explanation: string } {
  if (probe.kind === "anchor") {
    if (doc.getElementById(probe.anchorId)) return {
      state: "verified",
      explanation: "Kotva komponentu sa nachádza v aktuálnom serverovom HTML stránky.",
    };
    return {
      state: "missing",
      explanation: "Kotva sa v serverovom HTML nenašla. Prvok môže byť podmienený dátami alebo zobrazený až po načítaní JavaScriptu.",
    };
  }
  const marker = profileHtmlSelectors[probe.profileKind];
  if (marker && doc.querySelector(marker)) return {
    state: "verified",
    explanation: "Značka verejnej detailovej šablóny sa našla v serverovom HTML. Toto nepotvrdzuje každý vnorený komponent.",
  };
  if (doc.querySelector("h1")) return {
    state: "page-only",
    explanation: marker
      ? "Stránka sa načítala s nadpisom, ale značka detailovej šablóny sa nenašla."
      : "Stránka má nadpis, ale pre tento typ profilu nemáme samostatnú jednoznačnú značku komponentu.",
  };
  return {
    state: "missing",
    explanation: "Požadovaný prvok ani nadpis sa v serverovom HTML nenašli. Výsledok nepreukazuje, že sa prvok nikdy nevykreslí.",
  };
}
