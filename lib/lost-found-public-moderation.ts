import { env } from "cloudflare:workers";
import {
  createModerationSubmission,
  getModerationSubmission,
  transitionModerationSubmission,
  type FoundationSubmissionStatus,
} from "@/lib/moderation-store";
import type { LostFoundStatus } from "@/lib/lost-found-dogs";
import type { NormalizedPublicLostFoundSubmission } from "@/lib/lost-found-public-submission";

type Bindings = { DB?: D1Database };
type ModerationLink = { id: string; status: FoundationSubmissionStatus };

function database() {
  const value = (env as unknown as Bindings).DB;
  if (!value?.prepare) throw new Error("LOST/FOUND moderation database is unavailable");
  return value;
}

async function linkedModeration(reportId: number): Promise<ModerationLink | null> {
  const row = await database().prepare(
    "SELECT id,status FROM moderation_submissions " +
    "WHERE resource_type='LOST_FOUND_CASE' AND subject_id=?1 AND operation='CREATE' " +
    "AND submitter_type='PUBLIC_REPORTER' ORDER BY created_at DESC LIMIT 1",
  ).bind(String(reportId)).first<{ id: string; status: FoundationSubmissionStatus }>();
  return row ? { id: row.id, status: row.status } : null;
}

async function move(
  link: ModerationLink,
  status: FoundationSubmissionStatus,
  actorType: "ADMIN" | "SYSTEM",
  actorRef: string,
  requestId: string | null,
  reasonCode?: string,
) {
  if (link.status === status) return link;
  const updated = await transitionModerationSubmission({
    id: link.id,
    toStatus: status,
    actorType,
    actorRef,
    reasonCode: reasonCode ?? null,
    requestId,
  });
  if (!updated) throw new Error("LOST/FOUND moderation submission disappeared");
  return { id: updated.id, status: updated.status as FoundationSubmissionStatus };
}

export async function ensurePendingLostFoundModeration(input: {
  reportId: number;
  submission: NormalizedPublicLostFoundSubmission;
  hasImage: boolean;
  requestId: string | null;
}) {
  let link = await linkedModeration(input.reportId);
  if (!link) {
    const created = await createModerationSubmission({
      resourceType: "LOST_FOUND_CASE",
      subjectId: String(input.reportId),
      operation: "CREATE",
      submitterType: "PUBLIC_REPORTER",
      submitterRef: null,
      proposedPatch: {
        reportId: input.reportId,
        type: input.submission.type,
        eventDate: input.submission.eventDate,
        region: input.submission.region,
        city: input.submission.city,
        hasImage: input.hasImage,
      },
      riskFlags: input.submission.riskFlags,
    });
    link = { id: created.id, status: created.status };
  }
  if (link.status === "SUBMITTED") {
    link = await move(link, "PENDING_REVIEW", "SYSTEM", "lost-found-public-intake", input.requestId);
  }
  if (link.status !== "PENDING_REVIEW" && link.status !== "QUARANTINED") {
    throw new Error("LOST/FOUND moderation is already terminal");
  }
  return link;
}

export async function syncLostFoundModerationBeforeAdminStatus(input: {
  reportId: number;
  nextStatus: LostFoundStatus;
  actorRef: string;
  requestId: string | null;
}) {
  let link = await linkedModeration(input.reportId);
  if (!link) return null;

  if (input.nextStatus === "PENDING") {
    if (link.status === "SUBMITTED") {
      link = await move(link, "PENDING_REVIEW", "ADMIN", input.actorRef, input.requestId);
    } else if (link.status === "QUARANTINED") {
      link = await move(link, "PENDING_REVIEW", "ADMIN", input.actorRef, input.requestId);
    }
    return link;
  }

  if (input.nextStatus === "DRAFT") {
    if (link.status === "SUBMITTED") {
      link = await move(link, "PENDING_REVIEW", "ADMIN", input.actorRef, input.requestId);
    }
    if (link.status === "PENDING_REVIEW") {
      link = await move(link, "QUARANTINED", "ADMIN", input.actorRef, input.requestId);
    }
    return link;
  }

  if (input.nextStatus === "ACTIVE") {
    if (link.status === "SUBMITTED" || link.status === "QUARANTINED") {
      link = await move(link, "PENDING_REVIEW", "ADMIN", input.actorRef, input.requestId);
    }
    if (link.status === "PENDING_REVIEW") {
      link = await move(link, "APPROVED", "ADMIN", input.actorRef, input.requestId);
    }
    if (link.status !== "APPROVED") throw new Error("LOST/FOUND moderation is not approvable");
    return link;
  }

  if (input.nextStatus === "REJECTED") {
    if (link.status === "SUBMITTED") {
      link = await move(link, "PENDING_REVIEW", "ADMIN", input.actorRef, input.requestId);
    }
    if (link.status === "PENDING_REVIEW" || link.status === "QUARANTINED") {
      link = await move(link, "REJECTED", "ADMIN", input.actorRef, input.requestId, "lost_found_rejected");
    }
    return link;
  }

  if (input.nextStatus === "ARCHIVED") {
    if (link.status === "SUBMITTED" || link.status === "PENDING_REVIEW" || link.status === "QUARANTINED") {
      link = await move(link, "WITHDRAWN", "ADMIN", input.actorRef, input.requestId);
    }
    return link;
  }

  return getModerationSubmission(link.id);
}
