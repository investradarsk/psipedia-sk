import {
  assertProfileReviewTransition,
  type ProfileReviewStatus,
} from "./profile-review-domain.ts";

export const profileReviewAdminActions = ["APPROVE", "REJECT", "HIDE", "RESTORE", "REMOVE"] as const;
export type ProfileReviewAdminAction = (typeof profileReviewAdminActions)[number];

export const profileReviewModerationReasonCodes = [
  "SPAM",
  "ABUSE",
  "PRIVACY",
  "OFF_TOPIC",
  "CONFLICT_OF_INTEREST",
  "MISLEADING",
  "DUPLICATE",
  "OTHER",
] as const;
export type ProfileReviewModerationReasonCode = (typeof profileReviewModerationReasonCodes)[number];

const ACTION_TARGET: Record<ProfileReviewAdminAction, ProfileReviewStatus> = {
  APPROVE: "VISIBLE",
  REJECT: "REJECTED",
  HIDE: "HIDDEN",
  RESTORE: "VISIBLE",
  REMOVE: "REMOVED",
};

const EVENT_ACTION: Record<ProfileReviewAdminAction, string> = {
  APPROVE: "PROFILE_REVIEW_APPROVED",
  REJECT: "PROFILE_REVIEW_REJECTED",
  HIDE: "PROFILE_REVIEW_HIDDEN",
  RESTORE: "PROFILE_REVIEW_RESTORED",
  REMOVE: "PROFILE_REVIEW_REMOVED",
};

export class ProfileReviewModerationConflictError extends Error {
  constructor() {
    super("Profile review moderation state changed concurrently");
    this.name = "ProfileReviewModerationConflictError";
  }
}

export function profileReviewActionTarget(action: ProfileReviewAdminAction) {
  return ACTION_TARGET[action];
}

export function profileReviewActionRequiresReason(action: ProfileReviewAdminAction) {
  return action === "REJECT" || action === "HIDE" || action === "REMOVE";
}

export function profileReviewEventAction(action: ProfileReviewAdminAction) {
  return EVENT_ACTION[action];
}

export function assertProfileReviewAdminAction(input: {
  action: ProfileReviewAdminAction;
  expectedStatus: ProfileReviewStatus;
  reasonCode?: string | null;
}) {
  const toStatus = profileReviewActionTarget(input.action);
  assertProfileReviewTransition(input.expectedStatus, toStatus);
  if (profileReviewActionRequiresReason(input.action) && !input.reasonCode) {
    throw new Error("Moderation reason is required");
  }
  return toStatus;
}

const PROFILE_REVIEW_EVENT_CAS_SQL = `
  INSERT INTO moderation_events (
    id, submission_id, resource_type, subject_id, action, actor_type, actor_ref,
    from_status, to_status, reason_code, changed_fields_json, request_id, created_at
  )
  SELECT ?1, NULL, 'PROFILE_REVIEW', id, ?2, 'ADMIN', ?3,
    status, ?4, ?5, ?6, ?7, ?8
  FROM profile_reviews
  WHERE id = ?9 AND status = ?10
`;

const PROFILE_REVIEW_STATE_CAS_SQL = `
  UPDATE profile_reviews
  SET
    status = ?1,
    updated_at = ?2,
    published_at = CASE
      WHEN ?1 = 'VISIBLE' AND published_at IS NULL THEN ?2
      ELSE published_at
    END,
    deleted_at = CASE
      WHEN ?1 = 'REMOVED' THEN COALESCE(deleted_at, ?2)
      ELSE deleted_at
    END
  WHERE id = ?3 AND status = ?4
  RETURNING id
`;

export async function applyAtomicProfileReviewModeration(
  database: Pick<D1Database, "prepare" | "batch">,
  input: {
    id: string;
    expectedStatus: ProfileReviewStatus;
    action: ProfileReviewAdminAction;
    actorRef: string;
    reasonCode?: string | null;
    requestId?: string | null;
    eventId: string;
    changedFieldsJson: string;
    now: string;
  },
) {
  const toStatus = assertProfileReviewAdminAction({
    action: input.action,
    expectedStatus: input.expectedStatus,
    reasonCode: input.reasonCode ?? null,
  });

  if (!input.actorRef || input.actorRef.includes("@")) {
    throw new Error("Audit actor reference must not contain plaintext email");
  }

  const eventStatement = database.prepare(PROFILE_REVIEW_EVENT_CAS_SQL).bind(
    input.eventId,
    profileReviewEventAction(input.action),
    input.actorRef,
    toStatus,
    input.reasonCode ?? null,
    input.changedFieldsJson,
    input.requestId ?? null,
    input.now,
    input.id,
    input.expectedStatus,
  );

  const stateStatement = database.prepare(PROFILE_REVIEW_STATE_CAS_SQL).bind(
    toStatus,
    input.now,
    input.id,
    input.expectedStatus,
  );

  // D1 batch is transactional. Both statements are guarded by the same old
  // state, so a stale action writes neither the audit event nor the review.
  const results = await database.batch([eventStatement, stateStatement]);
  const stateResult = results[1] as D1Result<{ id: string }> | undefined;
  if (stateResult?.results.length !== 1) throw new ProfileReviewModerationConflictError();

  return { status: toStatus };
}
