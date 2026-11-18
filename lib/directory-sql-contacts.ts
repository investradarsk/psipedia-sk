/**
 * Directory 0170: a populated SQL contact column is authoritative.
 * NULL means not manually migrated; empty string is an intentional clear.
 * Keep historical source_data_json for other editorial metadata and as a
 * fallback only until that particular SQL column is populated.
 */
export const DIRECTORY_SQL_CONTACT_KEYS = {
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
  if (!legacy && Object.values(sql).every(v => v == null)) return null;
  const result: Record<string, string | number | null> = { ...(legacy ?? {}) };
  for (const [column, aliases] of Object.entries(DIRECTORY_SQL_CONTACT_KEYS)) {
    const current = sql[column as keyof DirectorySqlContactColumns];
    if (current == null) continue;
    for (const key of aliases) delete result[key];
    if (current !== "") result[aliases[0]] = current;
  }
  return result as T;
}
