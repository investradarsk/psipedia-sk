import { and, desc, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "@/db";
import { moderationSubmissions } from "@/db/foundation-schema";
import {
  FOUNDATION_SUBMISSION_STATUSES,
  ModerationStateConflictError,
  applyAtomicModerationTransition,
  canTransitionModerationSubmission,
  isFoundationSubmissionStatus,
  type FoundationSubmissionStatus,
} from "@/lib/moderation-transition";
import { safeAuditJson } from "@/lib/submission-security";

export const FOUNDATION_RESOURCE_TYPES = ["LOST_FOUND_CASE", "ADOPTION_DOG", "ORGANIZATION_CHANGE", "PROFILE_REVIEW", "DIRECTORY_PROFILE", "HELP_ORGANIZATION"] as const;
export type FoundationResourceType = (typeof FOUNDATION_RESOURCE_TYPES)[number];
export {
  FOUNDATION_SUBMISSION_STATUSES,
  ModerationStateConflictError,
  canTransitionModerationSubmission,
  isFoundationSubmissionStatus,
};
export type { FoundationSubmissionStatus };

type RuntimeBindings = { DB?: D1Database };

function getModerationDatabase() {
  const database = (env as unknown as RuntimeBindings).DB;
  if (!database?.prepare || typeof database.batch !== "function") throw new Error("Moderation database is unavailable");
  return database;
}

export function isFoundationResourceType(value: unknown): value is FoundationResourceType {
  return typeof value === "string" && FOUNDATION_RESOURCE_TYPES.includes(value as FoundationResourceType);
}

export async function createModerationSubmission(input: {
  resourceType: FoundationResourceType;
  subjectId?: string | null;
  operation: "CREATE" | "UPDATE" | "REMOVE" | "REOPEN";
  submitterType: "PUBLIC_REPORTER" | "VERIFIED_ORG" | "PARTNER_ACCOUNT" | "ADMIN";
  submitterRef?: string | null;
  proposedPatch?: Record<string, unknown>;
  riskFlags?: string[];
}) {
  const now = new Date().toISOString();
  const row = {
    id: crypto.randomUUID(),
    resourceType: input.resourceType,
    subjectId: input.subjectId ?? null,
    operation: input.operation,
    status: "SUBMITTED" as const,
    submitterType: input.submitterType,
    submitterRef: input.submitterRef ?? null,
    proposedPatchJson: JSON.stringify(input.proposedPatch ?? {}),
    riskFlagsJson: JSON.stringify([...new Set(input.riskFlags ?? [])]),
    createdAt: now,
    updatedAt: now,
  };
  await getDb().insert(moderationSubmissions).values(row);
  return row;
}

export async function listModerationSubmissions(input: { status?: FoundationSubmissionStatus; resourceType?: FoundationResourceType; limit?: number } = {}) {
  const db = getDb();
  const filters = [];
  if (input.status) filters.push(eq(moderationSubmissions.status, input.status));
  if (input.resourceType) filters.push(eq(moderationSubmissions.resourceType, input.resourceType));
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 200);
  return db.select().from(moderationSubmissions).where(filters.length ? and(...filters) : undefined).orderBy(desc(moderationSubmissions.createdAt)).limit(limit);
}

export async function getModerationSubmission(id: string) {
  const db = getDb();
  return db.select().from(moderationSubmissions).where(eq(moderationSubmissions.id, id)).limit(1).then((rows) => rows[0] ?? null);
}

export async function transitionModerationSubmission(input: { id: string; toStatus: FoundationSubmissionStatus; actorRef: string; reasonCode?: string | null; requestId?: string | null }) {
  const current = await getModerationSubmission(input.id);
  if (!current) return null;
  if (!isFoundationSubmissionStatus(current.status) || !canTransitionModerationSubmission(current.status, input.toStatus)) throw new Error("Invalid moderation state transition");
  if (input.toStatus === "REJECTED" && !input.reasonCode) throw new Error("Rejection reason is required");
  if (input.actorRef.includes("@")) throw new Error("Audit actor reference must not contain plaintext email");
  const now = new Date().toISOString();
  await applyAtomicModerationTransition(getModerationDatabase(), {
    id: input.id,
    expectedStatus: current.status,
    toStatus: input.toStatus,
    actorRef: input.actorRef,
    reasonCode: input.reasonCode ?? null,
    requestId: input.requestId ?? null,
    eventId: crypto.randomUUID(),
    changedFieldsJson: safeAuditJson(["status"]),
    now,
  });
  return getModerationSubmission(input.id);
}
