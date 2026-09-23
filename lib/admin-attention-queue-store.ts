import { env } from "cloudflare:workers";
import { ADOPTION_STALE_DAYS } from "./adoption.ts";
import {
  ADMIN_ATTENTION_SOURCE_LIMIT,
  mapAdoptionStaleAttention,
  mapAutomationFindingAttention,
  mapArticleFeedbackAttention,
  mapDirectoryChangeRequestAttention,
  mapDirectoryInquiryAttention,
  mapGeoLocationAttention,
  mapModerationAttention,
  mapProfileReviewAttention,
  mapNewsTipAttention,
  mapPartnerClaimAttention,
  mapPartnerProfileChangeAttention,
  mapPartnerNewProfileAttention,
  mapPartnerEventAttention,
  mapPartnerVerificationAttention,
  mapPartnerCommercialAttention,
  mapPartnerCommercialAgreementAttention,
  sortAdminAttentionItems,
  type AdoptionStaleAttentionRow,
  type AutomationFindingAttentionRow,
  type ArticleFeedbackAttentionRow,
  type DirectoryChangeRequestAttentionRow,
  type DirectoryInquiryAttentionRow,
  type GeoLocationAttentionRow,
  type ModerationAttentionRow,
  type ProfileReviewAttentionRow,
  type NewsTipAttentionRow,
  type PartnerClaimAttentionRow,
  type PartnerProfileChangeAttentionRow,
  type PartnerNewProfileAttentionRow,
  type PartnerEventAttentionRow,
  type PartnerVerificationAttentionRow,
  type PartnerCommercialAttentionRow,
  type PartnerCommercialAgreementAttentionRow,
} from "./admin-attention-queue.ts";

export type AdminAttentionD1Database = Pick<D1Database, "prepare">;
type RuntimeBindings = { DB?: D1Database };

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

async function safeSourceResults<T>(source: string, query: Promise<D1Result<T>>) {
  try {
    return (await query).results;
  } catch (error) {
    console.warn("Admin attention source query failed.", {
      source,
      error: error instanceof Error ? error.message : "unknown_error",
    });
    return [] as T[];
  }
}

export async function loadAdminAttentionQueue(database?: AdminAttentionD1Database, now = new Date()) {
  const db = requireD1Binding(database);
  const staleThreshold = new Date(now.getTime() - ADOPTION_STALE_DAYS * 86_400_000).toISOString();

  const moderationPromise = db.prepare(`
    SELECT id, resource_type AS resourceType, operation, status, risk_flags_json AS riskFlagsJson,
      created_at AS createdAt, updated_at AS updatedAt
    FROM moderation_submissions
    WHERE resource_type IN ('LOST_FOUND_CASE', 'ADOPTION_DOG')
    ORDER BY
      CASE WHEN status IN ('SUBMITTED', 'PENDING_REVIEW', 'QUARANTINED') THEN 0 ELSE 1 END,
      CASE WHEN status IN ('SUBMITTED', 'PENDING_REVIEW', 'QUARANTINED') THEN created_at END ASC,
      CASE WHEN status NOT IN ('SUBMITTED', 'PENDING_REVIEW', 'QUARANTINED') THEN updated_at END DESC,
      id ASC
    LIMIT ?
  `).bind(ADMIN_ATTENTION_SOURCE_LIMIT).all<ModerationAttentionRow>();

  const profileReviewsPromise = db.prepare(`
    SELECT review.id, review.status, review.risk_flags_json AS riskFlagsJson,
      review.created_at AS createdAt, review.updated_at AS updatedAt,
      resource.entity_type AS targetType,
      COALESCE(directory.name, organization.name, 'Profil') AS targetName,
      directory.category AS targetCategory
    FROM profile_reviews review
    JOIN partner_resources resource ON resource.id=review.resource_id
    LEFT JOIN directory_profiles directory ON directory.id=resource.directory_profile_id
    LEFT JOIN help_organizations organization ON organization.id=resource.help_organization_id
    ORDER BY
      CASE WHEN review.status='PENDING_REVIEW' THEN 0 ELSE 1 END,
      CASE WHEN review.status='PENDING_REVIEW' THEN review.created_at END ASC,
      CASE WHEN review.status<>'PENDING_REVIEW' THEN review.updated_at END DESC,
      review.id ASC
    LIMIT ?
  `).bind(ADMIN_ATTENTION_SOURCE_LIMIT).all<ProfileReviewAttentionRow>();

  const newsTipsPromise = db.prepare(`
    SELECT id, title, topic, status, created_at AS createdAt, updated_at AS updatedAt
    FROM news_tips
    ORDER BY
      CASE WHEN status IN ('new', 'reviewing') THEN 0 ELSE 1 END,
      CASE WHEN status IN ('new', 'reviewing') THEN created_at END ASC,
      CASE WHEN status NOT IN ('new', 'reviewing') THEN updated_at END DESC,
      id ASC
    LIMIT ?
  `).bind(ADMIN_ATTENTION_SOURCE_LIMIT).all<NewsTipAttentionRow>();

  const changeRequestsPromise = db.prepare(`
    SELECT id, profile_name AS profileName, profile_category AS profileCategory, status,
      created_at AS createdAt, updated_at AS updatedAt
    FROM directory_profile_change_requests
    ORDER BY
      CASE WHEN status = 'new' THEN 0 ELSE 1 END,
      CASE WHEN status = 'new' THEN created_at END ASC,
      CASE WHEN status != 'new' THEN updated_at END DESC,
      id ASC
    LIMIT ?
  `).bind(ADMIN_ATTENTION_SOURCE_LIMIT).all<DirectoryChangeRequestAttentionRow>();

  const inquiriesPromise = db.prepare(`
    SELECT id, profile_name AS profileName, profile_category AS profileCategory, status,
      created_at AS createdAt, updated_at AS updatedAt
    FROM directory_inquiries
    ORDER BY
      CASE WHEN status IN ('new', 'read') THEN 0 ELSE 1 END,
      CASE WHEN status IN ('new', 'read') THEN created_at END ASC,
      CASE WHEN status = 'resolved' THEN updated_at END DESC,
      id ASC
    LIMIT ?
  `).bind(ADMIN_ATTENTION_SOURCE_LIMIT).all<DirectoryInquiryAttentionRow>();

  const feedbackPromise = db.prepare(`
    SELECT id, article_title AS articleTitle, article_path AS articlePath, status,
      created_at AS createdAt, attention_updated_at AS updatedAt
    FROM article_feedback
    WHERE helpful = 0
    ORDER BY
      CASE WHEN status IN ('new', 'reviewing') THEN 0 ELSE 1 END,
      CASE WHEN status IN ('new', 'reviewing') THEN created_at END ASC,
      CASE WHEN status NOT IN ('new', 'reviewing') THEN COALESCE(attention_updated_at, created_at) END DESC,
      id ASC
    LIMIT ?
  `).bind(ADMIN_ATTENTION_SOURCE_LIMIT).all<ArticleFeedbackAttentionRow>();

  const adoptionsPromise = db.prepare(`
    SELECT id, name, status, last_verified_at AS lastVerifiedAt, created_at AS createdAt
    FROM adoption_dogs
    WHERE status IN ('ACTIVE', 'RESERVED')
      AND (last_verified_at IS NULL OR last_verified_at < ?)
    ORDER BY COALESCE(last_verified_at, created_at) ASC, id ASC
    LIMIT ?
  `).bind(staleThreshold, ADMIN_ATTENTION_SOURCE_LIMIT).all<AdoptionStaleAttentionRow>();

  const claimsPromise = db.prepare(`
    SELECT c.id,c.status,c.created_at AS createdAt,c.updated_at AS updatedAt,
      COALESCE(d.name,o.name) AS resourceName,
      CASE WHEN
        EXISTS(
          SELECT 1 FROM partner_memberships om
          JOIN partner_accounts oa ON oa.id=om.account_id AND oa.status='ACTIVE'
          WHERE om.resource_id=c.resource_id AND om.revoked_at IS NULL AND om.role='OWNER' AND om.account_id<>c.account_id
        )
        OR EXISTS(
          SELECT 1 FROM partner_claims oc
          WHERE oc.resource_id=c.resource_id AND oc.status='PENDING' AND oc.account_id<>c.account_id
        )
      THEN 1 ELSE 0 END AS conflict
    FROM partner_claims c
    JOIN partner_resources r ON r.id=c.resource_id
    LEFT JOIN directory_profiles d ON d.id=r.directory_profile_id
    LEFT JOIN help_organizations o ON o.id=r.help_organization_id
    ORDER BY CASE WHEN c.status='PENDING' THEN 0 ELSE 1 END,
      CASE WHEN c.status='PENDING' THEN c.created_at END ASC,
      CASE WHEN c.status<>'PENDING' THEN c.updated_at END DESC,c.id ASC
    LIMIT ?
  `).bind(ADMIN_ATTENTION_SOURCE_LIMIT).all<PartnerClaimAttentionRow>();

  const profileChangesPromise = db.prepare(`
    SELECT s.id,s.status,s.resource_type resourceType,s.risk_flags_json riskFlagsJson,
      s.created_at createdAt,s.updated_at updatedAt,COALESCE(d.name,o.name) resourceName,
      m.changed_field_count changedFieldCount,
      CASE WHEN COALESCE(d.updated_at,o.updated_at)<>m.base_updated_at THEN 1 ELSE 0 END stale
    FROM moderation_submissions s
    JOIN partner_profile_change_metadata m ON m.submission_id=s.id
    JOIN partner_resources r ON r.id=m.partner_resource_id
    LEFT JOIN directory_profiles d ON d.id=r.directory_profile_id
    LEFT JOIN help_organizations o ON o.id=r.help_organization_id
    WHERE s.resource_type IN ('DIRECTORY_PROFILE','HELP_ORGANIZATION')
      AND s.submitter_type='PARTNER_ACCOUNT'
    ORDER BY
      CASE WHEN s.status IN ('SUBMITTED','PENDING_REVIEW','QUARANTINED') THEN 0 ELSE 1 END,
      CASE WHEN s.status IN ('SUBMITTED','PENDING_REVIEW','QUARANTINED') THEN s.created_at END ASC,
      CASE WHEN s.status NOT IN ('SUBMITTED','PENDING_REVIEW','QUARANTINED') THEN s.updated_at END DESC,
      s.id ASC
    LIMIT ?
  `).bind(ADMIN_ATTENTION_SOURCE_LIMIT).all<PartnerProfileChangeAttentionRow>();

  const newProfilesPromise = db.prepare(`
    SELECT s.id,s.status,m.display_name displayName,m.intended_resource_type resourceType,
      m.category_or_type categoryOrType,m.duplicate_confidence duplicateConfidence,
      s.created_at createdAt,s.updated_at updatedAt
    FROM partner_new_profile_metadata m
    JOIN moderation_submissions s ON s.id=m.submission_id
    ORDER BY
      CASE WHEN s.status IN ('SUBMITTED','PENDING_REVIEW','QUARANTINED') THEN 0 ELSE 1 END,
      CASE WHEN s.status IN ('SUBMITTED','PENDING_REVIEW','QUARANTINED') THEN s.created_at END ASC,
      CASE WHEN s.status NOT IN ('SUBMITTED','PENDING_REVIEW','QUARANTINED') THEN s.updated_at END DESC,
      s.id ASC
    LIMIT ?
  `).bind(ADMIN_ATTENTION_SOURCE_LIMIT).all<PartnerNewProfileAttentionRow>();

  const partnerEventsPromise = db.prepare(`
    SELECT s.id,s.status,s.operation,s.risk_flags_json riskFlagsJson,
      COALESCE(e.title,m.display_title,'Podujatie') title,
      m.changed_field_count changedFieldCount,m.duplicate_confidence duplicateConfidence,
      CASE WHEN m.base_updated_at IS NOT NULL AND e.updated_at<>m.base_updated_at THEN 1 ELSE 0 END stale,
      s.created_at createdAt,s.updated_at updatedAt
    FROM partner_event_submission_metadata m
    JOIN moderation_submissions s ON s.id=m.submission_id
    LEFT JOIN partner_resources r ON r.id=m.partner_resource_id
    LEFT JOIN managed_events e ON e.id=r.managed_event_id
    WHERE s.resource_type='MANAGED_EVENT' AND s.submitter_type='PARTNER_ACCOUNT'
    ORDER BY
      CASE WHEN s.status IN ('SUBMITTED','PENDING_REVIEW','QUARANTINED') THEN 0 ELSE 1 END,
      CASE WHEN s.status IN ('SUBMITTED','PENDING_REVIEW','QUARANTINED') THEN s.created_at END ASC,
      CASE WHEN s.status NOT IN ('SUBMITTED','PENDING_REVIEW','QUARANTINED') THEN s.updated_at END DESC,
      s.id ASC
    LIMIT ?
  `).bind(ADMIN_ATTENTION_SOURCE_LIMIT).all<PartnerEventAttentionRow>();

  const verificationsPromise = db.prepare(`
    SELECT v.id,v.status,v.created_at AS createdAt,v.updated_at AS updatedAt,v.submitted_at AS submittedAt,
      COALESCE(d.name,o.name) AS resourceName,
      CASE WHEN
        EXISTS(
          SELECT 1 FROM partner_memberships om
          JOIN partner_accounts oa ON oa.id=om.account_id AND oa.status='ACTIVE'
          WHERE om.resource_id=v.resource_id AND om.revoked_at IS NULL AND om.role='OWNER' AND om.account_id<>v.account_id
        )
        OR EXISTS(
          SELECT 1 FROM partner_claims pc
          WHERE pc.resource_id=v.resource_id AND pc.status='PENDING' AND pc.account_id<>v.account_id
        )
      THEN 1 ELSE 0 END AS conflict
    FROM partner_resource_verifications v
    JOIN partner_resources r ON r.id=v.resource_id
    LEFT JOIN directory_profiles d ON d.id=r.directory_profile_id
    LEFT JOIN help_organizations o ON o.id=r.help_organization_id
    ORDER BY CASE WHEN v.status='PENDING_VERIFICATION' THEN 0 ELSE 1 END,
      CASE WHEN v.status='PENDING_VERIFICATION' THEN COALESCE(v.submitted_at,v.created_at) END ASC,
      CASE WHEN v.status<>'PENDING_VERIFICATION' THEN v.updated_at END DESC,v.id ASC
    LIMIT ?
  `).bind(ADMIN_ATTENTION_SOURCE_LIMIT).all<PartnerVerificationAttentionRow>();

  const commercialPromise = db.prepare(`
    SELECT c.id,c.interest_type AS interestType,c.status,c.created_at AS createdAt,c.updated_at AS updatedAt,
      COALESCE(d.name,o.name,e.title) AS resourceName
    FROM partner_commercial_interests c
    LEFT JOIN partner_resources r ON r.id=c.resource_id
    LEFT JOIN directory_profiles d ON d.id=r.directory_profile_id
    LEFT JOIN help_organizations o ON o.id=r.help_organization_id
    LEFT JOIN managed_events e ON e.id=r.managed_event_id
    ORDER BY
      CASE WHEN c.status='NEW' THEN 0 ELSE 1 END,
      CASE WHEN c.status='NEW' THEN c.created_at END ASC,
      CASE WHEN c.status<>'NEW' THEN c.updated_at END DESC,
      c.id ASC
    LIMIT ?
  `).bind(ADMIN_ATTENTION_SOURCE_LIMIT).all<PartnerCommercialAttentionRow>();

  const commercialAgreementsPromise = db.prepare(`
    SELECT a.id,a.agreement_type agreementType,a.status,a.payment_status paymentStatus,a.end_at endAt,
      a.created_at createdAt,a.updated_at updatedAt,COALESCE(d.name,o.name,e.title) resourceName
    FROM partner_commercial_agreements a
    LEFT JOIN partner_resources r ON r.id=a.resource_id
    LEFT JOIN directory_profiles d ON d.id=r.directory_profile_id
    LEFT JOIN help_organizations o ON o.id=r.help_organization_id
    LEFT JOIN managed_events e ON e.id=r.managed_event_id
    ORDER BY
      CASE
        WHEN a.status='AGREED' AND a.payment_status IN ('PAID','WAIVED') THEN 0
        WHEN a.status='OFFERED' THEN 1
        WHEN a.status='ACTIVE' THEN 2
        ELSE 3
      END,
      a.updated_at ASC,a.id ASC
    LIMIT ?
  `).bind(ADMIN_ATTENTION_SOURCE_LIMIT).all<PartnerCommercialAgreementAttentionRow>();

  const geoPromise = db.prepare(`
    SELECT g.id, g.target_type AS targetType,
      COALESCE(g.directory_profile_id, g.organization_location_id, g.managed_event_id) AS targetId,
      l.organization_id AS organizationId,
      COALESCE(d.name, o.name, e.title, l.label, '') AS label,
      d.category AS category,
      l.role AS locationRole,
      g.public_visibility AS publicVisibility,
      g.geocode_status AS status,
      g.last_error_code AS errorCode,
      g.manual_override AS manualOverride,
      g.created_at AS createdAt,
      g.updated_at AS updatedAt
    FROM geo_points g
    LEFT JOIN directory_profiles d ON d.id = g.directory_profile_id
    LEFT JOIN organization_locations l ON l.id = g.organization_location_id
    LEFT JOIN help_organizations o ON o.id = l.organization_id
    LEFT JOIN managed_events e ON e.id = g.managed_event_id
    WHERE g.geocode_status IN ('NEEDS_REVIEW', 'STALE', 'FAILED')
    ORDER BY
      CASE
        WHEN g.last_error_code IN ('CONFLICTING_PUBLIC_PRIVATE_LOCATION', 'PRIVACY_CLASSIFICATION_MISSING') THEN 0
        WHEN g.geocode_status IN ('NEEDS_REVIEW', 'STALE') THEN 1
        ELSE 2
      END,
      g.updated_at ASC,
      g.id ASC
    LIMIT ?
  `).bind(ADMIN_ATTENTION_SOURCE_LIMIT).all<GeoLocationAttentionRow>();

  const automationPromise = db.prepare(`
    SELECT f.id, f.entity_type AS entityType, f.finding_type AS findingType, f.priority,
      f.review_status AS reviewStatus, s.label AS sourceLabel, f.source_url AS sourceUrl,
      f.first_detected_at AS firstDetectedAt, f.last_detected_at AS lastDetectedAt
    FROM automation_findings f
    JOIN automation_sources s ON s.id = f.source_id
    ORDER BY
      CASE WHEN f.review_status IN ('NEW','IN_REVIEW') THEN 0 ELSE 1 END,
      CASE f.priority WHEN 'HIGH' THEN 0 WHEN 'MEDIUM' THEN 1 ELSE 2 END,
      CASE WHEN f.review_status IN ('NEW','IN_REVIEW') THEN f.first_detected_at END ASC,
      CASE WHEN f.review_status NOT IN ('NEW','IN_REVIEW') THEN f.last_detected_at END DESC,
      f.id ASC
    LIMIT ?
  `).bind(ADMIN_ATTENTION_SOURCE_LIMIT).all<AutomationFindingAttentionRow>();

  const [moderation, profileReviews, newsTips, changeRequests, inquiries, feedback, adoptions, claims, profileChanges, newProfiles, partnerEvents, verifications, commercial, commercialAgreements, geo, automation] = await Promise.all([
    safeSourceResults("moderation", moderationPromise),
    safeSourceResults("profile_reviews", profileReviewsPromise),
    safeSourceResults("news_tips", newsTipsPromise),
    safeSourceResults("directory_change_requests", changeRequestsPromise),
    safeSourceResults("directory_inquiries", inquiriesPromise),
    safeSourceResults("article_feedback", feedbackPromise),
    safeSourceResults("adoption_stale", adoptionsPromise),
    safeSourceResults("partner_claims", claimsPromise),
    safeSourceResults("partner_profile_changes", profileChangesPromise),
    safeSourceResults("partner_new_profiles", newProfilesPromise),
    safeSourceResults("partner_events", partnerEventsPromise),
    safeSourceResults("partner_resource_verifications", verificationsPromise),
    safeSourceResults("partner_commercial_interests", commercialPromise),
    safeSourceResults("partner_commercial_agreements", commercialAgreementsPromise),
    safeSourceResults("geo_points", geoPromise),
    safeSourceResults("automation_findings", automationPromise),
  ]);

  return sortAdminAttentionItems([
    ...moderation.map((row) => mapModerationAttention(row, now)).filter((item) => item !== null),
    ...profileReviews.map((row) => mapProfileReviewAttention(row, now)),
    ...newsTips.map((row) => mapNewsTipAttention(row, now)),
    ...changeRequests.map((row) => mapDirectoryChangeRequestAttention(row, now)),
    ...inquiries.map((row) => mapDirectoryInquiryAttention(row, now)),
    ...feedback.map((row) => mapArticleFeedbackAttention(row, now)),
    ...adoptions.map((row) => mapAdoptionStaleAttention(row, now)),
    ...claims.map((row) => mapPartnerClaimAttention(row, now)),
    ...profileChanges.map((row) => mapPartnerProfileChangeAttention(row, now)),
    ...newProfiles.map((row) => mapPartnerNewProfileAttention(row, now)),
    ...partnerEvents.map((row) => mapPartnerEventAttention(row, now)),
    ...verifications.map((row) => mapPartnerVerificationAttention(row, now)),
    ...commercial.map((row) => mapPartnerCommercialAttention(row, now)),
    ...commercialAgreements.map((row) => mapPartnerCommercialAgreementAttention(row, now)),
    ...geo.map((row) => mapGeoLocationAttention(row, now)),
    ...automation.map((row) => mapAutomationFindingAttention(row, now)),
  ]);
}

export async function loadExactAdminAttentionSummary(database?: AdminAttentionD1Database, now = new Date()) {
  const db=requireD1Binding(database);
  const staleThreshold=new Date(now.getTime()-ADOPTION_STALE_DAYS*86_400_000).toISOString();
  const nowIso=now.toISOString(),expiringAt=new Date(now.getTime()+14*86_400_000).toISOString();
  const queries=[
    ["MODERATION_SUBMISSION",`SELECT COUNT(*) count FROM moderation_submissions WHERE resource_type IN ('LOST_FOUND_CASE','ADOPTION_DOG') AND status IN ('SUBMITTED','PENDING_REVIEW','QUARANTINED')`,[]],
    ["PROFILE_REVIEW_MODERATION",`SELECT COUNT(*) count FROM profile_reviews WHERE status='PENDING_REVIEW'`,[]],
    ["NEWS_TIP",`SELECT COUNT(*) count FROM news_tips WHERE status IN ('new','reviewing')`,[]],
    ["DIRECTORY_CHANGE_REQUEST",`SELECT COUNT(*) count FROM directory_profile_change_requests WHERE status='new'`,[]],
    ["DIRECTORY_INQUIRY",`SELECT COUNT(*) count FROM directory_inquiries WHERE status IN ('new','read')`,[]],
    ["ARTICLE_FEEDBACK",`SELECT COUNT(*) count FROM article_feedback WHERE helpful=0 AND status IN ('new','reviewing')`,[]],
    ["ADOPTION_STALE",`SELECT COUNT(*) count FROM adoption_dogs WHERE status IN ('ACTIVE','RESERVED') AND (last_verified_at IS NULL OR last_verified_at<?)`,[staleThreshold]],
    ["AUTOMATION_FINDING",`SELECT COUNT(*) count FROM automation_findings WHERE review_status IN ('NEW','IN_REVIEW')`,[]],
    ["PARTNER_CLAIM_REVIEW",`SELECT COUNT(*) count FROM partner_claims WHERE status='PENDING'`,[]],
    ["PARTNER_PROFILE_CHANGE_REVIEW",`SELECT COUNT(*) count FROM moderation_submissions s JOIN partner_profile_change_metadata m ON m.submission_id=s.id WHERE s.resource_type IN ('DIRECTORY_PROFILE','HELP_ORGANIZATION') AND s.submitter_type='PARTNER_ACCOUNT' AND s.status IN ('SUBMITTED','PENDING_REVIEW','QUARANTINED')`,[]],
    ["PARTNER_NEW_PROFILE_REVIEW",`SELECT COUNT(*) count FROM moderation_submissions s JOIN partner_new_profile_metadata m ON m.submission_id=s.id WHERE s.status IN ('SUBMITTED','PENDING_REVIEW','QUARANTINED')`,[]],
    ["PARTNER_EVENT_REVIEW",`SELECT COUNT(*) count FROM moderation_submissions s JOIN partner_event_submission_metadata m ON m.submission_id=s.id WHERE s.resource_type='MANAGED_EVENT' AND s.submitter_type='PARTNER_ACCOUNT' AND s.status IN ('SUBMITTED','PENDING_REVIEW','QUARANTINED')`,[]],
    ["PARTNER_VERIFICATION_REVIEW",`SELECT COUNT(*) count FROM partner_resource_verifications WHERE status='PENDING_VERIFICATION'`,[]],
    ["PARTNER_COMMERCIAL_LEAD",`SELECT COUNT(*) count FROM partner_commercial_interests WHERE status='NEW'`,[]],
    ["PARTNER_COMMERCIAL_AGREEMENT",`SELECT COUNT(*) count FROM partner_commercial_agreements
      WHERE status='OFFERED'
        OR (status='AGREED' AND payment_status IN ('PAID','WAIVED'))
        OR (status='ACTIVE' AND end_at>? AND end_at<=?)`,[nowIso,expiringAt]],
    ["GEO_LOCATION_ISSUE",`SELECT COUNT(*) count FROM geo_points WHERE geocode_status IN ('NEEDS_REVIEW','STALE','FAILED')`,[]],
  ] as const;
  const counts=await Promise.all(queries.map(async([source,sql,bindings])=>{
    try{const row=await db.prepare(sql).bind(...bindings).first<{count:number}>();return [source,Number(row?.count??0)] as const;}catch{return [source,0] as const;}
  }));
  const bySource=Object.fromEntries(counts) as Record<string,number>;
  return {active:Object.values(bySource).reduce((sum,value)=>sum+value,0),bySource};
}
