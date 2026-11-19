/**
 * Directory 0170: a populated SQL contact column is authoritative.
 * NULL means not manually migrated; empty string is an intentional clear.
 * Keep historical source_data_json for other editorial metadata and as a
 * fallback only until that particular SQL column is populated.
 */
import { readDirectoryPublicContacts } from "./directory-profile-metadata.ts";

export const DIRECTORY_SQL_CONTACT_KEYS = {
  website_url: ["Web", "Webstránka"],
  public_phone: ["Telefón", "Telefon", "phone"],
  public_email: ["E-mail", "Email", "email"],
  facebook_url: ["Facebook"],
  instagram_url: ["Instagram"],
} as const;

export type DirectorySqlContactColumns = Partial<
  Record<keyof typeof DIRECTORY_SQL_CONTACT_KEYS, string | null | undefined>
>;

/**
 * Materialize a read view, never mutate the persisted source JSON.
 * Removing all aliases on explicit clear prevents a legacy import alias from
 * resurrecting a value that the owner intentionally removed.
 */
export function overlayDirectorySqlContacts<T extends Record<string, string | number | null>>(
  legacy: T | null,
  sql: DirectorySqlContactColumns,
): T | null {
  if (!legacy && (Object.keys(DIRECTORY_SQL_CONTACT_KEYS) as Array<keyof DirectorySqlContactColumns>)
      .every(key => sql[key] == null)) return null;
  const result: Record<string, string | number | null> = { ...(legacy ?? {}) };
  for (const [column, aliases] of Object.entries(DIRECTORY_SQL_CONTACT_KEYS)) {
    const current = sql[column as keyof DirectorySqlContactColumns];
    if (current == null) continue;
    for (const key of aliases) delete result[key];
    if (current !== "") result[aliases[0]] = current;
  }
  return result as T;
}


/**
 * Use this for consumers that query a raw directory_profiles row instead of
 * going through directory-store. SQL is authoritative for all five contacts.
 * NULL (not yet migrated) keeps the historical JSON value visible.
 */
export function readDirectorySqlBackedContacts(
  source: Record<string, string | number | null> | null | undefined,
  row: object,
): ReturnType<typeof readDirectoryPublicContacts> {
  const columns = row as DirectorySqlContactColumns & { website_url?: string | null };
  const projected = overlayDirectorySqlContacts(source ?? null, columns);
  return readDirectoryPublicContacts(projected, columns.website_url ?? "");
}
