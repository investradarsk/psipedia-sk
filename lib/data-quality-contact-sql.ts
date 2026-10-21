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

// SQLite trim() removes only U+0020 by default. Match String.trim() used by
// the canonical reader, including pasted line breaks and Unicode spaces.
const contactWhitespaceSql = "char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279)";

function normalizedContact(expression: string): string {
  return `NULLIF(trim(CAST(${expression} AS TEXT), ${contactWhitespaceSql}), '')`;
}

function normalizedJsonContact(key: string): string {
  // No user-provided names; match JS contact reading of nonblank alias values.
  return normalizedContact(`json_extract(${validSourceJson}, '$."${key}"')`);
}

export function missingDirectoryContactSql(field: ContactField): string {
  const fallbacks = aliases[field].map(normalizedJsonContact);
  if (field === "website") fallbacks.push(normalizedContact("website_url"));
  return "COALESCE(" + fallbacks.join(", ") + ", '') = ''";
}

export const RAW_MISSING_PHONE_SQL = missingDirectoryContactSql("phone");
export const RAW_MISSING_EMAIL_SQL = missingDirectoryContactSql("email");
export const RAW_MISSING_WEBSITE_SQL = missingDirectoryContactSql("website");
