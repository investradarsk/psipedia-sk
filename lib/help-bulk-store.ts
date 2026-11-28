import { assertBulkPublicationIdentities, publicationV3Enabled, bulkPublicationGuardStatement } from "./publication-readiness-v3.ts";
import { bulkHelpStatusSql, resolveHelpBulkSelection, validateHelpBulkApply } from "@/lib/admin-help-bulk";
import { getD1Binding } from "@/lib/help-store";

function database() {
  const db = getD1Binding();
  if (!db) throw new Error("Databáza pomoci psom zatiaľ nie je pripojená.");
  return db;
}

export async function preflightManagedHelpBulk(input: unknown) {
  const db=database();
  const preview=await resolveHelpBulkSelection(db,input);
  if(preview.targetStatus==="published")await assertBulkPublicationIdentities(db,"help-cases",preview.items.map(item=>item.id));
  return preview;
}

export async function applyManagedHelpBulk(input: unknown, editorEmail: string) {
  const { items, status } = validateHelpBulkApply(input);
  if(status==="published")await assertBulkPublicationIdentities(database(),"help-cases",items.map(item=>item.id));
  const now = new Date().toISOString();
  const db=database();
  const statement=db.prepare(bulkHelpStatusSql)
    .bind(JSON.stringify(items), status, now, editorEmail, status, now, status, items.length);
  const result=publicationV3Enabled()?(await db.batch<{id:number}>([statement,bulkPublicationGuardStatement(db,"help",items.map(item=>item.id),status==="published",now)]))[0]:await statement.all<{id:number}>();
  if (result.results.length !== items.length) {
    throw new Error("Výber sa medzičasom zmenil alebo niektorý záznam už nespĺňa podmienky publikovania. Žiadny záznam nebol zmenený; obnov zoznam a potvrď nový výber.");
  }
  return { requested: items.length, changed: result.results.length };
}
