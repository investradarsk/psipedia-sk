export const OUTREACH_ENTITY_TYPES = [
  "DIRECTORY_PROFILE",
  "HELP_ORGANIZATION",
  "MANAGED_EVENT",
  "HELP_CASE",
] as const;

export type OutreachEntityType = (typeof OUTREACH_ENTITY_TYPES)[number];
export type OutreachCampaignStatus =
  | "DRAFT"
  | "READY"
  | "SENDING"
  | "SENT"
  | "PAUSED"
  | "COMPLETED"
  | "CANCELLED";
export type OutreachRecipientState =
  | "QUEUED"
  | "SENDING"
  | "SENT"
  | "DELIVERED"
  | "FAILED"
  | "BOUNCED"
  | "SUPPRESSED";

export type OutreachSelection = {
  entityTypes: OutreachEntityType[];
  status: "all" | "published" | "draft";
  region: string;
  verification: "all" | "verified" | "unverified";
  contactHistory: "all" | "never" | "contacted";
  limit: number;
};

export type OutreachEntityCandidate = {
  entityType: OutreachEntityType;
  entityId: string;
  entityName: string;
  profileUrl: string;
  region: string;
  rawEmail: string;
  verified: boolean;
  publicSnapshot: Record<string, unknown>;
};

export type OutreachRecipientPreview = {
  recipientEmail: string;
  normalizedEmail: string;
  entities: Array<Omit<OutreachEntityCandidate, "rawEmail">>;
};

export type OutreachDryRun = {
  selectedEntityCount: number;
  uniqueRecipientCount: number;
  deduplicatedCount: number;
  suppressedCount: number;
  invalidEmailCount: number;
  recipients: OutreachRecipientPreview[];
};

export const DEFAULT_OUTREACH_SUBJECT = "Prosba o kontrolu profilu na Psipedia.sk";
export const DEFAULT_OUTREACH_BODY = [
  "Dobrý deň,",
  "",
  "na Psipedia.sk evidujeme verejný profil alebo profily, pri ktorých je uvedený tento kontaktný e-mail.",
  "",
  "{profiles}",
  "",
  "Prosíme o krátku kontrolu údajov. Opravy alebo chýbajúce informácie môžete navrhnúť cez tento bezpečný odkaz:",
  "{verification_url}",
  "",
  "Návrh nič automaticky neprepíše ani nezverejní. Každú zmenu najprv skontroluje redakcia Psipedia.",
  "",
  "Ak si ďalšie podobné oslovenia neželáte, môžete sa odhlásiť tu:",
  "{unsubscribe_url}",
  "",
  "Ďakujeme,",
  "Psipedia.sk",
].join("\n");

const EMAIL_PATTERN = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

export function normalizeOutreachEmail(value: string) {
  return value.normalize("NFKC").trim().toLowerCase();
}

export function isValidOutreachEmail(value: string) {
  const normalized = normalizeOutreachEmail(value);
  return normalized.length <= 254 && EMAIL_PATTERN.test(normalized);
}

export function splitOutreachEmails(value: string | null | undefined) {
  const raw = value?.trim() ?? "";
  if (!raw) return [];
  return raw
    .split(/[;,\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function directoryOutreachEmailValues(sourceDataJson: string) {
  try {
    const source = asRecord(JSON.parse(sourceDataJson));
    if (!source) return [];
    for (const key of ["E-mail", "Email", "email"]) {
      const value = source[key];
      if (typeof value === "string" && value.trim()) return splitOutreachEmails(value);
    }
    return [];
  } catch {
    return [];
  }
}

export function parseOutreachSelection(value: unknown): OutreachSelection {
  const input = asRecord(value) ?? {};
  const requested = Array.isArray(input.entityTypes) ? input.entityTypes : [];
  const entityTypes = requested.filter(
    (item): item is OutreachEntityType =>
      typeof item === "string" && (OUTREACH_ENTITY_TYPES as readonly string[]).includes(item),
  );
  const status = input.status === "published" || input.status === "draft" ? input.status : "all";
  const verification = input.verification === "verified" || input.verification === "unverified"
    ? input.verification
    : "all";
  const contactHistory = input.contactHistory === "never" || input.contactHistory === "contacted"
    ? input.contactHistory
    : "all";
  const numericLimit = typeof input.limit === "number" ? input.limit : Number(input.limit ?? 250);
  const limit = Number.isFinite(numericLimit)
    ? Math.min(500, Math.max(1, Math.trunc(numericLimit)))
    : 250;
  const region = typeof input.region === "string" ? input.region.trim().slice(0, 120) : "";
  return {
    entityTypes: entityTypes.length ? [...new Set(entityTypes)] : ["HELP_ORGANIZATION", "DIRECTORY_PROFILE"],
    status,
    region,
    verification,
    contactHistory,
    limit,
  };
}

export function filterOutreachHistory(
  candidates: OutreachEntityCandidate[],
  contactedEmails: Set<string>,
  contactHistory: OutreachSelection["contactHistory"],
) {
  if (contactHistory === "all") return candidates;
  return candidates.filter((candidate) => {
    const normalized = normalizeOutreachEmail(candidate.rawEmail);
    const contacted = contactedEmails.has(normalized);
    return contactHistory === "contacted" ? contacted : !contacted;
  });
}

export function buildOutreachDryRun(
  candidates: OutreachEntityCandidate[],
  suppressedEmails: Set<string>,
): OutreachDryRun {
  const entityKeys = new Set<string>();
  const valid: OutreachEntityCandidate[] = [];
  let invalidEmailCount = 0;

  for (const candidate of candidates) {
    entityKeys.add(candidate.entityType + ":" + candidate.entityId);
    if (!isValidOutreachEmail(candidate.rawEmail)) {
      invalidEmailCount += 1;
      continue;
    }
    valid.push(candidate);
  }

  const grouped = new Map<string, OutreachRecipientPreview>();
  for (const candidate of valid) {
    const normalizedEmail = normalizeOutreachEmail(candidate.rawEmail);
    const existing = grouped.get(normalizedEmail);
    const entity = {
      entityType: candidate.entityType,
      entityId: candidate.entityId,
      entityName: candidate.entityName,
      profileUrl: candidate.profileUrl,
      region: candidate.region,
      verified: candidate.verified,
      publicSnapshot: candidate.publicSnapshot,
    };
    if (existing) {
      const duplicateEntity = existing.entities.some(
        (item) => item.entityType === entity.entityType && item.entityId === entity.entityId,
      );
      if (!duplicateEntity) existing.entities.push(entity);
    } else {
      grouped.set(normalizedEmail, {
        recipientEmail: candidate.rawEmail.trim(),
        normalizedEmail,
        entities: [entity],
      });
    }
  }

  const suppressedCount = [...grouped.keys()].filter((email) => suppressedEmails.has(email)).length;
  const recipients = [...grouped.values()]
    .filter((recipient) => !suppressedEmails.has(recipient.normalizedEmail))
    .slice(0, 500);

  return {
    selectedEntityCount: entityKeys.size,
    uniqueRecipientCount: recipients.length,
    deduplicatedCount: Math.max(0, valid.length - grouped.size),
    suppressedCount,
    invalidEmailCount,
    recipients,
  };
}

export function maskOutreachEmail(value: string) {
  const [local, domain] = normalizeOutreachEmail(value).split("@");
  if (!local || !domain) return "skrytý e-mail";
  const prefix = local.length <= 2 ? local.slice(0, 1) : local.slice(0, 2);
  return prefix + "•••@" + domain;
}

function replaceAllLiteral(value: string, search: string, replacement: string) {
  return value.split(search).join(replacement);
}

export function renderOutreachText(input: {
  subjectTemplate: string;
  bodyTemplate: string;
  entities: Array<{ entityName: string; profileUrl: string }>;
  verificationUrl: string;
  unsubscribeUrl: string;
}) {
  const profileLines = input.entities
    .map((entity) => "- " + entity.entityName + ": " + entity.profileUrl)
    .join("\n");
  let body = input.bodyTemplate || DEFAULT_OUTREACH_BODY;
  body = replaceAllLiteral(body, "{profiles}", profileLines);
  body = replaceAllLiteral(body, "{verification_url}", input.verificationUrl);
  body = replaceAllLiteral(body, "{unsubscribe_url}", input.unsubscribeUrl);
  const subject = (input.subjectTemplate || DEFAULT_OUTREACH_SUBJECT)
    .replace(/[\r\n]+/g, " ")
    .trim()
    .slice(0, 240);
  return { subject, text: body.trim().slice(0, 20_000) };
}

export function escapeOutreachHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function outreachTextToHtml(value: string) {
  return value
    .split("\n")
    .map((line) => line ? "<p>" + escapeOutreachHtml(line) + "</p>" : "<br>")
    .join("");
}
