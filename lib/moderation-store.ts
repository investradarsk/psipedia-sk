import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { moderationEvents, moderationSubmissions } from "@/db/foundation-schema";
import { safeAuditJson } from "@/lib/submission-security";

export const FOUNDATION_RESOURCE_TYPES = ["LOST_FOUND_CASE", "ADOPTION_DOG", "ORGANIZATION_CHANGE"] as const;
export type FoundationResourceType = (typeof FOUNDATION_RESOURCE_TYPES)[number];
export const FOUNDATION_SUBMISSION_STATUSES = ["SUBMITTED", "PENDING_REVIEW", "QUARANTINED", "APPROVED", "REJECTED", "WITHDRAWN"] as const;
export type FoundationSubmissionStatus = (typeof FOUNDATION_SUBMISSION_STATUSES)[number];

const ALLOWED_TRANSITIONS: Record<FoundationSubmissionStatus, readonly FoundationSubmissionStatus[]> = {
  SUBMITTED: ["PENDING_REVIEW", "WITHDRAWN"],
  PENDING_REVIEW: ["QUARANTINED", "APPROVED", "REJECTED", "WITHDRAWN"],
  QUARANTINED: ["PENDING_REVIEW", "REJECTED", "WITHDRAWN"],
  APPROVED: [],
  REJECTED: [],
  WITHDRAWN: [],
};

export function isFoundationResourceType(value: unknown): value is FoundationResourceType {
  return typeof value === "string" && FOUNDATION_RESOURCE_TYPES.includes(value as FoundationResourceType);
}

export function isFoundationSubmissionStatus(value: unknown): value is FoundationSubmissionStatus {
  return typeof value === "string" && FOUNDATION_SUBMISSION_STATUSES.includes(value as FoundationSubmissionStatus);
}

export function canTransitionModerationSubmission(from: FoundationSubmissionStatus, to: FoundationSubmissionStatus) {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export async function createModerationSubmission(input: {
  resourceType: FoundationResourceType;
  subjectId?: string | null;
  operation: "CREATE" | "UPDATE" | "REMOVE" | "REOPEN";
  submitterType: "PUBLIC_REPORTER" | "VERIFIED_ORG" | "ADMIN";
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
  const db = getDb();
  const current = await getModerationSubmission(input.id);
  if (!current) return null;
  if (!isFoundationSubmissionStatus(current.status) || !canTransitionModerationSubmission(current.status, input.toStatus)) throw new Error("Invalid moderation state transition");
  if (input.toStatus === "REJECTED" && !input.reasonCode) throw new Error("Rejection reason is required");
  if (input.actorRef.includes("@")) throw new Error("Audit actor reference must not contain plaintext email");
  const now = new Date().toISOString();
  await db.update(moderationSubmissions).set({ status: input.toStatus, reviewedAt: now, reviewedBy: input.actorRef, rejectionReasonCode: input.toStatus === "REJECTED" ? input.reasonCode : null, updatedAt: now }).where(eq(moderationSubmissions.id, input.id));
  await db.insert(moderationEvents).values({
    id: crypto.randomUUID(),
    submissionId: current.id,
    resourceType: current.resourceType,
    subjectId: current.subjectId,
    action: "STATUS_CHANGED",
    actorType: "ADMIN",
    actorRef: input.actorRef,
    fromStatus: current.status,
    toStatus: input.toStatus,
    reasonCode: input.reasonCode ?? null,
    changedFieldsJson: safeAuditJson(["status"]),
    requestId: input.requestId ?? null,
    createdAt: now,
  });
  return getModerationSubmission(input.id);
}
