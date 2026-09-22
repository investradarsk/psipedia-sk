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

export function isFoundationSubmissionStatus(value: unknown): value is FoundationSubmissionStatus {
  return typeof value === "string" && FOUNDATION_SUBMISSION_STATUSES.includes(value as FoundationSubmissionStatus);
}

export function canTransitionModerationSubmission(from: FoundationSubmissionStatus, to: FoundationSubmissionStatus) {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export class ModerationStateConflictError extends Error {
  constructor() {
    super("Moderation state changed concurrently");
    this.name = "ModerationStateConflictError";
  }
}

const MODERATION_EVENT_CAS_SQL = `
  INSERT INTO moderation_events (
    id, submission_id, resource_type, subject_id, action, actor_type, actor_ref,
    from_status, to_status, reason_code, changed_fields_json, request_id, created_at
  )
  SELECT ?, id, resource_type, subject_id, 'STATUS_CHANGED', ?, ?,
    status, ?, ?, ?, ?, ?
  FROM moderation_submissions
  WHERE id = ? AND status = ?
`;

const MODERATION_STATE_CAS_SQL = `
  UPDATE moderation_submissions
  SET status = ?, reviewed_at = ?, reviewed_by = ?, rejection_reason_code = ?, updated_at = ?
  WHERE id = ? AND status = ?
  RETURNING id
`;

export async function applyAtomicModerationTransition(database: Pick<D1Database, "prepare" | "batch">, input: {
  id: string;
  expectedStatus: FoundationSubmissionStatus;
  toStatus: FoundationSubmissionStatus;
  actorType?: "ADMIN" | "PARTNER" | "SYSTEM";
  actorRef: string;
  reasonCode?: string | null;
  requestId?: string | null;
  eventId: string;
  changedFieldsJson: string;
  now: string;
  extraStatements?: D1PreparedStatement[];
}) {
  if (!canTransitionModerationSubmission(input.expectedStatus, input.toStatus)) {
    throw new Error("Invalid moderation state transition");
  }

  // D1 batch is a transaction. The event is conditional on the same old state as the CAS update,
  // so a stale transition writes neither the event nor the state change.
  const eventStatement = database.prepare(MODERATION_EVENT_CAS_SQL).bind(
    input.eventId,
    input.actorType ?? "ADMIN",
    input.actorRef,
    input.toStatus,
    input.reasonCode ?? null,
    input.changedFieldsJson,
    input.requestId ?? null,
    input.now,
    input.id,
    input.expectedStatus,
  );
  const stateStatement = database.prepare(MODERATION_STATE_CAS_SQL).bind(
    input.toStatus,
    input.now,
    input.actorRef,
    input.toStatus === "REJECTED" ? input.reasonCode ?? null : null,
    input.now,
    input.id,
    input.expectedStatus,
  );

  const results = await database.batch([eventStatement, stateStatement, ...(input.extraStatements ?? [])]);
  const stateResult = results[1] as D1Result<{ id: string }> | undefined;
  if (stateResult?.results.length !== 1) throw new ModerationStateConflictError();
}
