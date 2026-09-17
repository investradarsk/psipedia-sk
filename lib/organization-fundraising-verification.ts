import type { AdoptionD1Database } from "./adoption-store.ts";
import {
  canTransitionOrganizationFundraisingVerification,
  isValidOrganizationFundraisingDestination,
  validateFundraisingUrl,
  type OrganizationFundraisingVerificationStatus,
} from "./organization-fundraising-contract.ts";
import {
  getOrganizationFundraisingAdminOrganization,
  getOrganizationFundraisingMethodAdmin,
  requireOrganizationFundraisingD1,
} from "./organization-fundraising-admin-store.ts";
import {
  OrganizationFundraisingConcurrentEditError,
  OrganizationFundraisingLifecycleError,
} from "./organization-fundraising-admin-write.ts";

type RunResult = {
  meta?: { changes?: number };
  changes?: number;
};

export type OrganizationFundraisingVerificationAction =
  | "verify"
  | "unverify"
  | "mark-stale"
  | "reject";

export type OrganizationFundraisingVerificationCommand = {
  action: OrganizationFundraisingVerificationAction;
  expectedVersion: number;
  verificationSourceUrl: string | null;
  verificationExpiresAt: string | null;
};

export class OrganizationFundraisingVerificationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrganizationFundraisingVerificationValidationError";
  }
}

export class OrganizationFundraisingVerificationTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrganizationFundraisingVerificationTransitionError";
  }
}

export function isOrganizationFundraisingVerificationConflict(error: unknown) {
  return error instanceof OrganizationFundraisingConcurrentEditError
    || error instanceof OrganizationFundraisingLifecycleError
    || error instanceof OrganizationFundraisingVerificationTransitionError;
}

const ACTION_TARGETS: Readonly<Record<OrganizationFundraisingVerificationAction, OrganizationFundraisingVerificationStatus>> = {
  verify: "VERIFIED",
  unverify: "UNVERIFIED",
  "mark-stale": "STALE",
  reject: "REJECTED",
};

function requireRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new OrganizationFundraisingVerificationValidationError("Verification payload musí byť objekt.");
  }
  return value as Record<string, unknown>;
}

function normalizeAction(value: unknown): OrganizationFundraisingVerificationAction {
  if (value === "verify" || value === "unverify" || value === "mark-stale" || value === "reject") return value;
  throw new OrganizationFundraisingVerificationValidationError("Neplatná verification akcia.");
}

function normalizeExpectedVersion(value: unknown) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new OrganizationFundraisingConcurrentEditError();
  }
  return value;
}

function normalizeOptionalVerificationSource(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") {
    throw new OrganizationFundraisingVerificationValidationError("Verification source musí byť URL alebo prázdna hodnota.");
  }
  const validation = validateFundraisingUrl(value.trim());
  if (!validation.valid) {
    throw new OrganizationFundraisingVerificationValidationError(`Verification source URL nie je bezpečná (${validation.reason}).`);
  }
  return validation.normalizedUrl;
}

function normalizeOptionalTimestamp(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") {
    throw new OrganizationFundraisingVerificationValidationError("Expirácia overenia musí byť timestamp alebo prázdna hodnota.");
  }
  const parsed = Date.parse(value.trim());
  if (!Number.isFinite(parsed)) {
    throw new OrganizationFundraisingVerificationValidationError("Expirácia overenia nemá platný timestamp.");
  }
  return new Date(parsed).toISOString();
}

export function normalizeOrganizationFundraisingVerificationCommand(
  value: unknown,
): OrganizationFundraisingVerificationCommand {
  const record = requireRecord(value);
  const action = normalizeAction(record.action);
  const command: OrganizationFundraisingVerificationCommand = {
    action,
    expectedVersion: normalizeExpectedVersion(record.expectedVersion),
    verificationSourceUrl: normalizeOptionalVerificationSource(record.verificationSourceUrl),
    verificationExpiresAt: normalizeOptionalTimestamp(record.verificationExpiresAt),
  };

  if (action !== "verify" && (command.verificationSourceUrl || command.verificationExpiresAt)) {
    throw new OrganizationFundraisingVerificationValidationError(
      "Verification metadata možno zadať iba pri explicitnej verify akcii.",
    );
  }
  return command;
}

function editorRef(editorEmail: string) {
  const normalized = editorEmail.trim().toLowerCase();
  if (!normalized) throw new Error("Chýba audit identita administrátora.");
  return normalized;
}

export async function changeOrganizationFundraisingVerificationFromAdmin(
  organizationId: number,
  methodId: number,
  command: OrganizationFundraisingVerificationCommand,
  editorEmail: string,
  database?: AdoptionD1Database,
  now = new Date(),
) {
  if (!Number.isSafeInteger(organizationId) || organizationId <= 0) return null;
  if (!Number.isSafeInteger(methodId) || methodId <= 0) return null;
  if (!Number.isSafeInteger(command.expectedVersion) || command.expectedVersion <= 0) {
    throw new OrganizationFundraisingConcurrentEditError();
  }

  const db = requireOrganizationFundraisingD1(database);
  const organization = await getOrganizationFundraisingAdminOrganization(organizationId, db);
  if (!organization) return null;
  if (organization.status === "ARCHIVED" || organization.archivedAt) {
    throw new OrganizationFundraisingLifecycleError("Archivovanej organizácii nemožno meniť fundraising verification.");
  }

  const existing = await getOrganizationFundraisingMethodAdmin(organizationId, methodId, db);
  if (!existing) return null;
  if (existing.archivedAt) {
    throw new OrganizationFundraisingLifecycleError("Archivovanej fundraising metóde nemožno meniť verification.");
  }
  if (existing.version !== command.expectedVersion) throw new OrganizationFundraisingConcurrentEditError();

  const target = ACTION_TARGETS[command.action];
  if (!canTransitionOrganizationFundraisingVerification(existing.verificationStatus, target)) {
    throw new OrganizationFundraisingVerificationTransitionError(
      `Verification prechod ${existing.verificationStatus} → ${target} contract nepovoľuje.`,
    );
  }
  if (command.action === "verify" && !isValidOrganizationFundraisingDestination(existing)) {
    throw new OrganizationFundraisingVerificationTransitionError(
      "Fundraising metódu nemožno overiť, kým jej canonical cieľ nespĺňa fundraising contract.",
    );
  }

  const timestamp = now.toISOString();
  const actor = editorRef(editorEmail);
  let result: RunResult;

  if (command.action === "verify") {
    result = await db.prepare(`
      UPDATE organization_fundraising_methods
      SET verification_status = 'VERIFIED', verified_at = ?, verified_by = ?, verification_source_url = ?,
        verification_expires_at = ?, version = version + 1, updated_at = ?, updated_by = ?
      WHERE id = ? AND organization_id = ? AND version = ? AND verification_status = ? AND archived_at IS NULL
        AND EXISTS (
          SELECT 1 FROM help_organizations
          WHERE id = ? AND status <> 'ARCHIVED' AND archived_at IS NULL
        )
    `).bind(
      timestamp,
      actor,
      command.verificationSourceUrl,
      command.verificationExpiresAt,
      timestamp,
      actor,
      methodId,
      organizationId,
      command.expectedVersion,
      existing.verificationStatus,
      organizationId,
    ).run() as RunResult;
  } else if (command.action === "mark-stale") {
    result = await db.prepare(`
      UPDATE organization_fundraising_methods
      SET verification_status = 'STALE', version = version + 1, updated_at = ?, updated_by = ?
      WHERE id = ? AND organization_id = ? AND version = ? AND verification_status = ? AND archived_at IS NULL
        AND EXISTS (
          SELECT 1 FROM help_organizations
          WHERE id = ? AND status <> 'ARCHIVED' AND archived_at IS NULL
        )
    `).bind(
      timestamp,
      actor,
      methodId,
      organizationId,
      command.expectedVersion,
      existing.verificationStatus,
      organizationId,
    ).run() as RunResult;
  } else {
    result = await db.prepare(`
      UPDATE organization_fundraising_methods
      SET verification_status = ?, verified_at = NULL, verified_by = NULL, verification_source_url = NULL,
        verification_expires_at = NULL, version = version + 1, updated_at = ?, updated_by = ?
      WHERE id = ? AND organization_id = ? AND version = ? AND verification_status = ? AND archived_at IS NULL
        AND EXISTS (
          SELECT 1 FROM help_organizations
          WHERE id = ? AND status <> 'ARCHIVED' AND archived_at IS NULL
        )
    `).bind(
      target,
      timestamp,
      actor,
      methodId,
      organizationId,
      command.expectedVersion,
      existing.verificationStatus,
      organizationId,
    ).run() as RunResult;
  }

  const changes = Number(result.meta?.changes ?? result.changes ?? 0);
  if (changes !== 1) throw new OrganizationFundraisingConcurrentEditError();
  return getOrganizationFundraisingMethodAdmin(organizationId, methodId, db);
}
