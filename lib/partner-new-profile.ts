import { env } from "cloudflare:workers";
import { enqueueAdminNotificationEvent } from "@/lib/admin-notifications";
import { directoryCategories } from "@/lib/directory";
import { readDirectoryPublicContacts } from "@/lib/directory-profile-metadata";
import { getPartnerAccountById, getPartnerDatabase } from "@/lib/partner-auth-store";
import { normalizePartnerProfilePatch, publicPartnerProfileChangeReason, type PartnerProfilePatch } from "@/lib/partner-profile-changes";
import { enforcePartnerNewProfileRateLimit } from "@/lib/partner-security";
import { normalizePartnerMediaId, terminalPartnerMediaStatement } from "@/lib/partner-media";
import { organizationPublicationTypes } from "@/lib/help-organization-publication";
import {
  applyAtomicModerationTransition,
  canTransitionModerationSubmission,
  isFoundationSubmissionStatus,
  type FoundationSubmissionStatus,
} from "@/lib/moderation-transition";

export const partnerNewProfileResourceTypes = ["DIRECTORY_PROFILE", "HELP_ORGANIZATION"] as const;
export type PartnerNewProfileResourceType = (typeof partnerNewProfileResourceTypes)[number];
export type PartnerDuplicateConfidence = "NONE" | "MEDIUM" | "HIGH";

export type PartnerDuplicateCandidate = {
  resourceType: PartnerNewProfileResourceType;
  canonicalId: number;
  name: string;
  categoryOrType: string;
  city: string;
  address: string;
  websiteUrl: string;
  publicPhone: string;
  publicEmail: string;
  status: string;
  publicHref: string | null;
  claimHref: string | null;
  confidence: Exclude<PartnerDuplicateConfidence, "NONE">;
  reasons: string[];
};

export type PartnerNewProfileNormalized = {
  resourceType: PartnerNewProfileResourceType;
  displayName: string;
  categoryOrType: string;
  values: PartnerProfilePatch;
};

type RuntimeBindings = { DB?: D1Database; PII_HASH_KEY?: string };

export class PartnerNewProfileError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;
  constructor(message: string, status = 400, code = "NEW_PROFILE_INVALID", details?: unknown) {
    super(message);
    this.name = "PartnerNewProfileError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function database(input?: D1Database) {
  return getPartnerDatabase(input ?? (env as unknown as RuntimeBindings).DB);
}

function record(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new PartnerNewProfileError("Údaje nového profilu musia byť objekt.");
  }
  return value as Record<string, unknown>;
}

export function isPartnerNewProfileResourceType(value: unknown): value is PartnerNewProfileResourceType {
  return typeof value === "string" && (partnerNewProfileResourceTypes as readonly string[]).includes(value);
}

function stringPresent(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

const DIRECTORY_DEFAULTS: PartnerProfilePatch = {
  name: "",
  excerpt: "",
  description: "",
  services: [],
  qualifications: [],
  city: "",
  district: "",
  region: "",
  address: "",
  online: false,
  priceNote: "",
  websiteUrl: "",
  publicPhone: "",
  publicEmail: "",
  facebookUrl: "",
  instagramUrl: "",
};

const HELP_DEFAULTS: PartnerProfilePatch = {
  name: "",
  legalName: "",
  registrationNumber: "",
  type: "OTHER",
  shortDescription: "",
  description: "",
  publicEmail: "",
  publicPhone: "",
  websiteUrl: "",
  facebookUrl: "",
  instagramUrl: "",
  address: "",
  city: "",
  district: "",
  region: "",
  countryCode: "SK",
};

const DIRECTORY_ALLOWED = new Set([...Object.keys(DIRECTORY_DEFAULTS), "category"]);
const HELP_ALLOWED = new Set(Object.keys(HELP_DEFAULTS));

function rejectUnknownFields(raw: Record<string, unknown>, allowed: Set<string>) {
  const unknown = Object.keys(raw).find((key) => !allowed.has(key));
  if (unknown) throw new PartnerNewProfileError(`Pole ${unknown} nie je možné pri novom profile nastavovať.`);
}

export function normalizePartnerNewProfile(resourceType: PartnerNewProfileResourceType, value: unknown): PartnerNewProfileNormalized {
  const raw = record(value);
  if (resourceType === "DIRECTORY_PROFILE") {
    rejectUnknownFields(raw, DIRECTORY_ALLOWED);
    const category = typeof raw.category === "string" ? raw.category.trim() : "";
    if (!directoryCategories.some((item) => item.slug === category)) {
      throw new PartnerNewProfileError("Vyber podporovanú kategóriu služby.");
    }
    for (const [key, label] of [["name", "Názov"], ["excerpt", "Krátky popis"], ["description", "Popis"], ["city", "Mesto"], ["region", "Kraj"]] as const) {
      if (!stringPresent(raw[key])) throw new PartnerNewProfileError(`${label} je povinný údaj.`);
    }
    const editable = Object.fromEntries(Object.entries(raw).filter(([key]) => key !== "category"));
    const patch = normalizePartnerProfilePatch("DIRECTORY_PROFILE", editable, {
      ...DIRECTORY_DEFAULTS,
      name: "__new_profile__",
      excerpt: "__new_profile_excerpt_that_is_long_enough__",
      description: "__new_profile_description_that_is_long_enough_for_validation__",
      city: "__new_city__",
      region: "Online",
    });
    const values = { ...DIRECTORY_DEFAULTS, ...patch, category };
    return { resourceType, displayName: String(values.name), categoryOrType: category, values };
  }

  rejectUnknownFields(raw, HELP_ALLOWED);
  if (!stringPresent(raw.name)) throw new PartnerNewProfileError("Názov je povinný údaj.");
  if (!stringPresent(raw.type)) throw new PartnerNewProfileError("Typ organizácie je povinný údaj.");
  const type = String(raw.type);
  if (!(organizationPublicationTypes as readonly string[]).includes(type)) {
    throw new PartnerNewProfileError("Vyber platný typ organizácie.");
  }
  const countryCode = raw.countryCode === undefined ? "SK" : raw.countryCode;
  const editable = { ...raw, countryCode };
  const patch = normalizePartnerProfilePatch("HELP_ORGANIZATION", editable, {
    ...HELP_DEFAULTS,
    name: "__new_profile__",
    type: "__new_type__",
    countryCode: "ZZ",
  });
  const values = { ...HELP_DEFAULTS, ...patch, type, countryCode: String(countryCode).toUpperCase() };
  return { resourceType, displayName: String(values.name), categoryOrType: type, values };
}

function stripMarks(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeWords(value: unknown) {
  return stripMarks(typeof value === "string" ? value : "")
    .toLocaleLowerCase("sk")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizeDuplicateName(value: unknown) {
  return normalizeWords(value);
}

export function normalizeDuplicateAddress(value: unknown) {
  return normalizeWords(value);
}

export function normalizeDuplicateDomain(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const host = new URL(value.trim()).hostname.toLocaleLowerCase("en").replace(/^www\./, "");
    return host.replace(/\.$/, "");
  } catch {
    return "";
  }
}

export function normalizeDuplicatePhone(value: unknown) {
  if (typeof value !== "string") return "";
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("00421")) digits = digits.slice(2);
  if (digits.length === 10 && digits.startsWith("0")) digits = "421" + digits.slice(1);
  else if (digits.length === 9) digits = "421" + digits;
  return digits.length >= 9 && digits.length <= 15 ? digits : "";
}

export function normalizeDuplicateEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLocaleLowerCase("en") : "";
}

export function normalizeDuplicateRegistration(value: unknown) {
  return typeof value === "string" ? stripMarks(value).toUpperCase().replace(/[^A-Z0-9]/g, "") : "";
}

function nameTokenSimilarity(left: string, right: string) {
  if (!left || !right) return 0;
  const a = new Set(left.split(" ").filter((item) => item.length > 1));
  const b = new Set(right.split(" ").filter((item) => item.length > 1));
  if (!a.size || !b.size) return 0;
  let common = 0;
  for (const item of a) if (b.has(item)) common += 1;
  return common / Math.max(a.size, b.size);
}

async function sha256Hex(value: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return Array.from(bytes, (item) => item.toString(16).padStart(2, "0")).join("");
}

export async function partnerNewProfileIdentityFingerprint(profile: PartnerNewProfileNormalized) {
  const v = profile.values;
  const identity = [
    profile.resourceType,
    profile.categoryOrType,
    normalizeDuplicateRegistration(v.registrationNumber),
    normalizeDuplicateDomain(v.websiteUrl),
    normalizeDuplicateEmail(v.publicEmail),
    normalizeDuplicatePhone(v.publicPhone),
    normalizeDuplicateName(v.name),
    normalizeDuplicateAddress(v.address),
    normalizeWords(v.city),
  ].join("|");
  return sha256Hex(identity);
}

type DirectoryCandidateRow = {
  id:number;name:string;category:string;city:string;address:string;websiteUrl:string|null;sourceDataJson:string;
  status:string;slug:string;
};
type HelpCandidateRow = {
  id:number;name:string;type:string;city:string;address:string;websiteUrl:string|null;publicPhone:string|null;
  publicEmail:string|null;registrationNumber:string|null;status:string;slug:string;publishedAt:string|null;
};

function safeSourceData(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, string | number | null>
      : {};
  } catch {
    return {};
  }
}

export function evaluatePartnerDuplicateCandidate(input: {
  resourceType: PartnerNewProfileResourceType;
  incoming: PartnerProfilePatch;
  categoryOrType: string;
  canonicalId: number;
  name: string;
  categoryOrTypeCandidate: string;
  city: string;
  address: string;
  websiteUrl: string;
  publicPhone: string;
  publicEmail: string;
  registrationNumber: string;
  status: string;
  slug: string;
  published: boolean;
}): PartnerDuplicateCandidate | null {
  const reasons: string[] = [];
  let confidence: PartnerDuplicateConfidence = "NONE";

  const incomingDomain = normalizeDuplicateDomain(input.incoming.websiteUrl);
  const candidateDomain = normalizeDuplicateDomain(input.websiteUrl);
  const incomingPhone = normalizeDuplicatePhone(input.incoming.publicPhone);
  const candidatePhone = normalizeDuplicatePhone(input.publicPhone);
  const incomingEmail = normalizeDuplicateEmail(input.incoming.publicEmail);
  const candidateEmail = normalizeDuplicateEmail(input.publicEmail);
  const incomingReg = normalizeDuplicateRegistration(input.incoming.registrationNumber);
  const candidateReg = normalizeDuplicateRegistration(input.registrationNumber);
  const incomingName = normalizeDuplicateName(input.incoming.name);
  const candidateName = normalizeDuplicateName(input.name);
  const incomingAddress = normalizeDuplicateAddress(input.incoming.address);
  const candidateAddress = normalizeDuplicateAddress(input.address);
  const incomingCity = normalizeWords(input.incoming.city);
  const candidateCity = normalizeWords(input.city);

  const high = (reason: string) => { confidence = "HIGH"; reasons.push(reason); };
  const medium = (reason: string) => { if (confidence !== "HIGH") confidence = "MEDIUM"; reasons.push(reason); };

  if (incomingDomain && candidateDomain && incomingDomain === candidateDomain) high("Rovnaká webová doména");
  if (incomingPhone && candidatePhone && incomingPhone === candidatePhone) high("Rovnaký verejný telefón");
  if (incomingEmail && candidateEmail && incomingEmail === candidateEmail) high("Rovnaký verejný e-mail");
  if (input.resourceType === "HELP_ORGANIZATION" && incomingReg && candidateReg && incomingReg === candidateReg) high("Rovnaké registračné číslo");
  if (incomingName && candidateName && incomingName === candidateName && incomingAddress && candidateAddress && incomingAddress === candidateAddress) {
    high("Rovnaký názov a adresa");
  }
  if (incomingName && candidateName && incomingName === candidateName && incomingCity && candidateCity && incomingCity === candidateCity && input.categoryOrType === input.categoryOrTypeCandidate) {
    medium("Rovnaký názov, mesto a typ/kategória");
  }
  if (incomingAddress && candidateAddress && incomingAddress === candidateAddress && nameTokenSimilarity(incomingName, candidateName) >= 0.75) {
    medium("Rovnaká adresa a veľmi podobný názov");
  }

  if (confidence === "NONE") return null;
  const publicHref = input.published
    ? input.resourceType === "DIRECTORY_PROFILE"
      ? `/adresar/${input.categoryOrTypeCandidate}/${input.slug}`
      : `/organizacie/${input.slug}`
    : null;
  return {
    resourceType: input.resourceType,
    canonicalId: input.canonicalId,
    name: input.name,
    categoryOrType: input.categoryOrTypeCandidate,
    city: input.city,
    address: input.address,
    websiteUrl: input.websiteUrl,
    publicPhone: input.publicPhone,
    publicEmail: input.publicEmail,
    status: input.status,
    publicHref,
    claimHref: publicHref ? `/partner/prevziat-profil/${input.resourceType}/${input.canonicalId}` : null,
    confidence: confidence as Exclude<PartnerDuplicateConfidence, "NONE">,
    reasons,
  };
}

function sortCandidates(items: PartnerDuplicateCandidate[]) {
  return [...items].sort((a,b) => {
    const rank = (value: PartnerDuplicateConfidence) => value === "HIGH" ? 0 : value === "MEDIUM" ? 1 : 2;
    return rank(a.confidence) - rank(b.confidence) || b.reasons.length - a.reasons.length || a.name.localeCompare(b.name, "sk");
  }).slice(0, 8);
}

export async function scanPartnerNewProfileDuplicates(
  profile: PartnerNewProfileNormalized,
  dbInput?: D1Database,
) {
  const db = database(dbInput);
  const items: PartnerDuplicateCandidate[] = [];
  if (profile.resourceType === "DIRECTORY_PROFILE") {
    const rows = await db.prepare(`
      SELECT id,name,category,city,address,website_url websiteUrl,source_data_json sourceDataJson,status,slug
      FROM directory_profiles
      WHERE status<>'archived'
      ORDER BY id DESC
    `).all<DirectoryCandidateRow>();
    for (const row of rows.results) {
      const contacts = readDirectoryPublicContacts(safeSourceData(row.sourceDataJson), row.websiteUrl ?? "");
      const candidate = evaluatePartnerDuplicateCandidate({
        resourceType: "DIRECTORY_PROFILE",
        incoming: profile.values,
        categoryOrType: profile.categoryOrType,
        canonicalId: row.id,
        name: row.name,
        categoryOrTypeCandidate: row.category,
        city: row.city,
        address: row.address,
        websiteUrl: contacts.website,
        publicPhone: contacts.phone,
        publicEmail: contacts.email,
        registrationNumber: "",
        status: row.status,
        slug: row.slug,
        published: row.status === "published",
      });
      if (candidate) items.push(candidate);
    }
  } else {
    const rows = await db.prepare(`
      SELECT o.id,o.name,o.type,
        COALESCE(l.city,o.city,'') city,COALESCE(l.address,o.address,'') address,
        o.website_url websiteUrl,o.public_phone publicPhone,o.public_email publicEmail,
        o.registration_number registrationNumber,o.status,o.slug,o.published_at publishedAt
      FROM help_organizations o
      LEFT JOIN organization_locations l ON l.id=(
        SELECT x.id FROM organization_locations x
        WHERE x.organization_id=o.id
        ORDER BY x.is_primary DESC,x.sort_order ASC,x.id ASC LIMIT 1
      )
      WHERE o.status<>'ARCHIVED'
      ORDER BY o.id DESC
    `).all<HelpCandidateRow>();
    for (const row of rows.results) {
      const candidate = evaluatePartnerDuplicateCandidate({
        resourceType: "HELP_ORGANIZATION",
        incoming: profile.values,
        categoryOrType: profile.categoryOrType,
        canonicalId: row.id,
        name: row.name,
        categoryOrTypeCandidate: row.type,
        city: row.city,
        address: row.address,
        websiteUrl: row.websiteUrl ?? "",
        publicPhone: row.publicPhone ?? "",
        publicEmail: row.publicEmail ?? "",
        registrationNumber: row.registrationNumber ?? "",
        status: row.status,
        slug: row.slug,
        published: row.status === "PUBLISHED" && Boolean(row.publishedAt),
      });
      if (candidate) items.push(candidate);
    }
  }
  const candidates = sortCandidates(items);
  const confidence: PartnerDuplicateConfidence = candidates.some((item) => item.confidence === "HIGH")
    ? "HIGH"
    : candidates.some((item) => item.confidence === "MEDIUM") ? "MEDIUM" : "NONE";
  return { confidence, candidates, strongest: candidates[0] ?? null };
}

export function partnerSafeDuplicateCandidate(candidate: PartnerDuplicateCandidate) {
  return {
    resourceType: candidate.resourceType,
    canonicalId: candidate.canonicalId,
    name: candidate.name,
    categoryOrType: candidate.categoryOrType,
    city: candidate.city,
    status: candidate.status,
    publicHref: candidate.publicHref,
    claimHref: candidate.claimHref,
    confidence: candidate.confidence,
    reasons: candidate.reasons,
  };
}

export async function scanPartnerNewProfileForAccount(input: {
  accountId: string;
  resourceType: unknown;
  profile: unknown;
  database?: D1Database;
}) {
  if (!isPartnerNewProfileResourceType(input.resourceType)) {
    throw new PartnerNewProfileError("Nepodporovaný typ nového profilu.");
  }
  const db = database(input.database);
  const account = await getPartnerAccountById(input.accountId, db);
  if (!account || account.status !== "ACTIVE") throw new PartnerNewProfileError("Partner účet musí byť aktívny.", 403);
  const normalized = normalizePartnerNewProfile(input.resourceType, input.profile);
  const scan = await scanPartnerNewProfileDuplicates(normalized, db);
  return {
    profile: normalized,
    scan,
    partnerCandidates: scan.candidates.map(partnerSafeDuplicateCandidate),
    identityFingerprint: await partnerNewProfileIdentityFingerprint(normalized),
  };
}

function activeStatus(status: string) {
  return status === "SUBMITTED" || status === "PENDING_REVIEW" || status === "QUARANTINED";
}

function isDedupeError(error: unknown) {
  return /partner_new_profile_active_identity_unique|UNIQUE constraint failed: partner_new_profile_metadata/i
    .test(error instanceof Error ? error.message : String(error));
}

export async function submitPartnerNewProfile(input: {
  accountId: string;
  resourceType: unknown;
  profile: unknown;
  confirmDuplicate?: boolean;
  mediaAssetId?: unknown;
  database?: D1Database;
  hashKey?: string;
  now?: Date;
}) {
  const db = database(input.database);
  const result = await scanPartnerNewProfileForAccount({
    accountId: input.accountId,
    resourceType: input.resourceType,
    profile: input.profile,
    database: db,
  });
  if (result.scan.confidence === "HIGH" && input.confirmDuplicate !== true) {
    throw new PartnerNewProfileError(
      "Našli sme profil, ktorý môže patriť vám.",
      409,
      "DUPLICATE_CONFIRMATION_REQUIRED",
      { candidates: result.partnerCandidates },
    );
  }
  const hashKey = input.hashKey ?? (env as unknown as RuntimeBindings).PII_HASH_KEY?.trim();
  if (!hashKey) throw new PartnerNewProfileError("Bezpečnostná konfigurácia nie je dostupná.", 503);
  await enforcePartnerNewProfileRateLimit({
    database: db,
    accountId: input.accountId,
    identityFingerprint: result.identityFingerprint,
    hashKey,
    now: input.now,
  });

  const existing = await db.prepare(`
    SELECT m.submission_id id,s.status
    FROM partner_new_profile_metadata m
    JOIN moderation_submissions s ON s.id=m.submission_id
    WHERE m.partner_account_id=?1 AND m.identity_fingerprint=?2 AND m.dedupe_active=1
    LIMIT 1
  `).bind(input.accountId, result.identityFingerprint).first<{id:string;status:string}>();
  if (existing && activeStatus(existing.status)) {
    throw new PartnerNewProfileError("Rovnaký návrh nového profilu už čaká na spracovanie.", 409, "ACTIVE_DUPLICATE_SUBMISSION");
  }

  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const id = crypto.randomUUID();
  const strongest = result.scan.strongest;
  const riskFlags = result.scan.confidence === "HIGH"
    ? ["LIKELY_DUPLICATE"]
    : result.scan.confidence === "MEDIUM" ? ["POSSIBLE_DUPLICATE"] : [];
  const notificationId = crypto.randomUUID();
  const expiresAt = new Date(now.getTime() + 30*24*60*60*1000).toISOString();
  const patch = result.profile.values;
  const mediaAssetId = normalizePartnerMediaId(input.mediaAssetId);
  const changedFields = [...Object.keys(patch), ...(mediaAssetId ? ["image"] : [])];

  const statements = [
    db.prepare(`
      INSERT INTO moderation_submissions(
        id,resource_type,subject_id,operation,status,submitter_type,submitter_ref,
        proposed_patch_json,risk_flags_json,media_asset_id,duplicate_resource_type,duplicate_subject_id,created_at,updated_at
      ) VALUES(?1,?2,NULL,'CREATE','SUBMITTED','PARTNER_ACCOUNT',?3,?4,?5,?6,?7,?8,?9,?9)
    `).bind(
      id,result.profile.resourceType,input.accountId,JSON.stringify(patch),JSON.stringify(riskFlags),mediaAssetId,
      strongest?.resourceType ?? null,strongest ? String(strongest.canonicalId) : null,nowIso,
    ),
    db.prepare(`
      INSERT INTO partner_new_profile_metadata(
        submission_id,partner_account_id,intended_resource_type,display_name,category_or_type,
        identity_fingerprint,duplicate_confidence,duplicate_candidates_json,dedupe_active,created_at
      ) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,1,?9)
    `).bind(
      id,input.accountId,result.profile.resourceType,result.profile.displayName,result.profile.categoryOrType,
      result.identityFingerprint,result.scan.confidence,JSON.stringify(result.scan.candidates),nowIso,
    ),
    db.prepare(`
      INSERT INTO moderation_events(
        id,submission_id,resource_type,subject_id,action,actor_type,actor_ref,
        from_status,to_status,changed_fields_json,created_at
      ) VALUES(?1,?2,?3,NULL,'SUBMISSION_CREATED','PARTNER',?4,NULL,'SUBMITTED',?5,?6)
    `).bind(crypto.randomUUID(),id,result.profile.resourceType,input.accountId,JSON.stringify(changedFields),nowIso),
    db.prepare(`
      INSERT INTO partner_audit_events(id,actor_type,actor_ref,action,target_type,target_id,metadata_json,created_at)
      VALUES(?1,'PARTNER',?2,'NEW_PROFILE_SUBMITTED','MODERATION_SUBMISSION',?3,?4,?5)
    `).bind(
      crypto.randomUUID(),`partner:${input.accountId}`,id,
      JSON.stringify({resourceType:result.profile.resourceType,duplicateConfidence:result.scan.confidence}),
      nowIso,
    ),
    db.prepare(`
      INSERT OR IGNORE INTO partner_notification_outbox(
        id,partner_account_id,notification_type,dedupe_key,status,encrypted_secret,expires_at,attempts,created_at,updated_at
      ) VALUES(?1,?2,'NEW_PROFILE_SUBMITTED',?3,'PENDING',NULL,?4,0,?5,?5)
    `).bind(notificationId,input.accountId,`partner-new-profile-submitted/${id}`,expiresAt,nowIso),
  ];

  try {
    await db.batch(statements);
  } catch (error) {
    if (isDedupeError(error)) {
      throw new PartnerNewProfileError("Rovnaký návrh nového profilu už čaká na spracovanie.",409,"ACTIVE_DUPLICATE_SUBMISSION");
    }
    if (/invalid partner media attachment|moderation_submissions_media_asset_unique/i.test(String(error))) {
      throw new PartnerNewProfileError("Priložený obrázok už nie je platný pre túto žiadosť.",409,"INVALID_MEDIA");
    }
    throw error;
  }

  try {
    await enqueueAdminNotificationEvent(db, {
      eventType: "partner_new_profile_submitted",
      sourceType: "PARTNER_NEW_PROFILE_REVIEW",
      resourceType: "partner_new_profile",
      resourceRef: id,
      actorType: "PARTNER",
      actorRef: `partner:${input.accountId}`,
      targetUrl: `/admin/partners/submissions/${id}`,
      title: "Partner navrhol nový profil",
      body: `${result.profile.displayName} čaká na kontrolu.`,
      tag: `partner-new-profile-${id}`,
      dedupeKey: `partner-new-profile/${id}`,
    }, now);
  } catch (error) {
    console.error(JSON.stringify({ event: "partner_new_profile_admin_push_enqueue", submissionId: id, result: "failed", error: error instanceof Error ? error.message : "unknown" }));
  }

  return {
    id,
    resourceType: result.profile.resourceType,
    status: "SUBMITTED" as const,
    displayName: result.profile.displayName,
    duplicateConfidence: result.scan.confidence,
    createdAt: nowIso,
  };
}

function statusLabel(status: string) {
  if (status === "SUBMITTED" || status === "PENDING_REVIEW") return "Čaká na kontrolu";
  if (status === "QUARANTINED") return "Vyžaduje dodatočnú kontrolu";
  if (status === "APPROVED") return "Schválené";
  if (status === "REJECTED") return "Zamietnuté";
  return "Zrušené";
}

export async function listPartnerNewProfiles(accountId: string, dbInput?: D1Database) {
  const db = database(dbInput);
  const result = await db.prepare(`
    SELECT s.id,s.status,s.rejection_reason_code rejectionReasonCode,s.created_at createdAt,s.updated_at updatedAt,
      m.intended_resource_type resourceType,m.display_name displayName,m.category_or_type categoryOrType,
      m.duplicate_confidence duplicateConfidence,m.resolution_type resolutionType,
      m.resolved_resource_id resolvedResourceId,m.resolved_canonical_id resolvedCanonicalId,
      d.slug directorySlug,d.category directoryCategory,o.slug organizationSlug,
      COALESCE(d.status,o.status) canonicalStatus
    FROM partner_new_profile_metadata m
    JOIN moderation_submissions s ON s.id=m.submission_id
    LEFT JOIN directory_profiles d ON m.intended_resource_type='DIRECTORY_PROFILE' AND d.id=m.resolved_canonical_id
    LEFT JOIN help_organizations o ON m.intended_resource_type='HELP_ORGANIZATION' AND o.id=m.resolved_canonical_id
    WHERE m.partner_account_id=?1
    ORDER BY s.created_at DESC,s.id DESC LIMIT 200
  `).bind(accountId).all<{
    id:string;status:string;rejectionReasonCode:string|null;createdAt:string;updatedAt:string;
    resourceType:PartnerNewProfileResourceType;displayName:string;categoryOrType:string;
    duplicateConfidence:PartnerDuplicateConfidence;resolutionType:"CREATED_NEW"|"LINKED_EXISTING"|null;
    resolvedResourceId:string|null;resolvedCanonicalId:number|null;directorySlug:string|null;directoryCategory:string|null;
    organizationSlug:string|null;canonicalStatus:string|null;
  }>();
  return result.results.map((row)=>({
    ...row,
    statusLabel: statusLabel(row.status),
    rejectionReason: publicPartnerProfileChangeReason(row.rejectionReasonCode),
    duplicateWarning: row.duplicateConfidence === "HIGH"
      ? "Pri návrhu sa našiel silný možný existujúci profil."
      : row.duplicateConfidence === "MEDIUM" ? "Pri návrhu sa našiel možný podobný profil." : null,
    canonicalHref: row.resolvedCanonicalId
      ? row.resourceType === "DIRECTORY_PROFILE" && row.directorySlug && row.directoryCategory
        ? `/adresar/${row.directoryCategory}/${row.directorySlug}`
        : row.resourceType === "HELP_ORGANIZATION" && row.organizationSlug ? `/organizacie/${row.organizationSlug}` : null
      : null,
    canWithdraw: activeStatus(row.status),
  }));
}

export async function withdrawPartnerNewProfile(input:{
  accountId:string;
  id:string;
  database?:D1Database;
  now?:Date;
}) {
  const db=database(input.database);
  const row=await db.prepare(`
    SELECT s.status,m.partner_account_id accountId
    FROM moderation_submissions s
    JOIN partner_new_profile_metadata m ON m.submission_id=s.id
    WHERE s.id=?1 LIMIT 1
  `).bind(input.id).first<{status:string;accountId:string}>();
  if(!row||row.accountId!==input.accountId)throw new PartnerNewProfileError("Návrh sa nenašiel.",404);
  if(!isFoundationSubmissionStatus(row.status)||!canTransitionModerationSubmission(row.status,"WITHDRAWN")){
    throw new PartnerNewProfileError("Tento návrh už nie je možné zrušiť.",409);
  }
  const now=input.now??new Date(),nowIso=now.toISOString(),actorRef=`partner:${input.accountId}`;
  await applyAtomicModerationTransition(db,{
    id:input.id,
    expectedStatus:row.status as FoundationSubmissionStatus,
    toStatus:"WITHDRAWN",
    actorType:"PARTNER",
    actorRef,
    eventId:crypto.randomUUID(),
    changedFieldsJson:JSON.stringify(["status"]),
    now:nowIso,
    extraStatements:[
    terminalPartnerMediaStatement({database:db,submissionId:input.id,state:"ORPHANED",nowIso,actorRef}),
      db.prepare(`
        UPDATE partner_new_profile_metadata SET dedupe_active=0
        WHERE submission_id=?1 AND EXISTS(
          SELECT 1 FROM moderation_submissions WHERE id=?1 AND status='WITHDRAWN' AND updated_at=?2
        )
      `).bind(input.id,nowIso),
      db.prepare(`
        INSERT INTO partner_audit_events(id,actor_type,actor_ref,action,target_type,target_id,metadata_json,created_at)
        SELECT ?1,'PARTNER',?2,'NEW_PROFILE_WITHDRAWN','MODERATION_SUBMISSION',?3,'{}',?4
        WHERE EXISTS(
          SELECT 1 FROM moderation_submissions WHERE id=?3 AND status='WITHDRAWN' AND updated_at=?4
        )
      `).bind(crypto.randomUUID(),actorRef,input.id,nowIso),
    ],
  });
  return {id:input.id,status:"WITHDRAWN" as const};
}
