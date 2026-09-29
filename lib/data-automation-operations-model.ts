import {
  canonicalizeSourceUrl,
  normalizeAutomationIdentity,
  type AutomationCanonicalMatch,
  type AutomationSourceRecord,
} from "./data-automation.ts";

export const automationOperationsRanges = ["today", "7d", "30d"] as const;
export type AutomationOperationsRange = (typeof automationOperationsRanges)[number];

export function parseAutomationOperationsRange(value: unknown): AutomationOperationsRange {
  return value === "today" || value === "30d" ? value : "7d";
}

function zonedMidnightUtc(now: Date, timeZone = "Europe/Bratislava") {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) =>
    Number(ymd.find((part) => part.type === type)?.value ?? 0);
  const year = get("year");
  const month = get("month");
  const day = get("day");
  const guess = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  const local = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(guess);
  const localGet = (type: string) =>
    Number(local.find((part) => part.type === type)?.value ?? 0);
  const representedAsUtc = Date.UTC(
    localGet("year"),
    localGet("month") - 1,
    localGet("day"),
    localGet("hour"),
    localGet("minute"),
    localGet("second"),
  );
  const offsetMs = representedAsUtc - guess.getTime();
  return new Date(guess.getTime() - offsetMs);
}

export function automationOperationsCutoff(range: AutomationOperationsRange, now = new Date()) {
  if (range === "today") return zonedMidnightUtc(now).toISOString();
  const days = range === "30d" ? 30 : 7;
  return new Date(now.getTime() - days * 24 * 60 * 60_000).toISOString();
}

export type AutomationCadenceRecommendation =
  | "KEEP_CURRENT"
  | "CONSIDER_SLOWER"
  | "CONSIDER_FASTER"
  | "INSUFFICIENT_DATA";

export type AutomationRecommendationRun = {
  status: "SUCCESS" | "PARTIAL" | "FAILED";
  canonicalDuplicateCount: number | null;
  newEntityCount: number | null;
  updateSuggestionCount: number | null;
  possibleDuplicateCount: number | null;
  candidateCount: number | null;
  errorCount: number;
  providerFailure?: boolean;
  budgetBlocked?: boolean;
  capSaturated?: boolean;
};

export function automationCadenceRecommendation(
  runs: AutomationRecommendationRun[],
): AutomationCadenceRecommendation {
  const healthy = runs
    .filter((run) =>
      run.status === "SUCCESS"
      && run.errorCount === 0
      && !run.providerFailure
      && !run.budgetBlocked
      && run.newEntityCount !== null
      && run.updateSuggestionCount !== null
      && run.canonicalDuplicateCount !== null
    )
    .slice(0, 8);

  if (healthy.length < 4) return "INSUFFICIENT_DATA";

  const recent = healthy.slice(0, 4);
  const useful = recent.map((run) =>
    Math.max(0, run.newEntityCount ?? 0) + Math.max(0, run.updateSuggestionCount ?? 0));
  const usefulTotal = useful.reduce((sum, value) => sum + value, 0);
  const duplicateTotal = recent.reduce((sum, run) => sum + Math.max(0, run.canonicalDuplicateCount ?? 0), 0);
  const processedTotal = recent.reduce((sum, run) => {
    const known = Math.max(0, run.canonicalDuplicateCount ?? 0)
      + Math.max(0, run.newEntityCount ?? 0)
      + Math.max(0, run.updateSuggestionCount ?? 0);
    return sum + Math.max(known, Math.max(0, run.candidateCount ?? 0));
  }, 0);
  const duplicateRatio = processedTotal > 0 ? duplicateTotal / processedTotal : 0;

  if (usefulTotal === 0 && processedTotal > 0 && duplicateRatio >= 0.75) {
    return "CONSIDER_SLOWER";
  }

  const productiveRuns = useful.filter((value) => value >= 2).length;
  const saturatedRuns = recent.filter((run) => run.capSaturated).length;
  if (productiveRuns >= 3 || saturatedRuns >= 2) return "CONSIDER_FASTER";

  return "KEEP_CURRENT";
}

export type AutomationMatchExplanationCode =
  | "SAME_WEB"
  | "SAME_EXTERNAL_ID"
  | "SAME_PHONE"
  | "NAME_CITY"
  | "STRONG_MATCH"
  | "POSSIBLE_MATCH"
  | "GENERIC_MATCH"
  | "NEW_ENTITY";

function sameText(left: unknown, right: unknown) {
  const a = normalizeAutomationIdentity(left);
  const b = normalizeAutomationIdentity(right);
  return Boolean(a && b && a === b);
}

function sameUrl(left: unknown, right: unknown) {
  const a = canonicalizeSourceUrl(left);
  const b = canonicalizeSourceUrl(right);
  return Boolean(a && b && a === b);
}

export function automationMatchExplanation(input: {
  record: AutomationSourceRecord;
  match: AutomationCanonicalMatch;
}): { code: AutomationMatchExplanationCode; label: string } {
  const before = input.match.before ?? {};
  const proposed = input.record.proposed ?? {};

  if (!input.match.entityId && input.match.quality === "NONE") {
    return { code: "NEW_ENTITY", label: "Nový záznam." };
  }
  if (input.match.quality === "UNCERTAIN") {
    return { code: "POSSIBLE_MATCH", label: "Možná zhoda — vytvorený koncept s varovaním." };
  }
  if (
    sameUrl(input.record.sourceUrl, before.websiteUrl)
    || sameUrl(input.record.sourceUrl, before.website_url)
    || sameUrl(input.record.sourceUrl, before.sourceUrl)
    || sameUrl(input.record.sourceUrl, before.source_url)
  ) {
    return { code: "SAME_WEB", label: "Rovnaký web" };
  }

  const proposedExternal = proposed.importKey ?? proposed.import_key ?? proposed.externalId ?? proposed.external_id;
  const beforeExternal = before.importKey ?? before.import_key ?? before.externalId ?? before.external_id;
  if (proposedExternal && beforeExternal && sameText(proposedExternal, beforeExternal)) {
    return { code: "SAME_EXTERNAL_ID", label: "Rovnaký externý identifikátor" };
  }

  const proposedPhone = proposed.publicPhone ?? proposed.public_phone ?? proposed.phone;
  const beforePhone = before.publicPhone ?? before.public_phone ?? before.phone;
  if (proposedPhone && beforePhone && sameText(proposedPhone, beforePhone)) {
    return { code: "SAME_PHONE", label: "Rovnaký telefón" };
  }

  if (sameText(proposed.name, before.name) && sameText(proposed.city, before.city)) {
    return { code: "NAME_CITY", label: "Názov + mesto" };
  }
  if (input.match.quality === "STRONG_IDENTITY") {
    return { code: "STRONG_MATCH", label: "Silná zhoda s existujúcim profilom" };
  }
  return { code: "GENERIC_MATCH", label: "Zhodovalo sa s existujúcim záznamom." };
}

export function automationMatchExplanationLabel(code: string) {
  const labels: Record<string, string> = {
    SAME_WEB: "Rovnaký web",
    SAME_EXTERNAL_ID: "Rovnaký externý identifikátor",
    SAME_PHONE: "Rovnaký telefón",
    NAME_CITY: "Názov + mesto",
    STRONG_MATCH: "Silná zhoda s existujúcim profilom",
    POSSIBLE_MATCH: "Možná zhoda — koncept s varovaním",
    GENERIC_MATCH: "Zhodovalo sa s existujúcim záznamom.",
    NEW_ENTITY: "Nový záznam",
  };
  return labels[code] ?? labels.GENERIC_MATCH;
}
