/**
 * Read-only, account-scoped Partner dossier. No secondary editorial records:
 * every row points at the existing claim/submission and, where present,
 * the original canonical Admin editor.
 *
 * SQL uses bound account ids. The union is paginated across ALL request kinds,
 * not with separate per-type caps that could hide older submissions.
 */
export type PartnerDossierRequest = {
  id: string;
  kind: string;
  entityType: string;
  title: string;
  status: string;
  createdAt: string;
  canonicalId: number | null;
  requestHref: string;
  editorHref: string | null;
  pending: boolean;
};

export type PartnerDossierProfile = {
  id: string;
  name: string;
  entityType: string;
  canonicalId: number;
  status: string;
  grantedAt: string;
  editorHref: string | null;
};

export type PartnerDossierHistory = {
  id: string;
  action: string;
  actorType: string;
  actorRef: string;
  createdAt: string;
};

export const PARTNER_REQUEST_PAGE_SIZE = 50;
const activeStatuses = new Set(["PENDING", "SUBMITTED", "PENDING_REVIEW", "QUARANTINED", "PENDING_VERIFICATION", "NEW", "OFFERED"]);

type RequestRow = Omit<PartnerDossierRequest, "requestHref" | "editorHref" | "pending">;
type ProfileRow = Omit<PartnerDossierProfile, "editorHref">;

function pageNumber(value: number) {
  return Number.isSafeInteger(value) && value >= 1 ? Math.min(value, 10000) : 1;
}

export function partnerDossierEditorHref(entityType: string, canonicalId: number | null) {
  if (!canonicalId || !Number.isSafeInteger(canonicalId) || canonicalId < 1) return null;
  const paths: Record<string, string> = {
    DIRECTORY_PROFILE: "/admin/adresar",
    HELP_ORGANIZATION: "/admin/organizacie",
    MANAGED_EVENT: "/admin/podujatia",
    ADOPTION_DOG: "/admin/adopcie",
    LOST_FOUND_DOG: "/admin/stratene-najdene",
    HELP_CASE: "/admin/pomoc",
  };
  const base = paths[entityType];
  return base ? `${base}/${canonicalId}` : null;
}

function requestHref(kind: string, id: string) {
  const paths: Record<string, string> = {
    CLAIM: "/admin/partners/claims",
    HELP_CLAIM: "/admin/partners/claims",
    NEW_PROFILE: "/admin/partners/submissions",
    PROFILE_CHANGE: "/admin/partners/changes",
    EVENT: "/admin/partners/events",
    HELP_CREATE: "/admin/partners/help-submissions",
    VERIFICATION: "/admin/partners/verifications",
    COMMERCIAL_INTEREST: "/admin/partners/commercial",
    COMMERCIAL_AGREEMENT: "/admin/partners/commercial/agreements",
  };
  const base=paths[kind];
  // Existing commercial screens are collection pages; do not invent detail routes.
  return kind.startsWith("COMMERCIAL_") ? base : `${base}/${encodeURIComponent(id)}`;
}

const REQUEST_UNION = `
  SELECT 'CLAIM' kind,c.id id,r.entity_type entityType,
    COALESCE(d.name,o.name,e.title,'Existujúci profil') title,
    c.status status,c.created_at createdAt,
    COALESCE(r.directory_profile_id,r.help_organization_id,r.managed_event_id) canonicalId
    FROM partner_claims c
    JOIN partner_resources r ON r.id=c.resource_id
    LEFT JOIN directory_profiles d ON d.id=r.directory_profile_id
    LEFT JOIN help_organizations o ON o.id=r.help_organization_id
    LEFT JOIN managed_events e ON e.id=r.managed_event_id
    WHERE c.account_id=?1
  UNION ALL
  SELECT 'HELP_CLAIM',h.id,h.entity_type,
    COALESCE(a.name, NULLIF(l.dog_name,''),NULLIF(l.breed,''),c.title,'Záznam Pomoci psom'),
    h.status,h.created_at,
    COALESCE(h.adoption_dog_id,h.lost_found_report_id,h.help_case_id)
    FROM partner_help_claims h
    LEFT JOIN adoption_dogs a ON a.id=h.adoption_dog_id
    LEFT JOIN lost_found_dog_reports l ON l.id=h.lost_found_report_id
    LEFT JOIN help_cases c ON c.id=h.help_case_id
    WHERE h.account_id=?1
  UNION ALL
  SELECT 'NEW_PROFILE',s.id,s.resource_type,m.display_name,
    s.status,s.created_at,m.resolved_canonical_id
    FROM partner_new_profile_metadata m
    JOIN moderation_submissions s ON s.id=m.submission_id
    WHERE m.partner_account_id=?1
  UNION ALL
  SELECT 'PROFILE_CHANGE',s.id,s.resource_type,
    COALESCE(d.name,o.name,'Úprava profilu'),s.status,s.created_at,
    COALESCE(r.directory_profile_id,r.help_organization_id)
    FROM partner_profile_change_metadata m
    JOIN moderation_submissions s ON s.id=m.submission_id
    JOIN partner_resources r ON r.id=m.partner_resource_id
    LEFT JOIN directory_profiles d ON d.id=r.directory_profile_id
    LEFT JOIN help_organizations o ON o.id=r.help_organization_id
    WHERE m.partner_account_id=?1
  UNION ALL
  SELECT 'EVENT',s.id,s.resource_type,m.display_title,
    s.status,s.created_at,COALESCE(m.resolved_event_id,r.managed_event_id)
    FROM partner_event_submission_metadata m
    JOIN moderation_submissions s ON s.id=m.submission_id
    LEFT JOIN partner_resources r ON r.id=m.partner_resource_id
    WHERE m.partner_account_id=?1
  UNION ALL
  SELECT 'HELP_CREATE',s.id,s.resource_type,
    COALESCE(NULLIF(json_extract(s.proposed_patch_json,'$.name'),''),
      NULLIF(json_extract(s.proposed_patch_json,'$.dogName'),''),
      NULLIF(json_extract(s.proposed_patch_json,'$.title'),''),
      'Nový záznam Pomoci psom'),
    s.status,s.created_at,
    CASE WHEN s.subject_id GLOB '[1-9]*' THEN CAST(s.subject_id AS INTEGER) ELSE NULL END
    FROM moderation_submissions s
    WHERE s.submitter_type='PARTNER_ACCOUNT' AND s.submitter_ref=?1
      AND s.operation='CREATE'
      AND s.resource_type IN ('ADOPTION_DOG','LOST_FOUND_DOG','HELP_CASE')
  UNION ALL
  SELECT 'VERIFICATION',v.id,r.entity_type,
    COALESCE(d.name,o.name,e.title,'Overenie správcu'),
    v.status,v.created_at,
    COALESCE(r.directory_profile_id,r.help_organization_id,r.managed_event_id)
    FROM partner_resource_verifications v
    JOIN partner_resources r ON r.id=v.resource_id
    LEFT JOIN directory_profiles d ON d.id=r.directory_profile_id
    LEFT JOIN help_organizations o ON o.id=r.help_organization_id
    LEFT JOIN managed_events e ON e.id=r.managed_event_id
    WHERE v.account_id=?1
  UNION ALL
  SELECT 'COMMERCIAL_INTEREST',i.id,'COMMERCIAL',
    'Komerčná žiadosť',i.status,i.created_at,NULL
    FROM partner_commercial_interests i WHERE i.account_id=?1
  UNION ALL
  SELECT 'COMMERCIAL_AGREEMENT',g.id,'COMMERCIAL',
    'Komerčná dohoda',g.status,g.created_at,NULL
    FROM partner_commercial_agreements g WHERE g.account_id=?1
`;

export async function listPartnerAccountDossierRequests(accountId:string,database:D1Database,page=1) {
  const current=pageNumber(page);
  const [totals,rows]=await Promise.all([
    database.prepare(`SELECT COUNT(*) total,
      COALESCE(SUM(CASE WHEN status IN ('PENDING','SUBMITTED','PENDING_REVIEW','QUARANTINED','PENDING_VERIFICATION','NEW','OFFERED') THEN 1 ELSE 0 END),0) pending
      FROM (${REQUEST_UNION})`).bind(accountId).first<{total:number;pending:number}>(),
    database.prepare(`SELECT * FROM (${REQUEST_UNION})
      ORDER BY CASE WHEN status IN ('PENDING','SUBMITTED','PENDING_REVIEW','QUARANTINED','PENDING_VERIFICATION','NEW','OFFERED') THEN 0 ELSE 1 END,
      createdAt DESC, id DESC LIMIT ?2 OFFSET ?3`)
      .bind(accountId,PARTNER_REQUEST_PAGE_SIZE,(current-1)*PARTNER_REQUEST_PAGE_SIZE).all<RequestRow>(),
  ]);
  const items=rows.results.map(row=>({
    ...row,
    title:row.title?.trim()||"Záznam bez názvu",
    pending:activeStatuses.has(row.status),
    requestHref:requestHref(row.kind,row.id),
    editorHref:partnerDossierEditorHref(row.entityType,row.canonicalId),
  }));
  return {
    items,
    total:Number(totals?.total??0),
    pending:Number(totals?.pending??0),
    page:current,
    pageSize:PARTNER_REQUEST_PAGE_SIZE,
    totalPages:Math.max(1,Math.ceil(Number(totals?.total??0)/PARTNER_REQUEST_PAGE_SIZE)),
  };
}

const PROFILE_UNION = `
  SELECT m.id id,
    COALESCE(d.name,o.name,e.title,'Profil bez názvu') name,
    r.entity_type entityType,
    COALESCE(r.directory_profile_id,r.help_organization_id,r.managed_event_id) canonicalId,
    COALESCE(d.status,o.status,e.status,'') status,
    m.created_at grantedAt
    FROM partner_memberships m
    JOIN partner_resources r ON r.id=m.resource_id
    LEFT JOIN directory_profiles d ON d.id=r.directory_profile_id
    LEFT JOIN help_organizations o ON o.id=r.help_organization_id
    LEFT JOIN managed_events e ON e.id=r.managed_event_id
    WHERE m.account_id=?1 AND m.revoked_at IS NULL
  UNION ALL
  SELECT h.id,COALESCE(a.name,NULLIF(l.dog_name,''),NULLIF(l.breed,''),c.title,'Záznam Pomoci psom'),
    h.entity_type,COALESCE(h.adoption_dog_id,h.lost_found_report_id,h.help_case_id),
    COALESCE(a.status,l.status,c.status,''),h.created_at
    FROM partner_help_claims h
    LEFT JOIN adoption_dogs a ON a.id=h.adoption_dog_id
    LEFT JOIN lost_found_dog_reports l ON l.id=h.lost_found_report_id
    LEFT JOIN help_cases c ON c.id=h.help_case_id
    WHERE h.account_id=?1 AND h.status='APPROVED'
`;

export async function listPartnerAccountDossierProfiles(accountId:string,database:D1Database,page=1) {
  const current=pageNumber(page);
  const [totalRow,rows]=await Promise.all([
    database.prepare(`SELECT COUNT(*) total FROM (${PROFILE_UNION})`).bind(accountId).first<{total:number}>(),
    database.prepare(`SELECT * FROM (${PROFILE_UNION}) ORDER BY grantedAt DESC,id DESC LIMIT ?2 OFFSET ?3`)
      .bind(accountId,PARTNER_REQUEST_PAGE_SIZE,(current-1)*PARTNER_REQUEST_PAGE_SIZE).all<ProfileRow>(),
  ]);
  const total=Number(totalRow?.total??0);
  return {
    items:rows.results.map(row=>({...row,editorHref:partnerDossierEditorHref(row.entityType,row.canonicalId)})),
    total,page:current,pageSize:PARTNER_REQUEST_PAGE_SIZE,totalPages:Math.max(1,Math.ceil(total/PARTNER_REQUEST_PAGE_SIZE)),
  };
}

export async function listPartnerAccountDossierHistory(accountId:string,database:D1Database,page=1) {
  const current=pageNumber(page);
  const query=`FROM partner_audit_events a WHERE
    a.actor_ref=?1
    OR (a.target_type='PARTNER_ACCOUNT' AND a.target_id=?2)
    OR (a.target_type='MODERATION_SUBMISSION' AND a.target_id IN (
      SELECT id FROM moderation_submissions WHERE submitter_type='PARTNER_ACCOUNT' AND submitter_ref=?2
    ))
    OR (a.target_type='PARTNER_HELP_CLAIM' AND a.target_id IN (
      SELECT id FROM partner_help_claims WHERE account_id=?2
    ))`;
  const [totalRow,rows]=await Promise.all([
    database.prepare("SELECT COUNT(*) total "+query).bind(`partner:${accountId}`,accountId).first<{total:number}>(),
    database.prepare("SELECT a.id,a.action,a.actor_type actorType,a.actor_ref actorRef,a.created_at createdAt "+query+
      " ORDER BY a.created_at DESC,a.id DESC LIMIT ?3 OFFSET ?4")
      .bind(`partner:${accountId}`,accountId,PARTNER_REQUEST_PAGE_SIZE,(current-1)*PARTNER_REQUEST_PAGE_SIZE).all<PartnerDossierHistory>(),
  ]);
  const total=Number(totalRow?.total??0);
  return {
    items:rows.results,total,page:current,pageSize:PARTNER_REQUEST_PAGE_SIZE,
    totalPages:Math.max(1,Math.ceil(total/PARTNER_REQUEST_PAGE_SIZE)),
  };
}
