import { canTransitionAdoptionStatus, isAdoptionStatus, type AdoptionStatus } from "./adoption.ts";
import { canTransitionLostFoundStatus } from "./lost-found-lifecycle.js";
import {
  canonicalizeSourceUrl,
  isAutomationEntityType,
  normalizeAutomationIdentity,
  sha256Hex,
  type AutomationCanonicalMatch,
  type AutomationEntityType,
  type AutomationFindingType,
  type AutomationLifecycleSignal,
  type AutomationLifecycleSignalType,
  type AutomationSource,
  type AutomationSourceRecord,
} from "./data-automation.ts";

export const AUTOMATION_LIFECYCLE_VERSION = 1 as const;
export const automationLifecycleEntityTypes = ["EVENT", "ADOPTION", "FOSTER", "LOST_FOUND"] as const;
export type AutomationLifecycleEntityType = (typeof automationLifecycleEntityTypes)[number];

export type AutomationLifecycleMetadata = {
  lifecycleVersion: typeof AUTOMATION_LIFECYCLE_VERSION;
  signalType: AutomationLifecycleSignalType;
  targetState: string;
  evidenceText: string;
  confidenceClass: "EXPLICIT";
  sourceRecordId: string;
  sourceUrl: string | null;
};

const signalTargets: Record<AutomationLifecycleSignalType, { entityType: AutomationLifecycleEntityType; targetState: string }> = {
  EVENT_CANCELLED: { entityType: "EVENT", targetState: "CANCELLED" },
  ADOPTION_ADOPTED: { entityType: "ADOPTION", targetState: "ADOPTED" },
  ADOPTION_RESERVED: { entityType: "ADOPTION", targetState: "RESERVED" },
  FOSTER_RESOLVED: { entityType: "FOSTER", targetState: "RESOLVED" },
  LOST_FOUND_RESOLVED: { entityType: "LOST_FOUND", targetState: "RESOLVED" },
};

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function evidence(value: unknown, fallback: string) {
  const text = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  return (text || fallback).slice(0, 240);
}

function cancellationEvidence(raw: Record<string, unknown>) {
  const title = String(raw.title ?? "");
  const explicit = title.match(/\b(?:ZRUŠENÉ|ZRUŠENÁ|ZRUŠENÝ|ZRUŠENÉHO)\b/i)?.[0];
  return evidence(explicit, "Zdroj označil podujatie ako zrušené.");
}

function validSignalForEntity(entityType: AutomationEntityType, signal: AutomationLifecycleSignal) {
  const contract = signalTargets[signal.signalType];
  return Boolean(
    contract
    && contract.entityType === entityType
    && signal.targetState === contract.targetState
    && signal.confidenceClass === "EXPLICIT"
    && signal.evidenceText.trim(),
  );
}

export function normalizeAutomationLifecycleSignals(
  entityType: AutomationEntityType,
  record: AutomationSourceRecord,
): AutomationLifecycleSignal[] {
  if (!(automationLifecycleEntityTypes as readonly string[]).includes(entityType)) return [];

  const explicit = (record.lifecycleSignals ?? [])
    .map((signal) => ({ ...signal, evidenceText: evidence(signal.evidenceText, "") }))
    .filter((signal) => validSignalForEntity(entityType, signal));
  const signals: AutomationLifecycleSignal[] = [...explicit];
  const raw = object(record.rawRecord);
  const proposed = record.proposed;

  if (entityType === "EVENT" && proposed.cancelled === true && !signals.some((signal) => signal.signalType === "EVENT_CANCELLED")) {
    signals.push({
      signalType: "EVENT_CANCELLED",
      targetState: "CANCELLED",
      evidenceText: cancellationEvidence(raw),
      confidenceClass: "EXPLICIT",
    });
  }

  if (entityType === "ADOPTION" && !signals.some((signal) => signal.signalType.startsWith("ADOPTION_"))) {
    if (raw.adopted === true) {
      signals.push({
        signalType: "ADOPTION_ADOPTED",
        targetState: "ADOPTED",
        evidenceText: evidence(raw.adoptedEvidence, "Adoptovaný"),
        confidenceClass: "EXPLICIT",
      });
    } else if (raw.reserved === true) {
      signals.push({
        signalType: "ADOPTION_RESERVED",
        targetState: "RESERVED",
        evidenceText: evidence(raw.reservedEvidence, "Rezervovaný"),
        confidenceClass: "EXPLICIT",
      });
    }
  }

  if (
    entityType === "FOSTER"
    && (raw.resolved === true || proposed.resolved === true)
    && !signals.some((signal) => signal.signalType === "FOSTER_RESOLVED")
  ) {
    signals.push({
      signalType: "FOSTER_RESOLVED",
      targetState: "RESOLVED",
      evidenceText: evidence(raw.resolvedEvidence ?? raw.title, "Dočasná opatera je podľa zdroja vyriešená."),
      confidenceClass: "EXPLICIT",
    });
  }

  if (
    entityType === "LOST_FOUND"
    && raw.resolvedSignal === true
    && !signals.some((signal) => signal.signalType === "LOST_FOUND_RESOLVED")
  ) {
    signals.push({
      signalType: "LOST_FOUND_RESOLVED",
      targetState: "RESOLVED",
      evidenceText: evidence(raw.resolvedEvidence, "Zdroj uvádza, že prípad bol vyriešený."),
      confidenceClass: "EXPLICIT",
    });
  }

  return signals.filter((signal, index, all) =>
    all.findIndex((candidate) =>
      candidate.signalType === signal.signalType
      && candidate.targetState === signal.targetState
      && candidate.evidenceText === signal.evidenceText
    ) === index
  );
}

export function stripAutomationLifecycleFields(
  entityType: AutomationEntityType,
  proposed: Record<string, unknown>,
  signals: AutomationLifecycleSignal[],
) {
  const content = { ...proposed };
  if (entityType === "EVENT" && signals.some((signal) => signal.signalType === "EVENT_CANCELLED")) {
    delete content.cancelled;
    if (normalizeAutomationIdentity(content.status) === "cancelled") delete content.status;
  }
  if (entityType === "ADOPTION") {
    const target = signals.find((signal) => signal.signalType === "ADOPTION_ADOPTED" || signal.signalType === "ADOPTION_RESERVED")?.targetState;
    if (target && String(content.status ?? "").trim().toUpperCase() === target) delete content.status;
  }
  if (entityType === "FOSTER" && signals.some((signal) => signal.signalType === "FOSTER_RESOLVED")) {
    delete content.resolved;
  }
  if (entityType === "LOST_FOUND" && signals.some((signal) => signal.signalType === "LOST_FOUND_RESOLVED")) {
    if (String(content.status ?? "").trim().toUpperCase() === "RESOLVED") delete content.status;
  }
  return content;
}

export function automationLifecycleCurrentState(
  entityType: AutomationEntityType,
  before: Record<string, unknown> | null,
) {
  if (!before) return "";
  if (entityType === "EVENT") return before.cancelled === true ? "CANCELLED" : "ACTIVE";
  if (entityType === "FOSTER") return before.resolved === true ? "RESOLVED" : "OPEN";
  return String(before.status ?? "").trim().toUpperCase();
}

export function automationLifecycleAlreadySatisfied(
  entityType: AutomationEntityType,
  before: Record<string, unknown> | null,
  signal: AutomationLifecycleSignal | AutomationLifecycleMetadata,
) {
  return automationLifecycleCurrentState(entityType, before) === signal.targetState;
}

export function automationLifecycleCanApply(
  entityType: AutomationEntityType,
  before: Record<string, unknown> | null,
  targetState: string,
) {
  const current = automationLifecycleCurrentState(entityType, before);
  if (!current || current === targetState) return true;
  if (entityType === "EVENT") return targetState === "CANCELLED" && current === "ACTIVE";
  if (entityType === "FOSTER") return targetState === "RESOLVED" && current === "OPEN";
  if (entityType === "ADOPTION") {
    return isAdoptionStatus(current) && isAdoptionStatus(targetState)
      ? canTransitionAdoptionStatus(current as AdoptionStatus, targetState as AdoptionStatus)
      : false;
  }
  if (entityType === "LOST_FOUND") return canTransitionLostFoundStatus(current, targetState);
  return false;
}

export function automationLifecycleDiff(
  entityType: AutomationEntityType,
  before: Record<string, unknown> | null,
  signal: AutomationLifecycleSignal,
) {
  if (entityType === "EVENT") return { cancelled: { before: Boolean(before?.cancelled), after: true } };
  if (entityType === "FOSTER") return { resolved: { before: Boolean(before?.resolved), after: true } };
  return { status: { before: before?.status ?? null, after: signal.targetState } };
}

export function automationLifecycleFindingType(signalType: AutomationLifecycleSignalType): AutomationFindingType {
  return signalType === "EVENT_CANCELLED" ? "POSSIBLE_CANCELLED" : "POSSIBLE_INACTIVE";
}

export function automationLifecycleReason(signal: AutomationLifecycleSignal) {
  if (signal.signalType === "EVENT_CANCELLED") return "Zdroj explicitne uvádza, že podujatie bolo zrušené. Canonical záznam zostal bez zmeny.";
  if (signal.signalType === "ADOPTION_ADOPTED") return "Zdroj explicitne uvádza, že pes bol adoptovaný. Stav adopcie sa zmení iba po potvrdení administrátorom.";
  if (signal.signalType === "ADOPTION_RESERVED") return "Zdroj explicitne uvádza, že pes je rezervovaný. Stav adopcie sa zmení iba po potvrdení administrátorom.";
  if (signal.signalType === "FOSTER_RESOLVED") return "Zdroj explicitne uvádza, že dočasná opatera bola vyriešená. Canonical záznam zostal bez zmeny.";
  return "Zdroj explicitne uvádza, že prípad strateného alebo nájdeného psa bol vyriešený. Canonical záznam zostal bez zmeny.";
}

export function automationLifecycleStateLabel(entityType: AutomationEntityType, state: string) {
  if (entityType === "EVENT") return state === "CANCELLED" ? "Zrušené" : "Aktívne podujatie";
  if (entityType === "FOSTER") return state === "RESOLVED" ? "Vybavené" : "Nevybavené";
  if (entityType === "ADOPTION") {
    return ({ DRAFT: "Koncept", ACTIVE: "Na adopciu", RESERVED: "Rezervovaný", ADOPTED: "Adoptovaný", ARCHIVED: "Archivovaný" } as Record<string, string>)[state] ?? state;
  }
  if (entityType === "LOST_FOUND") {
    return ({ DRAFT: "Koncept", PENDING: "Čaká na kontrolu", ACTIVE: "Aktívne", RESOLVED: "Vyriešené", EXPIRED: "Expirované", REJECTED: "Zamietnuté", ARCHIVED: "Archivované" } as Record<string, string>)[state] ?? state;
  }
  return state;
}

export function automationLifecycleActionLabel(signalType: AutomationLifecycleSignalType, entityLabel: string) {
  if (signalType === "EVENT_CANCELLED") return `Označiť ${entityLabel} ako zrušené`;
  if (signalType === "ADOPTION_ADOPTED") return `Označiť ${entityLabel} ako adoptovaného`;
  if (signalType === "ADOPTION_RESERVED") return `Označiť ${entityLabel} ako rezervovaného`;
  if (signalType === "FOSTER_RESOLVED") return `Označiť ${entityLabel} ako vybavené`;
  return `Označiť ${entityLabel} ako vyriešené`;
}

export function automationLifecycleMetadata(
  record: AutomationSourceRecord,
  signal: AutomationLifecycleSignal,
): AutomationLifecycleMetadata {
  return {
    lifecycleVersion: AUTOMATION_LIFECYCLE_VERSION,
    signalType: signal.signalType,
    targetState: signal.targetState,
    evidenceText: evidence(signal.evidenceText, ""),
    confidenceClass: "EXPLICIT",
    sourceRecordId: record.sourceRecordId.trim().slice(0, 240),
    sourceUrl: canonicalizeSourceUrl(record.sourceUrl),
  };
}

export function isAutomationLifecycleMetadata(value: unknown): value is AutomationLifecycleMetadata {
  const candidate = object(value);
  const signalType = String(candidate.signalType ?? "") as AutomationLifecycleSignalType;
  const contract = signalTargets[signalType];
  return candidate.lifecycleVersion === AUTOMATION_LIFECYCLE_VERSION
    && Boolean(contract)
    && candidate.targetState === contract?.targetState
    && candidate.confidenceClass === "EXPLICIT"
    && typeof candidate.evidenceText === "string"
    && Boolean(candidate.evidenceText.trim())
    && typeof candidate.sourceRecordId === "string"
    && Boolean(candidate.sourceRecordId.trim());
}

export async function automationLifecycleFingerprint(input: {
  source: Pick<AutomationSource, "sourceKey">;
  record: Pick<AutomationSourceRecord, "sourceRecordId" | "sourceUrl" | "sourceTimestamp">;
  entityType: AutomationEntityType;
  canonicalEntityId: number;
  signal: AutomationLifecycleSignal;
}) {
  const material = {
    lifecycleVersion: AUTOMATION_LIFECYCLE_VERSION,
    entityType: input.entityType,
    canonicalEntityId: input.canonicalEntityId,
    signalType: input.signal.signalType,
    targetState: input.signal.targetState,
    sourceKey: input.source.sourceKey,
    sourceRecordId: input.record.sourceRecordId,
    sourceUrl: canonicalizeSourceUrl(input.record.sourceUrl),
    sourceTimestamp: input.record.sourceTimestamp,
    evidenceText: evidence(input.signal.evidenceText, ""),
  };
  const payloadHash = await sha256Hex(material);
  return { fingerprint: `lifecycle:${payloadHash}`, payloadHash };
}

export function automationLifecycleEntityLabel(
  match: Pick<AutomationCanonicalMatch, "entityId" | "before">,
) {
  const before = match.before ?? {};
  return String(before.name ?? before.title ?? before.dogName ?? "").trim()
    || `Záznam #${match.entityId ?? "?"}`;
}

export function isAutomationLifecycleEntityType(value: unknown): value is AutomationLifecycleEntityType {
  return typeof value === "string"
    && isAutomationEntityType(value)
    && (automationLifecycleEntityTypes as readonly string[]).includes(value);
}
