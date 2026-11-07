/**
 * Compatibility gate for review-only migration 0160.
 * This module is deliberately pure so old/partial/new physical schemas can
 * be tested without connecting to the production D1 database.
 */
export const EVENT_CONTACT_COLUMNS = ["contact_phone", "contact_email", "admission_fee"] as const;

export type ManagedEventContactValues = {
  contactPhone?: string | null;
  contactEmail?: string | null;
  admissionFee?: string;
};

/** Never silently ignore an entered contact or admission value. */
export function canWriteEventContactColumns(
  schemaColumns: readonly string[],
  values: ManagedEventContactValues,
): boolean {
  if (!schemaColumns.length) {
    throw new Error("Schéma podujatí nie je dostupná. Uloženie sa nevykonalo.");
  }
  const columns = new Set(schemaColumns);
  const found = EVENT_CONTACT_COLUMNS.filter((field) => columns.has(field)).length;
  if (found !== 0 && found !== EVENT_CONTACT_COLUMNS.length) {
    throw new Error("Databázová migrácia 0160 je neúplná. Uloženie sa nevykonalo.");
  }
  if (!found && (values.contactPhone?.trim() || values.contactEmail?.trim() || values.admissionFee?.trim())) {
    throw new Error("Verejné kontakty a vstupné zatiaľ nemožno uložiť: chýba schválená migrácia 0160. Ostatné údaje zostali bez zmeny.");
  }
  return found === EVENT_CONTACT_COLUMNS.length;
}
