import { env } from "cloudflare:workers";
import { ADOPTION_NOINDEX_STALE_DAYS, ADOPTION_STALE_DAYS } from "./adoption.ts";
import {
  adminAttentionQueueSourceTypes,
  isAdminAttentionQueueSourceType,
  mapAdoptionStaleAttention,
  mapArticleFeedbackAttention,
  mapDirectoryChangeRequestAttention,
  mapDirectoryInquiryAttention,
  mapGeoLocationAttention,
  mapModerationAttention,
  mapNewsTipAttention,
  mapPartnerClaimAttention,
  mapPartnerCommercialAgreementAttention,
  mapPartnerCommercialAttention,
  mapPartnerEventAttention,
  mapPartnerNewProfileAttention,
  mapPartnerProfileChangeAttention,
  mapPartnerVerificationAttention,
  mapProfileReviewAttention,
  type AdoptionStaleAttentionRow,
  type AdminAttentionFilters,
  type AdminAttentionItem,
  type AdminAttentionPriority,
  type AdminAttentionQueueSourceType,
  type AdminAttentionState,
  type ArticleFeedbackAttentionRow,
  type DirectoryChangeRequestAttentionRow,
  type DirectoryInquiryAttentionRow,
  type GeoLocationAttentionRow,
  type ModerationAttentionRow,
  type NewsTipAttentionRow,
  type PartnerClaimAttentionRow,
  type PartnerCommercialAgreementAttentionRow,
  type PartnerCommercialAttentionRow,
  type PartnerEventAttentionRow,
  type PartnerNewProfileAttentionRow,
  type PartnerProfileChangeAttentionRow,
  type PartnerVerificationAttentionRow,
  type ProfileReviewAttentionRow,
} from "./admin-attention-queue.ts";

export type AdminAttentionD1Database = Pick<D1Database, "prepare">;
type RuntimeBindings = { DB?: D1Database };

export const ADMIN_ATTENTION_PAGE_SIZE = 24;
export const ADMIN_ATTENTION_MAX_PAGE_SIZE = 50;
export const ADMIN_ATTENTION_SOURCE_QUERY_COUNT = 15;
export const ADMIN_ATTENTION_REQUEST_QUERY_MAX = ADMIN_ATTENTION_SOURCE_QUERY_COUNT * 2;

export const adminAttentionAvailabilityStates = ["OK", "EMPTY", "PARTIAL", "UNAVAILABLE"] as const;
export type AdminAttentionAvailability = (typeof adminAttentionAvailabilityStates)[number];

export type AdminAttentionSourceAvailability = {
  sourceType: AdminAttentionQueueSourceType;
  state: "OK" | "EMPTY" | "UNAVAILABLE";
  activeCount: number | null;
  errorCode?: "ATTENTION_SOURCE_UNAVAILABLE";
};

export type AdminAttentionExactSummary = {
  active: number;
  bySource: Record<AdminAttentionQueueSourceType, number | null>;
  availability: "OK" | "PARTIAL" | "UNAVAILABLE";
  unavailableSources: AdminAttentionQueueSourceType[];
};

export type AdminAttentionPageSummary = {
  total: number;
  active: number;
  history: number;
  byState: Record<AdminAttentionState, number>;
  byPriority: Record<AdminAttentionPriority, number>;
  bySource: Record<AdminAttentionQueueSourceType, number | null>;
};

export type AdminAttentionPage = {
  items: AdminAttentionItem[];
  summary: AdminAttentionPageSummary;
  resultCount: number;
  availability: AdminAttentionAvailability;
  sourceAvailability: AdminAttentionSourceAvailability[];
  pagination: {
    pageSize: number;
    nextCursor: string | null;
    invalidCursor: boolean;
  };
};

type AttentionGenericRow = {
  sourceType: AdminAttentionQueueSourceType;
  sourceId: string;
  activeRank: number;
  attentionState: AdminAttentionState;
  priority: AdminAttentionPriority;
  priorityRank: number;
  relevantAt: string;
  payload: string;
};

type AttentionSourceProbeRow = {
  total: number;
  activeCount: number;
  historyCount: number;
  newCount: number;
  inProgressCount: number;
  resolvedCount: number;
  dismissedCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  activeHighCount: number;
  activeMediumCount: number;
  activeLowCount: number;
  historyHighCount: number;
  historyMediumCount: number;
  historyLowCount: number;
};

type AttentionSourceSnapshot = AdminAttentionSourceAvailability & {
  total: number;
  historyCount: number;
  byState: Record<AdminAttentionState, number>;
  byPriority: Record<AdminAttentionPriority, number>;
  activeByPriority: Record<AdminAttentionPriority, number>;
  historyByPriority: Record<AdminAttentionPriority, number>;
};

type CursorPayload = {
  v: 1;
  fingerprint: string;
  activeRank: 0 | 1;
  priorityRank: 0 | 1 | 2;
  relevantAt: string;
  sourceType: AdminAttentionQueueSourceType;
  sourceId: string;
};

const RISK_FLAG_SQL = `json_array_length(CASE WHEN json_valid(COALESCE(s.risk_flags_json, '[]')) THEN COALESCE(s.risk_flags_json, '[]') ELSE '[]' END)`;
const PROFILE_RISK_FLAG_SQL = `json_array_length(CASE WHEN json_valid(COALESCE(review.risk_flags_json, '[]')) THEN COALESCE(review.risk_flags_json, '[]') ELSE '[]' END)`;

const ATTENTION_SOURCE_SELECTS: Record<AdminAttentionQueueSourceType, string> = {
  MODERATION_SUBMISSION: `
    SELECT 'MODERATION_SUBMISSION' AS sourceType, CAST(s.id AS TEXT) AS sourceId,
      CASE WHEN s.status IN ('SUBMITTED','PENDING_REVIEW','QUARANTINED') THEN 0 ELSE 1 END AS activeRank,
      CASE WHEN s.status='SUBMITTED' THEN 'NEW'
        WHEN s.status IN ('PENDING_REVIEW','QUARANTINED') THEN 'IN_PROGRESS'
        WHEN s.status='APPROVED' THEN 'RESOLVED' ELSE 'DISMISSED' END AS attentionState,
      CASE WHEN s.status='QUARANTINED' OR ${RISK_FLAG_SQL}>0 THEN 'HIGH' ELSE 'MEDIUM' END AS priority,
      CASE WHEN s.status='QUARANTINED' OR ${RISK_FLAG_SQL}>0 THEN 0 ELSE 1 END AS priorityRank,
      CASE WHEN s.status IN ('SUBMITTED','PENDING_REVIEW','QUARANTINED') THEN s.created_at ELSE s.updated_at END AS relevantAt,
      json_object('id',s.id,'resourceType',s.resource_type,'operation',s.operation,'status',s.status,
        'riskFlagsJson',COALESCE(s.risk_flags_json,'[]'),'createdAt',s.created_at,'updatedAt',s.updated_at) AS payload
    FROM moderation_submissions s
    WHERE s.resource_type IN ('LOST_FOUND_CASE','ADOPTION_DOG')
  `,
  PROFILE_REVIEW_MODERATION: `
    SELECT 'PROFILE_REVIEW_MODERATION' AS sourceType, CAST(review.id AS TEXT) AS sourceId,
      CASE WHEN review.status='PENDING_REVIEW' THEN 0 ELSE 1 END AS activeRank,
      CASE WHEN review.status='PENDING_REVIEW' THEN 'NEW'
        WHEN review.status IN ('VISIBLE','HIDDEN') THEN 'RESOLVED' ELSE 'DISMISSED' END AS attentionState,
      CASE WHEN review.status='PENDING_REVIEW' AND ${PROFILE_RISK_FLAG_SQL}>0 THEN 'HIGH' ELSE 'MEDIUM' END AS priority,
      CASE WHEN review.status='PENDING_REVIEW' AND ${PROFILE_RISK_FLAG_SQL}>0 THEN 0 ELSE 1 END AS priorityRank,
      CASE WHEN review.status='PENDING_REVIEW' THEN review.created_at ELSE review.updated_at END AS relevantAt,
      json_object('id',review.id,'status',review.status,'riskFlagsJson',COALESCE(review.risk_flags_json,'[]'),
        'createdAt',review.created_at,'updatedAt',review.updated_at,'targetType',resource.entity_type,
        'targetName',COALESCE(directory.name,organization.name,'Profil'),'targetCategory',directory.category) AS payload
    FROM profile_reviews review
    JOIN partner_resources resource ON resource.id=review.resource_id
    LEFT JOIN directory_profiles directory ON directory.id=resource.directory_profile_id
    LEFT JOIN help_organizations organization ON organization.id=resource.help_organization_id
  `,
  NEWS_TIP: `
    SELECT 'NEWS_TIP' AS sourceType, CAST(id AS TEXT) AS sourceId,
      CASE WHEN status IN ('new','reviewing') THEN 0 ELSE 1 END AS activeRank,
      CASE WHEN status='new' THEN 'NEW' WHEN status='reviewing' THEN 'IN_PROGRESS'
        WHEN status='used' THEN 'RESOLVED' ELSE 'DISMISSED' END AS attentionState,
      'MEDIUM' AS priority, 1 AS priorityRank,
      CASE WHEN status IN ('new','reviewing') THEN created_at ELSE COALESCE(updated_at,created_at) END AS relevantAt,
      json_object('id',id,'title',title,'topic',topic,'status',status,'createdAt',created_at,'updatedAt',updated_at) AS payload
    FROM news_tips
  `,
  DIRECTORY_CHANGE_REQUEST: `
    SELECT 'DIRECTORY_CHANGE_REQUEST' AS sourceType, CAST(id AS TEXT) AS sourceId,
      CASE WHEN status='new' THEN 0 ELSE 1 END AS activeRank,
      CASE WHEN status='new' THEN 'NEW' WHEN status='approved' THEN 'RESOLVED' ELSE 'DISMISSED' END AS attentionState,
      'MEDIUM' AS priority, 1 AS priorityRank,
      CASE WHEN status='new' THEN created_at ELSE COALESCE(updated_at,created_at) END AS relevantAt,
      json_object('id',id,'profileName',profile_name,'profileCategory',profile_category,'status',status,
        'createdAt',created_at,'updatedAt',updated_at) AS payload
    FROM directory_profile_change_requests
  `,
  DIRECTORY_INQUIRY: `
    SELECT 'DIRECTORY_INQUIRY' AS sourceType, CAST(id AS TEXT) AS sourceId,
      CASE WHEN status IN ('new','read') THEN 0 ELSE 1 END AS activeRank,
      CASE WHEN status='new' THEN 'NEW' WHEN status='read' THEN 'IN_PROGRESS' ELSE 'RESOLVED' END AS attentionState,
      CASE WHEN status='new' AND created_at <= (SELECT staleInquiryAt FROM params) THEN 'HIGH' ELSE 'MEDIUM' END AS priority,
      CASE WHEN status='new' AND created_at <= (SELECT staleInquiryAt FROM params) THEN 0 ELSE 1 END AS priorityRank,
      CASE WHEN status IN ('new','read') THEN created_at ELSE COALESCE(updated_at,created_at) END AS relevantAt,
      json_object('id',id,'profileName',profile_name,'profileCategory',profile_category,'status',status,
        'createdAt',created_at,'updatedAt',updated_at) AS payload
    FROM directory_inquiries
  `,
  ARTICLE_FEEDBACK: `
    SELECT 'ARTICLE_FEEDBACK' AS sourceType, CAST(id AS TEXT) AS sourceId,
      CASE WHEN status IN ('new','reviewing') THEN 0 ELSE 1 END AS activeRank,
      CASE WHEN status='new' THEN 'NEW' WHEN status='reviewing' THEN 'IN_PROGRESS'
        WHEN status='resolved' THEN 'RESOLVED' ELSE 'DISMISSED' END AS attentionState,
      'MEDIUM' AS priority, 1 AS priorityRank,
      CASE WHEN status IN ('new','reviewing') THEN created_at ELSE COALESCE(attention_updated_at,created_at) END AS relevantAt,
      json_object('id',id,'articleTitle',article_title,'articlePath',article_path,'status',status,
        'createdAt',created_at,'updatedAt',attention_updated_at) AS payload
    FROM article_feedback
    WHERE helpful=0
  `,
  ADOPTION_STALE: `
    SELECT 'ADOPTION_STALE' AS sourceType, CAST(id AS TEXT) AS sourceId,
      0 AS activeRank, 'IN_PROGRESS' AS attentionState,
      CASE WHEN last_verified_at IS NULL OR last_verified_at < (SELECT adoptionHighAt FROM params) THEN 'HIGH' ELSE 'MEDIUM' END AS priority,
      CASE WHEN last_verified_at IS NULL OR last_verified_at < (SELECT adoptionHighAt FROM params) THEN 0 ELSE 1 END AS priorityRank,
      COALESCE(last_verified_at,created_at) AS relevantAt,
      json_object('id',id,'name',name,'status',status,'lastVerifiedAt',last_verified_at,'createdAt',created_at) AS payload
    FROM adoption_dogs
    WHERE status IN ('ACTIVE','RESERVED')
      AND (last_verified_at IS NULL OR last_verified_at < (SELECT staleAdoptionAt FROM params))
  `,
  PARTNER_CLAIM_REVIEW: `
    SELECT 'PARTNER_CLAIM_REVIEW' AS sourceType, CAST(x.id AS TEXT) AS sourceId,
      CASE WHEN x.status='PENDING' THEN 0 ELSE 1 END AS activeRank,
      CASE WHEN x.status='PENDING' THEN 'NEW' WHEN x.status='CANCELLED' THEN 'DISMISSED' ELSE 'RESOLVED' END AS attentionState,
      CASE WHEN x.status='PENDING' AND x.conflict=1 THEN 'HIGH' ELSE 'MEDIUM' END AS priority,
      CASE WHEN x.status='PENDING' AND x.conflict=1 THEN 0 ELSE 1 END AS priorityRank,
      CASE WHEN x.status='PENDING' THEN x.createdAt ELSE x.updatedAt END AS relevantAt,
      json_object('id',x.id,'status',x.status,'resourceName',x.resourceName,'createdAt',x.createdAt,
        'updatedAt',x.updatedAt,'conflict',x.conflict) AS payload
    FROM (
      SELECT c.id,c.status,c.created_at AS createdAt,c.updated_at AS updatedAt,
        COALESCE(d.name,o.name,'Profil') AS resourceName,
        CASE WHEN EXISTS(
          SELECT 1 FROM partner_memberships om
          JOIN partner_accounts oa ON oa.id=om.account_id AND oa.status='ACTIVE'
          WHERE om.resource_id=c.resource_id AND om.revoked_at IS NULL AND om.role='OWNER' AND om.account_id<>c.account_id
        ) OR EXISTS(
          SELECT 1 FROM partner_claims oc
          WHERE oc.resource_id=c.resource_id AND oc.status='PENDING' AND oc.account_id<>c.account_id
        ) THEN 1 ELSE 0 END AS conflict
      FROM partner_claims c
      JOIN partner_resources r ON r.id=c.resource_id
      LEFT JOIN directory_profiles d ON d.id=r.directory_profile_id
      LEFT JOIN help_organizations o ON o.id=r.help_organization_id
    ) x
  `,
  PARTNER_PROFILE_CHANGE_REVIEW: `
    SELECT 'PARTNER_PROFILE_CHANGE_REVIEW' AS sourceType, CAST(x.id AS TEXT) AS sourceId,
      CASE WHEN x.status IN ('SUBMITTED','PENDING_REVIEW','QUARANTINED') THEN 0 ELSE 1 END AS activeRank,
      CASE WHEN x.status='SUBMITTED' THEN 'NEW' WHEN x.status IN ('PENDING_REVIEW','QUARANTINED') THEN 'IN_PROGRESS'
        WHEN x.status='APPROVED' THEN 'RESOLVED' ELSE 'DISMISSED' END AS attentionState,
      CASE WHEN x.stale=1 THEN 'HIGH' ELSE 'MEDIUM' END AS priority,
      CASE WHEN x.stale=1 THEN 0 ELSE 1 END AS priorityRank,
      CASE WHEN x.status IN ('SUBMITTED','PENDING_REVIEW','QUARANTINED') THEN x.createdAt ELSE x.updatedAt END AS relevantAt,
      json_object('id',x.id,'status',x.status,'resourceName',x.resourceName,'resourceType',x.resourceType,
        'changedFieldCount',x.changedFieldCount,'riskFlagsJson',x.riskFlagsJson,'stale',x.stale,
        'createdAt',x.createdAt,'updatedAt',x.updatedAt) AS payload
    FROM (
      SELECT s.id,s.status,s.resource_type AS resourceType,COALESCE(s.risk_flags_json,'[]') AS riskFlagsJson,
        s.created_at AS createdAt,s.updated_at AS updatedAt,COALESCE(d.name,o.name,'Profil') AS resourceName,
        m.changed_field_count AS changedFieldCount,
        CASE WHEN COALESCE(d.updated_at,o.updated_at)<>m.base_updated_at THEN 1 ELSE 0 END AS stale
      FROM moderation_submissions s
      JOIN partner_profile_change_metadata m ON m.submission_id=s.id
      JOIN partner_resources r ON r.id=m.partner_resource_id
      LEFT JOIN directory_profiles d ON d.id=r.directory_profile_id
      LEFT JOIN help_organizations o ON o.id=r.help_organization_id
      WHERE s.resource_type IN ('DIRECTORY_PROFILE','HELP_ORGANIZATION') AND s.submitter_type='PARTNER_ACCOUNT'
    ) x
  `,
  PARTNER_NEW_PROFILE_REVIEW: `
    SELECT 'PARTNER_NEW_PROFILE_REVIEW' AS sourceType, CAST(s.id AS TEXT) AS sourceId,
      CASE WHEN s.status IN ('SUBMITTED','PENDING_REVIEW','QUARANTINED') THEN 0 ELSE 1 END AS activeRank,
      CASE WHEN s.status='SUBMITTED' THEN 'NEW' WHEN s.status IN ('PENDING_REVIEW','QUARANTINED') THEN 'IN_PROGRESS'
        WHEN s.status='APPROVED' THEN 'RESOLVED' ELSE 'DISMISSED' END AS attentionState,
      CASE WHEN m.duplicate_confidence='HIGH' THEN 'HIGH' ELSE 'MEDIUM' END AS priority,
      CASE WHEN m.duplicate_confidence='HIGH' THEN 0 ELSE 1 END AS priorityRank,
      CASE WHEN s.status IN ('SUBMITTED','PENDING_REVIEW','QUARANTINED') THEN s.created_at ELSE s.updated_at END AS relevantAt,
      json_object('id',s.id,'status',s.status,'displayName',m.display_name,'resourceType',m.intended_resource_type,
        'categoryOrType',m.category_or_type,'duplicateConfidence',m.duplicate_confidence,
        'createdAt',s.created_at,'updatedAt',s.updated_at) AS payload
    FROM partner_new_profile_metadata m
    JOIN moderation_submissions s ON s.id=m.submission_id
  `,
  PARTNER_EVENT_REVIEW: `
    SELECT 'PARTNER_EVENT_REVIEW' AS sourceType, CAST(x.id AS TEXT) AS sourceId,
      CASE WHEN x.status IN ('SUBMITTED','PENDING_REVIEW','QUARANTINED') THEN 0 ELSE 1 END AS activeRank,
      CASE WHEN x.status='SUBMITTED' THEN 'NEW' WHEN x.status IN ('PENDING_REVIEW','QUARANTINED') THEN 'IN_PROGRESS'
        WHEN x.status='APPROVED' THEN 'RESOLVED' ELSE 'DISMISSED' END AS attentionState,
      CASE WHEN x.duplicateConfidence='HIGH' OR x.stale=1 OR x.status='QUARANTINED' THEN 'HIGH' ELSE 'MEDIUM' END AS priority,
      CASE WHEN x.duplicateConfidence='HIGH' OR x.stale=1 OR x.status='QUARANTINED' THEN 0 ELSE 1 END AS priorityRank,
      CASE WHEN x.status IN ('SUBMITTED','PENDING_REVIEW','QUARANTINED') THEN x.createdAt ELSE x.updatedAt END AS relevantAt,
      json_object('id',x.id,'status',x.status,'operation',x.operation,'title',x.title,
        'changedFieldCount',x.changedFieldCount,'duplicateConfidence',x.duplicateConfidence,
        'riskFlagsJson',x.riskFlagsJson,'stale',x.stale,'createdAt',x.createdAt,'updatedAt',x.updatedAt) AS payload
    FROM (
      SELECT s.id,s.status,s.operation,COALESCE(s.risk_flags_json,'[]') AS riskFlagsJson,
        COALESCE(e.title,m.display_title,'Podujatie') AS title,m.changed_field_count AS changedFieldCount,
        m.duplicate_confidence AS duplicateConfidence,
        CASE WHEN m.base_updated_at IS NOT NULL AND e.updated_at<>m.base_updated_at THEN 1 ELSE 0 END AS stale,
        s.created_at AS createdAt,s.updated_at AS updatedAt
      FROM partner_event_submission_metadata m
      JOIN moderation_submissions s ON s.id=m.submission_id
      LEFT JOIN partner_resources r ON r.id=m.partner_resource_id
      LEFT JOIN managed_events e ON e.id=r.managed_event_id
      WHERE s.resource_type='MANAGED_EVENT' AND s.submitter_type='PARTNER_ACCOUNT'
    ) x
  `,
  PARTNER_VERIFICATION_REVIEW: `
    SELECT 'PARTNER_VERIFICATION_REVIEW' AS sourceType, CAST(x.id AS TEXT) AS sourceId,
      CASE WHEN x.status='PENDING_VERIFICATION' THEN 0 ELSE 1 END AS activeRank,
      CASE WHEN x.status='PENDING_VERIFICATION' THEN 'NEW' WHEN x.status='REJECTED' THEN 'DISMISSED' ELSE 'RESOLVED' END AS attentionState,
      CASE WHEN x.status='PENDING_VERIFICATION' AND x.conflict=1 THEN 'HIGH' ELSE 'MEDIUM' END AS priority,
      CASE WHEN x.status='PENDING_VERIFICATION' AND x.conflict=1 THEN 0 ELSE 1 END AS priorityRank,
      CASE WHEN x.status='PENDING_VERIFICATION' THEN COALESCE(x.submittedAt,x.createdAt) ELSE x.updatedAt END AS relevantAt,
      json_object('id',x.id,'status',x.status,'resourceName',x.resourceName,'createdAt',x.createdAt,
        'updatedAt',x.updatedAt,'submittedAt',x.submittedAt,'conflict',x.conflict) AS payload
    FROM (
      SELECT v.id,v.status,v.created_at AS createdAt,v.updated_at AS updatedAt,v.submitted_at AS submittedAt,
        COALESCE(d.name,o.name,'Profil') AS resourceName,
        CASE WHEN EXISTS(
          SELECT 1 FROM partner_memberships om
          JOIN partner_accounts oa ON oa.id=om.account_id AND oa.status='ACTIVE'
          WHERE om.resource_id=v.resource_id AND om.revoked_at IS NULL AND om.role='OWNER' AND om.account_id<>v.account_id
        ) OR EXISTS(
          SELECT 1 FROM partner_claims pc
          WHERE pc.resource_id=v.resource_id AND pc.status='PENDING' AND pc.account_id<>v.account_id
        ) THEN 1 ELSE 0 END AS conflict
      FROM partner_resource_verifications v
      JOIN partner_resources r ON r.id=v.resource_id
      LEFT JOIN directory_profiles d ON d.id=r.directory_profile_id
      LEFT JOIN help_organizations o ON o.id=r.help_organization_id
    ) x
  `,
  PARTNER_COMMERCIAL_LEAD: `
    SELECT 'PARTNER_COMMERCIAL_LEAD' AS sourceType, CAST(c.id AS TEXT) AS sourceId,
      CASE WHEN c.status='NEW' THEN 0 ELSE 1 END AS activeRank,
      CASE WHEN c.status='NEW' THEN 'NEW' WHEN c.status='NOT_NOW' THEN 'DISMISSED' ELSE 'RESOLVED' END AS attentionState,
      'LOW' AS priority, 2 AS priorityRank,
      CASE WHEN c.status='NEW' THEN c.created_at ELSE c.updated_at END AS relevantAt,
      json_object('id',c.id,'interestType',c.interest_type,'status',c.status,
        'resourceName',COALESCE(d.name,o.name,e.title),'createdAt',c.created_at,'updatedAt',c.updated_at) AS payload
    FROM partner_commercial_interests c
    LEFT JOIN partner_resources r ON r.id=c.resource_id
    LEFT JOIN directory_profiles d ON d.id=r.directory_profile_id
    LEFT JOIN help_organizations o ON o.id=r.help_organization_id
    LEFT JOIN managed_events e ON e.id=r.managed_event_id
  `,
  PARTNER_COMMERCIAL_AGREEMENT: `
    SELECT 'PARTNER_COMMERCIAL_AGREEMENT' AS sourceType, CAST(a.id AS TEXT) AS sourceId,
      CASE WHEN a.status='OFFERED'
        OR (a.status='AGREED' AND a.payment_status IN ('PAID','WAIVED'))
        OR (a.status='ACTIVE' AND a.end_at>(SELECT nowIso FROM params) AND a.end_at<=(SELECT expiringAt FROM params))
        THEN 0 ELSE 1 END AS activeRank,
      CASE WHEN a.status='OFFERED' OR (a.status='AGREED' AND a.payment_status IN ('PAID','WAIVED')) THEN 'NEW'
        WHEN a.status='ACTIVE' AND a.end_at>(SELECT nowIso FROM params) AND a.end_at<=(SELECT expiringAt FROM params) THEN 'IN_PROGRESS'
        ELSE 'RESOLVED' END AS attentionState,
      CASE WHEN a.status='AGREED' AND a.payment_status IN ('PAID','WAIVED') THEN 'HIGH'
        WHEN a.status='ACTIVE' AND a.end_at>(SELECT nowIso FROM params) AND a.end_at<=(SELECT expiringAt FROM params) THEN 'MEDIUM'
        ELSE 'LOW' END AS priority,
      CASE WHEN a.status='AGREED' AND a.payment_status IN ('PAID','WAIVED') THEN 0
        WHEN a.status='ACTIVE' AND a.end_at>(SELECT nowIso FROM params) AND a.end_at<=(SELECT expiringAt FROM params) THEN 1 ELSE 2 END AS priorityRank,
      CASE WHEN a.status='OFFERED'
        OR (a.status='AGREED' AND a.payment_status IN ('PAID','WAIVED'))
        OR (a.status='ACTIVE' AND a.end_at>(SELECT nowIso FROM params) AND a.end_at<=(SELECT expiringAt FROM params))
        THEN a.created_at ELSE a.updated_at END AS relevantAt,
      json_object('id',a.id,'agreementType',a.agreement_type,'status',a.status,'paymentStatus',a.payment_status,
        'endAt',a.end_at,'resourceName',COALESCE(d.name,o.name,e.title),'createdAt',a.created_at,'updatedAt',a.updated_at) AS payload
    FROM partner_commercial_agreements a
    LEFT JOIN partner_resources r ON r.id=a.resource_id
    LEFT JOIN directory_profiles d ON d.id=r.directory_profile_id
    LEFT JOIN help_organizations o ON o.id=r.help_organization_id
    LEFT JOIN managed_events e ON e.id=r.managed_event_id
  `,
  GEO_LOCATION_ISSUE: `
    SELECT 'GEO_LOCATION_ISSUE' AS sourceType, CAST(g.id AS TEXT) AS sourceId,
      0 AS activeRank, 'IN_PROGRESS' AS attentionState,
      CASE
        WHEN g.last_error_code='CONFLICTING_PUBLIC_PRIVATE_LOCATION' THEN 'HIGH'
        WHEN g.last_error_code='PRIVACY_CLASSIFICATION_MISSING'
          AND ((g.target_type='DIRECTORY_PROFILE' AND d.category IN ('chovatelske-stanice','chovatelske-kluby','treneri','vencenie','kynologicke-kluby'))
            OR (g.target_type='ORGANIZATION_LOCATION' AND l.role IN ('LEGAL_SEAT','UNSPECIFIED'))) THEN 'HIGH'
        WHEN g.public_visibility='EXACT_PUBLIC' AND g.geocode_status='STALE'
          AND ((g.target_type='DIRECTORY_PROFILE' AND d.category IN ('chovatelske-stanice','chovatelske-kluby','treneri','vencenie','kynologicke-kluby'))
            OR (g.target_type='ORGANIZATION_LOCATION' AND l.role IN ('LEGAL_SEAT','UNSPECIFIED'))) THEN 'HIGH'
        WHEN g.last_error_code IN ('PROVIDER_ERROR','RATE_LIMITED') THEN 'LOW'
        ELSE 'MEDIUM' END AS priority,
      CASE
        WHEN g.last_error_code='CONFLICTING_PUBLIC_PRIVATE_LOCATION' THEN 0
        WHEN g.last_error_code='PRIVACY_CLASSIFICATION_MISSING'
          AND ((g.target_type='DIRECTORY_PROFILE' AND d.category IN ('chovatelske-stanice','chovatelske-kluby','treneri','vencenie','kynologicke-kluby'))
            OR (g.target_type='ORGANIZATION_LOCATION' AND l.role IN ('LEGAL_SEAT','UNSPECIFIED'))) THEN 0
        WHEN g.public_visibility='EXACT_PUBLIC' AND g.geocode_status='STALE'
          AND ((g.target_type='DIRECTORY_PROFILE' AND d.category IN ('chovatelske-stanice','chovatelske-kluby','treneri','vencenie','kynologicke-kluby'))
            OR (g.target_type='ORGANIZATION_LOCATION' AND l.role IN ('LEGAL_SEAT','UNSPECIFIED'))) THEN 0
        WHEN g.last_error_code IN ('PROVIDER_ERROR','RATE_LIMITED') THEN 2
        ELSE 1 END AS priorityRank,
      g.updated_at AS relevantAt,
      json_object('id',g.id,'targetType',g.target_type,
        'targetId',COALESCE(g.directory_profile_id,g.organization_location_id,g.managed_event_id),
        'organizationId',l.organization_id,'label',COALESCE(d.name,o.name,e.title,l.label,''),
        'category',d.category,'locationRole',l.role,'publicVisibility',g.public_visibility,
        'status',g.geocode_status,'errorCode',g.last_error_code,'manualOverride',g.manual_override,
        'createdAt',g.created_at,'updatedAt',g.updated_at) AS payload
    FROM geo_points g
    LEFT JOIN directory_profiles d ON d.id=g.directory_profile_id
    LEFT JOIN organization_locations l ON l.id=g.organization_location_id
    LEFT JOIN help_organizations o ON o.id=l.organization_id
    LEFT JOIN managed_events e ON e.id=g.managed_event_id
    WHERE g.geocode_status IN ('NEEDS_REVIEW','STALE','FAILED')
  `,
};

function getD1Binding(database?: AdminAttentionD1Database) {
  if (database && typeof database.prepare === "function") return database;
  const bound = (env as unknown as RuntimeBindings).DB;
  return bound && typeof bound.prepare === "function" ? bound : null;
}

function requireD1Binding(database?: AdminAttentionD1Database) {
  const resolved = getD1Binding(database);
  if (!resolved) throw new Error("Databáza admin operácií zatiaľ nie je pripojená.");
  return resolved;
}

function timeBindings(now: Date) {
  const day = 86_400_000;
  return [
    new Date(now.getTime() - day).toISOString(),
    new Date(now.getTime() - ADOPTION_STALE_DAYS * day).toISOString(),
    new Date(now.getTime() - ADOPTION_NOINDEX_STALE_DAYS * day).toISOString(),
    now.toISOString(),
    new Date(now.getTime() + 14 * day).toISOString(),
  ] as const;
}

function paramsCte() {
  return `WITH params AS (
    SELECT ? AS staleInquiryAt, ? AS staleAdoptionAt, ? AS adoptionHighAt, ? AS nowIso, ? AS expiringAt
  )`;
}

function sourceProbeSql(source: AdminAttentionQueueSourceType) {
  return `${paramsCte()}, source_rows AS (${ATTENTION_SOURCE_SELECTS[source]})
    SELECT
      COUNT(*) AS total,
      COALESCE(SUM(CASE WHEN activeRank=0 THEN 1 ELSE 0 END),0) AS activeCount,
      COALESCE(SUM(CASE WHEN activeRank=1 THEN 1 ELSE 0 END),0) AS historyCount,
      COALESCE(SUM(CASE WHEN attentionState='NEW' THEN 1 ELSE 0 END),0) AS newCount,
      COALESCE(SUM(CASE WHEN attentionState='IN_PROGRESS' THEN 1 ELSE 0 END),0) AS inProgressCount,
      COALESCE(SUM(CASE WHEN attentionState='RESOLVED' THEN 1 ELSE 0 END),0) AS resolvedCount,
      COALESCE(SUM(CASE WHEN attentionState='DISMISSED' THEN 1 ELSE 0 END),0) AS dismissedCount,
      COALESCE(SUM(CASE WHEN priority='HIGH' THEN 1 ELSE 0 END),0) AS highCount,
      COALESCE(SUM(CASE WHEN priority='MEDIUM' THEN 1 ELSE 0 END),0) AS mediumCount,
      COALESCE(SUM(CASE WHEN priority='LOW' THEN 1 ELSE 0 END),0) AS lowCount,
      COALESCE(SUM(CASE WHEN activeRank=0 AND priority='HIGH' THEN 1 ELSE 0 END),0) AS activeHighCount,
      COALESCE(SUM(CASE WHEN activeRank=0 AND priority='MEDIUM' THEN 1 ELSE 0 END),0) AS activeMediumCount,
      COALESCE(SUM(CASE WHEN activeRank=0 AND priority='LOW' THEN 1 ELSE 0 END),0) AS activeLowCount,
      COALESCE(SUM(CASE WHEN activeRank=1 AND priority='HIGH' THEN 1 ELSE 0 END),0) AS historyHighCount,
      COALESCE(SUM(CASE WHEN activeRank=1 AND priority='MEDIUM' THEN 1 ELSE 0 END),0) AS historyMediumCount,
      COALESCE(SUM(CASE WHEN activeRank=1 AND priority='LOW' THEN 1 ELSE 0 END),0) AS historyLowCount,
      MIN(relevantAt) AS minRelevantAt,
      COALESCE(SUM(CASE WHEN payload IS NOT NULL THEN length(payload) ELSE 0 END),0) AS payloadLength
    FROM source_rows`;
}

function safeLogSourceFailure(sourceType: AdminAttentionQueueSourceType, operation: string) {
  console.warn("Admin attention source unavailable.", {
    sourceType,
    operation,
    errorCode: "ATTENTION_SOURCE_UNAVAILABLE",
  });
}

function unavailableSnapshot(sourceType: AdminAttentionQueueSourceType): AttentionSourceSnapshot {
  return {
    sourceType,
    state: "UNAVAILABLE",
    activeCount: null,
    errorCode: "ATTENTION_SOURCE_UNAVAILABLE",
    total: 0,
    historyCount: 0,
    byState: { NEW: 0, IN_PROGRESS: 0, RESOLVED: 0, DISMISSED: 0 },
    byPriority: { HIGH: 0, MEDIUM: 0, LOW: 0 },
    activeByPriority: { HIGH: 0, MEDIUM: 0, LOW: 0 },
    historyByPriority: { HIGH: 0, MEDIUM: 0, LOW: 0 },
  };
}

function rowToSnapshot(sourceType: AdminAttentionQueueSourceType, row: AttentionSourceProbeRow | null): AttentionSourceSnapshot {
  const activeCount = Number(row?.activeCount ?? 0);
  return {
    sourceType,
    state: activeCount > 0 ? "OK" : "EMPTY",
    activeCount,
    total: Number(row?.total ?? 0),
    historyCount: Number(row?.historyCount ?? 0),
    byState: {
      NEW: Number(row?.newCount ?? 0),
      IN_PROGRESS: Number(row?.inProgressCount ?? 0),
      RESOLVED: Number(row?.resolvedCount ?? 0),
      DISMISSED: Number(row?.dismissedCount ?? 0),
    },
    byPriority: {
      HIGH: Number(row?.highCount ?? 0),
      MEDIUM: Number(row?.mediumCount ?? 0),
      LOW: Number(row?.lowCount ?? 0),
    },
    activeByPriority: {
      HIGH: Number(row?.activeHighCount ?? 0),
      MEDIUM: Number(row?.activeMediumCount ?? 0),
      LOW: Number(row?.activeLowCount ?? 0),
    },
    historyByPriority: {
      HIGH: Number(row?.historyHighCount ?? 0),
      MEDIUM: Number(row?.historyMediumCount ?? 0),
      LOW: Number(row?.historyLowCount ?? 0),
    },
  };
}

async function probeSources(db: AdminAttentionD1Database, now: Date): Promise<AttentionSourceSnapshot[]> {
  const bindings = timeBindings(now);
  return Promise.all(adminAttentionQueueSourceTypes.map(async (sourceType) => {
    try {
      const row = await db.prepare(sourceProbeSql(sourceType)).bind(...bindings).first<AttentionSourceProbeRow>();
      return rowToSnapshot(sourceType, row);
    } catch {
      safeLogSourceFailure(sourceType, "summary");
      return unavailableSnapshot(sourceType);
    }
  }));
}

function publicSourceAvailability(sources: AttentionSourceSnapshot[]): AdminAttentionSourceAvailability[] {
  return sources.map(({ sourceType, state, activeCount, errorCode }) => ({
    sourceType,
    state,
    activeCount,
    ...(errorCode ? { errorCode } : {}),
  }));
}

function summaryAvailability(sources: AdminAttentionSourceAvailability[]): "OK" | "PARTIAL" | "UNAVAILABLE" {
  const available = sources.filter((source) => source.state !== "UNAVAILABLE").length;
  if (available === 0) return "UNAVAILABLE";
  if (available !== sources.length) return "PARTIAL";
  return "OK";
}

function sourceCounts(sources: AdminAttentionSourceAvailability[]) {
  return Object.fromEntries(sources.map((source) => [source.sourceType, source.activeCount])) as Record<AdminAttentionQueueSourceType, number | null>;
}

function filteredSnapshotCount(snapshot: AttentionSourceSnapshot, filters: AdminAttentionFilters) {
  if (snapshot.state === "UNAVAILABLE") return 0;
  const view = filters.view ?? "active";
  const priority = filters.priority ?? "all";
  if (priority === "all") {
    if (view === "active") return snapshot.activeCount ?? 0;
    if (view === "history") return snapshot.historyCount;
    return snapshot.total;
  }
  if (view === "active") return snapshot.activeByPriority[priority];
  if (view === "history") return snapshot.historyByPriority[priority];
  return snapshot.byPriority[priority];
}

function snapshotMatchesSource(snapshot: AttentionSourceSnapshot, filters: AdminAttentionFilters) {
  return !filters.sourceType || filters.sourceType === "all" || snapshot.sourceType === filters.sourceType;
}

function summarizeSnapshots(
  snapshots: AttentionSourceSnapshot[],
  sourceAvailability: AdminAttentionSourceAvailability[],
): AdminAttentionPageSummary {
  const available = snapshots.filter((source) => source.state !== "UNAVAILABLE");
  return {
    total: available.reduce((sum, source) => sum + source.total, 0),
    active: available.reduce((sum, source) => sum + (source.activeCount ?? 0), 0),
    history: available.reduce((sum, source) => sum + source.historyCount, 0),
    byState: {
      NEW: available.reduce((sum, source) => sum + source.byState.NEW, 0),
      IN_PROGRESS: available.reduce((sum, source) => sum + source.byState.IN_PROGRESS, 0),
      RESOLVED: available.reduce((sum, source) => sum + source.byState.RESOLVED, 0),
      DISMISSED: available.reduce((sum, source) => sum + source.byState.DISMISSED, 0),
    },
    byPriority: {
      HIGH: available.reduce((sum, source) => sum + source.byPriority.HIGH, 0),
      MEDIUM: available.reduce((sum, source) => sum + source.byPriority.MEDIUM, 0),
      LOW: available.reduce((sum, source) => sum + source.byPriority.LOW, 0),
    },
    bySource: sourceCounts(sourceAvailability),
  };
}

function filtersFingerprint(filters: AdminAttentionFilters) {
  return JSON.stringify({
    sourceType: filters.sourceType ?? "all",
    priority: filters.priority ?? "all",
    view: filters.view ?? "active",
  });
}

function encodeBase64Url(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
}

export function encodeAdminAttentionCursor(row: Pick<AttentionGenericRow, "activeRank" | "priorityRank" | "relevantAt" | "sourceType" | "sourceId">, filters: AdminAttentionFilters) {
  const payload: CursorPayload = {
    v: 1,
    fingerprint: filtersFingerprint(filters),
    activeRank: row.activeRank === 1 ? 1 : 0,
    priorityRank: row.priorityRank === 0 ? 0 : row.priorityRank === 2 ? 2 : 1,
    relevantAt: row.relevantAt,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
  };
  return encodeBase64Url(JSON.stringify(payload));
}

export function decodeAdminAttentionCursor(value: string | undefined, filters: AdminAttentionFilters): CursorPayload | null {
  if (!value) return null;
  try {
    if (value.length > 1600) return null;
    const parsed = JSON.parse(decodeBase64Url(value)) as Partial<CursorPayload>;
    if (parsed.v !== 1 || parsed.fingerprint !== filtersFingerprint(filters)) return null;
    if (parsed.activeRank !== 0 && parsed.activeRank !== 1) return null;
    if (parsed.priorityRank !== 0 && parsed.priorityRank !== 1 && parsed.priorityRank !== 2) return null;
    if (typeof parsed.relevantAt !== "string" || parsed.relevantAt.length > 80 || !Number.isFinite(Date.parse(parsed.relevantAt))) return null;
    if (typeof parsed.sourceType !== "string" || !isAdminAttentionQueueSourceType(parsed.sourceType)) return null;
    if (typeof parsed.sourceId !== "string" || !parsed.sourceId || parsed.sourceId.length > 200) return null;
    return parsed as CursorPayload;
  } catch {
    return null;
  }
}

function filterClause(filters: AdminAttentionFilters, tableAlias = "") {
  const prefix = tableAlias ? `${tableAlias}.` : "";
  const clauses: string[] = [];
  const bindings: string[] = [];
  if (filters.sourceType && filters.sourceType !== "all" && isAdminAttentionQueueSourceType(filters.sourceType)) {
    clauses.push(`${prefix}sourceType=?`);
    bindings.push(filters.sourceType);
  }
  if (filters.priority && filters.priority !== "all") {
    clauses.push(`${prefix}priority=?`);
    bindings.push(filters.priority);
  }
  if ((filters.view ?? "active") === "active") clauses.push(`${prefix}activeRank=0`);
  if (filters.view === "history") clauses.push(`${prefix}activeRank=1`);
  return { sql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", bindings };
}

function cursorClause(cursor: CursorPayload | null) {
  if (!cursor) return { sql: "", bindings: [] as Array<string | number> };
  if (cursor.activeRank === 0) {
    return {
      sql: `(
        activeRank > ?
        OR (activeRank = ? AND (
          priorityRank > ?
          OR (priorityRank = ? AND (
            relevantAt > ?
            OR (relevantAt = ? AND (
              sourceType > ?
              OR (sourceType = ? AND sourceId > ?)
            ))
          ))
        ))
      )`,
      bindings: [
        cursor.activeRank, cursor.activeRank,
        cursor.priorityRank, cursor.priorityRank,
        cursor.relevantAt, cursor.relevantAt,
        cursor.sourceType, cursor.sourceType, cursor.sourceId,
      ],
    };
  }
  return {
    sql: `(
      activeRank > ?
      OR (activeRank = ? AND (
        relevantAt < ?
        OR (relevantAt = ? AND (
          sourceType > ?
          OR (sourceType = ? AND sourceId > ?)
        ))
      ))
    )`,
    bindings: [
      cursor.activeRank, cursor.activeRank,
      cursor.relevantAt, cursor.relevantAt,
      cursor.sourceType, cursor.sourceType, cursor.sourceId,
    ],
  };
}

function pageWhere(filters: AdminAttentionFilters, cursor: CursorPayload | null) {
  const filter = filterClause(filters);
  const cursorPart = cursorClause(cursor);
  const clauses = [
    filter.sql.replace(/^WHERE\s+/, ""),
    cursorPart.sql,
  ].filter(Boolean);
  return {
    sql: clauses.length ? `WHERE ${clauses.map((clause) => `(${clause})`).join(" AND ")}` : "",
    bindings: [...filter.bindings, ...cursorPart.bindings],
  };
}

const ATTENTION_ORDER_SQL = `ORDER BY
  activeRank ASC,
  CASE WHEN activeRank=0 THEN priorityRank ELSE 0 END ASC,
  CASE WHEN activeRank=0 THEN relevantAt END ASC,
  CASE WHEN activeRank=1 THEN relevantAt END DESC,
  sourceType ASC,
  sourceId ASC`;

function sourcePageQuery(
  source: AdminAttentionQueueSourceType,
  filters: AdminAttentionFilters,
  cursor: CursorPayload | null,
) {
  const where = pageWhere(filters, cursor);
  return {
    sql: `${paramsCte()}, source_rows AS (${ATTENTION_SOURCE_SELECTS[source]})
      SELECT sourceType,sourceId,activeRank,attentionState,priority,priorityRank,relevantAt,payload
      FROM source_rows
      ${where.sql}
      ${ATTENTION_ORDER_SQL}
      LIMIT ?`,
    bindings: where.bindings,
  };
}

function compareAttentionRows(left: AttentionGenericRow, right: AttentionGenericRow) {
  if (left.activeRank !== right.activeRank) return left.activeRank - right.activeRank;
  if (left.activeRank === 0 && left.priorityRank !== right.priorityRank) return left.priorityRank - right.priorityRank;
  if (left.relevantAt !== right.relevantAt) {
    if (left.activeRank === 0) return left.relevantAt < right.relevantAt ? -1 : 1;
    return left.relevantAt > right.relevantAt ? -1 : 1;
  }
  if (left.sourceType !== right.sourceType) return left.sourceType < right.sourceType ? -1 : 1;
  if (left.sourceId !== right.sourceId) return left.sourceId < right.sourceId ? -1 : 1;
  return 0;
}

function mapGenericRow(row: AttentionGenericRow, now: Date): AdminAttentionItem {
  const payload = JSON.parse(row.payload) as unknown;
  switch (row.sourceType) {
    case "MODERATION_SUBMISSION": return mapModerationAttention(payload as ModerationAttentionRow, now)!;
    case "PROFILE_REVIEW_MODERATION": return mapProfileReviewAttention(payload as ProfileReviewAttentionRow, now);
    case "NEWS_TIP": return mapNewsTipAttention(payload as NewsTipAttentionRow, now);
    case "DIRECTORY_CHANGE_REQUEST": return mapDirectoryChangeRequestAttention(payload as DirectoryChangeRequestAttentionRow, now);
    case "DIRECTORY_INQUIRY": return mapDirectoryInquiryAttention(payload as DirectoryInquiryAttentionRow, now);
    case "ARTICLE_FEEDBACK": return mapArticleFeedbackAttention(payload as ArticleFeedbackAttentionRow, now);
    case "ADOPTION_STALE": return mapAdoptionStaleAttention(payload as AdoptionStaleAttentionRow, now);
    case "PARTNER_CLAIM_REVIEW": return mapPartnerClaimAttention(payload as PartnerClaimAttentionRow, now);
    case "PARTNER_PROFILE_CHANGE_REVIEW": return mapPartnerProfileChangeAttention(payload as PartnerProfileChangeAttentionRow, now);
    case "PARTNER_NEW_PROFILE_REVIEW": return mapPartnerNewProfileAttention(payload as PartnerNewProfileAttentionRow, now);
    case "PARTNER_EVENT_REVIEW": return mapPartnerEventAttention(payload as PartnerEventAttentionRow, now);
    case "PARTNER_VERIFICATION_REVIEW": return mapPartnerVerificationAttention(payload as PartnerVerificationAttentionRow, now);
    case "PARTNER_COMMERCIAL_LEAD": return mapPartnerCommercialAttention(payload as PartnerCommercialAttentionRow, now);
    case "PARTNER_COMMERCIAL_AGREEMENT": return mapPartnerCommercialAgreementAttention(payload as PartnerCommercialAgreementAttentionRow, now);
    case "GEO_LOCATION_ISSUE": return mapGeoLocationAttention(payload as GeoLocationAttentionRow, now);
  }
}

function emptyPageSummary(bySource: Record<AdminAttentionQueueSourceType, number | null>): AdminAttentionPageSummary {
  return {
    total: 0,
    active: Object.values(bySource).reduce((sum, value) => sum + (value ?? 0), 0),
    history: 0,
    byState: { NEW: 0, IN_PROGRESS: 0, RESOLVED: 0, DISMISSED: 0 },
    byPriority: { HIGH: 0, MEDIUM: 0, LOW: 0 },
    bySource,
  };
}

export async function loadExactAdminAttentionSummary(database?: AdminAttentionD1Database, now = new Date()): Promise<AdminAttentionExactSummary> {
  const db = requireD1Binding(database);
  const snapshots = await probeSources(db, now);
  const sourceAvailability = publicSourceAvailability(snapshots);
  const bySource = sourceCounts(sourceAvailability);
  return {
    active: Object.values(bySource).reduce((sum, value) => sum + (value ?? 0), 0),
    bySource,
    availability: summaryAvailability(sourceAvailability),
    unavailableSources: sourceAvailability
      .filter((source) => source.state === "UNAVAILABLE")
      .map((source) => source.sourceType),
  };
}

export async function loadAdminAttentionPage(
  options: {
    filters?: AdminAttentionFilters;
    cursor?: string;
    pageSize?: number;
  } = {},
  database?: AdminAttentionD1Database,
  now = new Date(),
): Promise<AdminAttentionPage> {
  const db = requireD1Binding(database);
  const filters = options.filters ?? { sourceType: "all", priority: "all", view: "active" };
  const pageSize = Math.max(1, Math.min(ADMIN_ATTENTION_MAX_PAGE_SIZE, Math.trunc(options.pageSize ?? ADMIN_ATTENTION_PAGE_SIZE)));
  const requestedCursor = options.cursor?.trim() || "";
  const cursor = decodeAdminAttentionCursor(requestedCursor || undefined, filters);
  const invalidCursor = Boolean(requestedCursor) && !cursor;
  const currentCursor = invalidCursor ? null : cursor;

  let snapshots = await probeSources(db, now);
  let sourceAvailability = publicSourceAvailability(snapshots);

  if (!sourceAvailability.some((source) => source.state !== "UNAVAILABLE")) {
    const bySource = sourceCounts(sourceAvailability);
    return {
      items: [],
      summary: emptyPageSummary(bySource),
      resultCount: 0,
      availability: "UNAVAILABLE",
      sourceAvailability,
      pagination: { pageSize, nextCursor: null, invalidCursor },
    };
  }

  const candidates = snapshots.filter(
    (source) => source.state !== "UNAVAILABLE" && snapshotMatchesSource(source, filters),
  );
  const bindings = timeBindings(now);
  const pageResults = await Promise.all(candidates.map(async (source) => {
    const query = sourcePageQuery(source.sourceType, filters, currentCursor);
    try {
      const result = await db.prepare(query.sql)
        .bind(...bindings, ...query.bindings, pageSize + 1)
        .all<AttentionGenericRow>();
      return { sourceType: source.sourceType, rows: result.results, failed: false as const };
    } catch {
      safeLogSourceFailure(source.sourceType, "page");
      return { sourceType: source.sourceType, rows: [] as AttentionGenericRow[], failed: true as const };
    }
  }));

  const failedSources = new Set(
    pageResults.filter((result) => result.failed).map((result) => result.sourceType),
  );
  if (failedSources.size) {
    snapshots = snapshots.map((snapshot) => failedSources.has(snapshot.sourceType)
      ? unavailableSnapshot(snapshot.sourceType)
      : snapshot);
    sourceAvailability = publicSourceAvailability(snapshots);
  }

  const bySource = sourceCounts(sourceAvailability);
  const summary = summarizeSnapshots(snapshots, sourceAvailability);
  const overallAvailability = summaryAvailability(sourceAvailability);
  const resultCount = snapshots
    .filter((snapshot) => snapshotMatchesSource(snapshot, filters))
    .reduce((sum, snapshot) => sum + filteredSnapshotCount(snapshot, filters), 0);

  const rows = pageResults
    .filter((result) => !result.failed)
    .flatMap((result) => result.rows)
    .sort(compareAttentionRows);
  const visibleRows = rows.slice(0, pageSize);
  const items = visibleRows.map((row) => mapGenericRow(row, now));
  const nextCursor = rows.length > pageSize && visibleRows.length
    ? encodeAdminAttentionCursor(visibleRows[visibleRows.length - 1], filters)
    : null;
  const availability: AdminAttentionAvailability = overallAvailability === "UNAVAILABLE"
    ? "UNAVAILABLE"
    : overallAvailability === "PARTIAL"
      ? "PARTIAL"
      : resultCount === 0 ? "EMPTY" : "OK";

  return {
    items,
    summary: { ...summary, bySource },
    resultCount,
    availability,
    sourceAvailability,
    pagination: { pageSize, nextCursor, invalidCursor },
  };
}
