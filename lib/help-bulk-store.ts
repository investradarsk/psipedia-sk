import { bulkHelpStatusSql, resolveHelpBulkSelection, validateHelpBulkApply } from "@/lib/admin-help-bulk";
import { getD1Binding } from "@/lib/help-store";

function database() {
  const db = getD1Binding();
  if (!db) throw new Error("Databáza pomoci psom zatiaľ nie je pripojená.");
  return db;
}

export async function preflightManagedHelpBulk(input: unknown) {
  return resolveHelpBulkSelection(database(), input);
}

export async function applyManagedHelpBulk(input: unknown, editorEmail: string) {
  const { items, status } = validateHelpBulkApply(input);
  const now = new Date().toISOString();
  const result = await database().prepare(bulkHelpStatusSql)
    .bind(JSON.stringify(items), status, now, editorEmail, status, now, status, items.length)
    .all<{ id: number }>();
  if (result.results.length !== items.length) {
    throw new Error("Výber sa medzičasom zmenil alebo niektorý záznam už nespĺňa podmienky publikovania. Žiadny záznam nebol zmenený; obnov zoznam a potvrď nový výber.");
  }
  return { changed: result.results.length };
}
