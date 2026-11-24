/**
 * Canonical Partner submission decisions reuse the existing lifecycle outbox.
 * No new D1 migration or parallel email queue.
 *
 * RETURN uses the existing SUBMITTED notification type (the outbox CHECK has
 * no RETURNED enum). A reserved dedupe_key prefix selects the correct text and
 * in-app link. Never infer status from the notification type alone.
 */
export type CanonicalNoticePhase = "SUBMITTED"|"APPROVED"|"REJECTED"|"RETURNED";
export type CanonicalNoticeType =
  "NEW_PROFILE_SUBMITTED"|"NEW_PROFILE_CREATED"|"NEW_PROFILE_REJECTED"|
  "EVENT_SUBMITTED"|"EVENT_CREATED"|"EVENT_REJECTED";

export const CANONICAL_RETURNED_PREFIX = "partner-canonical-returned/";

export function canonicalNoticeType(
  resourceType: string, phase: CanonicalNoticePhase,
): CanonicalNoticeType {
  const event=resourceType==="MANAGED_EVENT";
  if(phase==="APPROVED")return event?"EVENT_CREATED":"NEW_PROFILE_CREATED";
  if(phase==="REJECTED")return event?"EVENT_REJECTED":"NEW_PROFILE_REJECTED";
  // RETURNED uses the existing CHECK-compatible type, distinguished by key.
  return event?"EVENT_SUBMITTED":"NEW_PROFILE_SUBMITTED";
}

export function canonicalNoticeKey(
  phase: CanonicalNoticePhase, submissionId: string, transitionId: string,
) {
  // A draft may be returned and then submitted repeatedly. Each transition
  // gets its own key; a failed/superseded transaction leaves no outbox row.
  return phase==="APPROVED" ? "partner-canonical-approved/"+submissionId
    :phase==="REJECTED" ? "partner-canonical-rejected/"+submissionId
    :phase==="RETURNED" ? CANONICAL_RETURNED_PREFIX+submissionId+"/"+transitionId
    :"partner-canonical-submitted/"+submissionId+"/"+transitionId;
}

export function isCanonicalReturnedNotice(type: string, dedupeKey: string) {
  return (type==="NEW_PROFILE_SUBMITTED"||type==="EVENT_SUBMITTED") &&
    /^partner-canonical-returned\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/i.test(dedupeKey);
}

export function canonicalNoticeStatement(
  db: Pick<D1Database,"prepare">,
  input: {
    submissionId: string; accountId: string; resourceType: string;
    phase: CanonicalNoticePhase; transitionId: string; nowIso: string;
  },
) {
  const type=canonicalNoticeType(input.resourceType,input.phase);
  const key=canonicalNoticeKey(input.phase,input.submissionId,input.transitionId);
  const expiry=new Date(Date.parse(input.nowIso)+30*86400000).toISOString();
  return db.prepare(
    "INSERT OR IGNORE INTO partner_notification_outbox "+
    "(id,partner_account_id,notification_type,dedupe_key,status,expires_at,attempts,created_at,updated_at) "+
    "VALUES(?1,?2,?3,?4,'PENDING',?5,0,?6,?6)"
  ).bind(crypto.randomUUID(),input.accountId,type,key,expiry,input.nowIso);
}
