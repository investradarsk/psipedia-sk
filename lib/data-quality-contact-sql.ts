/**
 * SQL counterpart to readDirectoryPublicContacts() in directory-profile-metadata.
 *
 * A blank contact alias MUST NOT hide a nonblank fallback alias or website_url.
 * This affects Data Quality issue counts, filters, priorities and pagination.
 * Read-only fragments use fixed server-owned JSON property names.
 */
const validSourceJson =
  "CASE WHEN json_valid(COALESCE(source_data_json, '')) THEN source_data_json ELSE '{}' END";

type ContactField = "phone" | "email" | "website";

const aliases: Record<ContactField, readonly string[]> = {
  phone: ["Telefón", "Telefon", "phone"],
  email: ["E-mail", "Email", "email"],
  website: ["Web", "Webstránka"],
};

function normalizedJsonContact(key: string): string {
  // No user-provided names; match JS contact reading of nonblank alias values.
  const quote = String.fromCharCode(34);
  return "NULLIF(trim(CAST(json_extract(" + validSourceJson
    + ", '$." + quote + key + quote + "') AS TEXT)), '')";
}

export function missingDirectoryContactSql(field: ContactField): string {
  const fallbacks = aliases[field].map(normalizedJsonContact);
  if (field === "website") fallbacks.push("NULLIF(trim(website_url), '')");
  return "COALESCE(" + fallbacks.join(", ") + ", '') = ''";
}

export const RAW_MISSING_PHONE_SQL = missingDirectoryContactSql("phone");
export const RAW_MISSING_EMAIL_SQL = missingDirectoryContactSql("email");
export const RAW_MISSING_WEBSITE_SQL = missingDirectoryContactSql("website");
