import { env } from "cloudflare:workers";
import { canTransitionAdoptionStatus, isAdoptionStatus, type AdoptionStatus } from "./adoption.ts";
import { getAdoptionById, transitionManagedAdoptionStatus, type AdoptionD1Database } from "./adoption-store.ts";
import { transitionManagedEventCancellation } from "./event-store.ts";
import { transitionManagedHelpCaseResolved } from "./help-store.ts";
import { canTransitionLostFoundStatus, type LostFoundStatus } from "./lost-found-lifecycle.js";
import { transitionAdminDogReportStatus } from "./lost-found-dog-store.ts";
import {
  acceptAutomationLifecycleSuggestionDecision,
  getAutomationLifecycleSuggestion,
  hasNewerAutomationLifecycleEvidence,
  rejectAutomationLifecycleSuggestion,
  resolveAutomationLifecycleSuggestionSatisfied,
  type AutomationLifecycleSuggestion,
} from "./data-automation-lifecycle-store.ts";

type RuntimeBindings = { DB?: D1Database };

function database(input?: D1Database) {
  const bound = input ?? (env as unknown as RuntimeBindings).DB;
  if (!bound?.prepare) throw new Error("Automation lifecycle nemá pripojenú databázu.");
  return bound;
}

export class AutomationLifecycleConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AutomationLifecycleConflictError";
  }
}

export class AutomationLifecycleUnsupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AutomationLifecycleUnsupportedError";
  }
}

async function currentEvent(id: number, db: D1Database) {
  return db.prepare("SELECT id,title,status,cancelled,updated_at FROM managed_events WHERE id=? LIMIT 1")
    .bind(id).first<{ id: number; title: string; status: string; cancelled: number; updated_at: string }>();
}

async function currentFoster(id: number, db: D1Database) {
  return db.prepare("SELECT id,title,status,resolved,updated_at FROM help_cases WHERE id=? LIMIT 1")
    .bind(id).first<{ id: number; title: string; status: string; resolved: number; updated_at: string }>();
}

async function currentLostFound(id: number, db: D1Database) {
  return db.prepare("SELECT id,status,updated_at FROM lost_found_dog_reports WHERE id=? LIMIT 1")
    .bind(id).first<{ id: number; status: LostFoundStatus; updated_at: string }>();
}

function stale(message = "Návrh zmeny stavu už nezodpovedá aktuálnemu záznamu. Obnov stránku a skontroluj nový stav.") {
  return new AutomationLifecycleConflictError(message);
}

function lifecycleAuditNote(
  suggestion: AutomationLifecycleSuggestion,
  action: "accept" | "reject" | "already_satisfied",
  previousState: string,
) {
  return [
    "lifecycleVersion=1",
    `action=${action}`,
    `signal=${suggestion.signalType}`,
    `previous=${previousState}`,
    `target=${suggestion.targetState}`,
  ].join("; ");
}

async function applyEvent(suggestion: AutomationLifecycleSuggestion, reviewerEmail: string, db: D1Database) {
  if (suggestion.signalType !== "EVENT_CANCELLED" || suggestion.targetState !== "CANCELLED") {
    throw new AutomationLifecycleUnsupportedError("Tento lifecycle signál podujatia nie je podporovaný.");
  }
  const current = await currentEvent(suggestion.canonicalEntityId, db);
  if (!current) throw stale("Podujatie už neexistuje.");
  if (Boolean(current.cancelled)) return { satisfied: true, currentState: "CANCELLED", previousState: "CANCELLED" };
  try {
    const updated = await transitionManagedEventCancellation(
      suggestion.canonicalEntityId,
      true,
      reviewerEmail,
      current.updated_at,
      db,
    );
    if (!updated?.cancelled) throw stale();
  } catch (error) {
    if (error instanceof Error && error.message === "event_lifecycle_stale") throw stale();
    throw error;
  }
  return { satisfied: false, currentState: "CANCELLED", previousState: "ACTIVE" };
}

async function applyAdoption(suggestion: AutomationLifecycleSuggestion, reviewerEmail: string, db: D1Database) {
  if (!["ADOPTION_ADOPTED", "ADOPTION_RESERVED"].includes(suggestion.signalType) || !isAdoptionStatus(suggestion.targetState)) {
    throw new AutomationLifecycleUnsupportedError("Tento lifecycle signál adopcie nie je podporovaný.");
  }
  const current = await getAdoptionById(suggestion.canonicalEntityId, db as unknown as AdoptionD1Database);
  if (!current) throw stale("Adopčný profil už neexistuje.");
  const target = suggestion.targetState as AdoptionStatus;
  if (current.status === target) return { satisfied: true, currentState: target, previousState: current.status };
  if (!canTransitionAdoptionStatus(current.status, target)) {
    throw stale(`Aktuálny stav adopcie nepovoľuje prechod ${current.status} → ${target}. Zmenu treba vyriešiť manuálne v profile.`);
  }
  try {
    await transitionManagedAdoptionStatus(
      suggestion.canonicalEntityId,
      target,
      reviewerEmail,
      db as unknown as AdoptionD1Database,
    );
  } catch (error) {
    if (error instanceof Error && /Nepovolený prechod|neexistuje|conflict/i.test(error.message)) throw stale();
    throw error;
  }
  return { satisfied: false, currentState: target, previousState: current.status };
}

async function applyFoster(suggestion: AutomationLifecycleSuggestion, reviewerEmail: string, db: D1Database) {
  if (suggestion.signalType !== "FOSTER_RESOLVED" || suggestion.targetState !== "RESOLVED") {
    throw new AutomationLifecycleUnsupportedError("Tento lifecycle signál dočasnej opatery nie je podporovaný.");
  }
  const current = await currentFoster(suggestion.canonicalEntityId, db);
  if (!current) throw stale("Prípad dočasnej opatery už neexistuje.");
  if (Boolean(current.resolved)) return { satisfied: true, currentState: "RESOLVED", previousState: "RESOLVED" };
  try {
    const updated = await transitionManagedHelpCaseResolved(
      suggestion.canonicalEntityId,
      true,
      reviewerEmail,
      current.updated_at,
      db,
    );
    if (!updated?.resolved) throw stale();
  } catch (error) {
    if (error instanceof Error && error.message === "help_lifecycle_stale") throw stale();
    throw error;
  }
  return { satisfied: false, currentState: "RESOLVED", previousState: "OPEN" };
}

async function applyLostFound(suggestion: AutomationLifecycleSuggestion, reviewerEmail: string, db: D1Database) {
  if (suggestion.signalType !== "LOST_FOUND_RESOLVED" || suggestion.targetState !== "RESOLVED") {
    throw new AutomationLifecycleUnsupportedError("Tento lifecycle signál strateného/nájdeného psa nie je podporovaný.");
  }
  const current = await currentLostFound(suggestion.canonicalEntityId, db);
  if (!current) throw stale("Hlásenie už neexistuje.");
  if (current.status === "RESOLVED") return { satisfied: true, currentState: "RESOLVED", previousState: "RESOLVED" };
  if (!canTransitionLostFoundStatus(current.status, "RESOLVED")) {
    throw stale(`Aktuálny stav hlásenia ${current.status} nepovoľuje priamy prechod na RESOLVED. Zmenu treba vyriešiť manuálne.`);
  }
  try {
    await transitionAdminDogReportStatus(
      suggestion.canonicalEntityId,
      "RESOLVED",
      reviewerEmail,
      current.updated_at,
      db,
    );
  } catch (error) {
    if (error instanceof Error && (error.message === "lost_found_lifecycle_stale" || /Nepovolený prechod/i.test(error.message))) throw stale();
    throw error;
  }
  return { satisfied: false, currentState: "RESOLVED", previousState: current.status };
}

export async function applyAutomationLifecycleSuggestion(input: {
  id: number;
  action: "accept" | "reject";
  expectedFingerprint: string;
  reviewerEmail: string;
  now?: Date;
}, databaseInput?: D1Database) {
  const db = database(databaseInput);
  const suggestion = await getAutomationLifecycleSuggestion(input.id, db);
  if (!suggestion) return null;
  if (!input.expectedFingerprint || suggestion.fingerprint !== input.expectedFingerprint) throw stale();

  if (input.action === "reject") {
    if (suggestion.reviewStatus === "REJECTED" && suggestion.reviewerDecision === "LIFECYCLE_REJECTED") {
      return { suggestion, applied: false, rejected: true, satisfied: false };
    }
    if (!["NEW", "IN_REVIEW", "SUPPRESSED"].includes(suggestion.reviewStatus)) throw stale("Návrh už bol rozhodnutý.");
    const rejected = await rejectAutomationLifecycleSuggestion({
      id: suggestion.id,
      expectedFingerprint: suggestion.fingerprint,
      reviewerEmail: input.reviewerEmail,
      reviewerNotes: lifecycleAuditNote(suggestion, "reject", suggestion.currentState),
      at: (input.now ?? new Date()).toISOString(),
    }, db);
    return rejected ? { suggestion: rejected, applied: false, rejected: true, satisfied: false } : null;
  }

  if (
    suggestion.reviewStatus === "RESOLVED"
    && ["LIFECYCLE_ACCEPTED", "LIFECYCLE_ALREADY_SATISFIED"].includes(suggestion.reviewerDecision ?? "")
  ) {
    return { suggestion, applied: false, rejected: false, satisfied: true };
  }
  if (!["NEW", "IN_REVIEW", "SUPPRESSED"].includes(suggestion.reviewStatus)) throw stale("Návrh už bol rozhodnutý.");
  if (await hasNewerAutomationLifecycleEvidence(suggestion, db)) {
    throw stale("Zdroj medzičasom poskytol novšie lifecycle evidence. Obnov stránku a skontroluj novší návrh.");
  }

  const result = suggestion.entityType === "EVENT"
    ? await applyEvent(suggestion, input.reviewerEmail, db)
    : suggestion.entityType === "ADOPTION"
      ? await applyAdoption(suggestion, input.reviewerEmail, db)
      : suggestion.entityType === "FOSTER"
        ? await applyFoster(suggestion, input.reviewerEmail, db)
        : await applyLostFound(suggestion, input.reviewerEmail, db);

  const decidedAt = (input.now ?? new Date()).toISOString();
  const decided = result.satisfied
    ? await resolveAutomationLifecycleSuggestionSatisfied({
        id: suggestion.id,
        expectedFingerprint: suggestion.fingerprint,
        reviewerNotes: lifecycleAuditNote(suggestion, "already_satisfied", result.previousState),
        at: decidedAt,
      }, db)
    : await acceptAutomationLifecycleSuggestionDecision({
        id: suggestion.id,
        expectedFingerprint: suggestion.fingerprint,
        reviewerEmail: input.reviewerEmail,
        reviewerNotes: lifecycleAuditNote(suggestion, "accept", result.previousState),
        at: decidedAt,
      }, db);

  return decided ? {
    suggestion: decided,
    applied: !result.satisfied,
    rejected: false,
    satisfied: result.satisfied,
    currentState: result.currentState,
  } : null;
}
