import { env } from "cloudflare:workers";

type ReviewSettingsBindings = {
  DB?: D1Database;
  PROFILE_REVIEW_EMAIL_REQUIRED?: string;
};

function bindings() {
  return env as unknown as ReviewSettingsBindings;
}

function emergencyEmailRequired() {
  const value = bindings().PROFILE_REVIEW_EMAIL_REQUIRED;
  return value === "1" || value?.toLowerCase() === "true";
}

export async function readProfileReviewVerificationSettings(database = bindings().DB) {
  const locked = emergencyEmailRequired();
  try {
    const row = await database?.prepare(
      "SELECT email_required,updated_at FROM profile_review_verification_settings WHERE id=1",
    ).first<{ email_required: number; updated_at: string }>();
    if (row && (row.email_required === 0 || row.email_required === 1)) {
      return { available: true, locked, emailRequired: locked || row.email_required === 1, updatedAt: row.updated_at };
    }
  } catch {
    // Missing migration or a D1 failure must not weaken verification.
  }
  return { available: false, locked, emailRequired: true, updatedAt: null };
}

export async function profileReviewEmailRequired(database?: D1Database) {
  return (await readProfileReviewVerificationSettings(database)).emailRequired;
}

export async function saveProfileReviewVerificationSettings(emailRequired: boolean, actor: string, database = bindings().DB) {
  if (!database || emergencyEmailRequired()) throw new Error("Review verification settings unavailable");
  const row = await database.prepare(
    "UPDATE profile_review_verification_settings SET email_required=?1,updated_at=?2,updated_by=?3 WHERE id=1 RETURNING id",
  ).bind(emailRequired ? 1 : 0, new Date().toISOString(), actor).first<{ id: number }>();
  if (!row) throw new Error("Review verification settings not migrated");
}
