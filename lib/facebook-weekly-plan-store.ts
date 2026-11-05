import { env } from "cloudflare:workers";
import { facebookPlanAddDays, type FacebookPlanKey } from "@/lib/facebook-weekly-plan";

type Database = Pick<D1Database, "prepare">;
type Row = { slot_date: string; slot_key: FacebookPlanKey };

function facebookPlanDb(): Database {
  const database = (env as unknown as { DB?: D1Database }).DB;
  if (!database) throw new Error("Databáza kalendára nie je dostupná.");
  return database;
}

export async function listFacebookPlanMarks(
  weekStart: string,
  database: Database = facebookPlanDb(),
): Promise<Row[]> {
  const ending = facebookPlanAddDays(weekStart, 13);
  const result = await database.prepare(
    "SELECT slot_date, slot_key FROM facebook_weekly_plan_marks " +
    "WHERE slot_date >= ? AND slot_date <= ? ORDER BY slot_date, slot_key"
  ).bind(weekStart, ending).all<Row>();
  return result.results;
}

/** Manual checklist only: never creates, approves or publishes Facebook posts. */
export async function setFacebookPlanMark(
  date: string,
  slotKey: FacebookPlanKey,
  planned: boolean,
  actor: string,
  database: Database = facebookPlanDb(),
): Promise<void> {
  if (planned) {
    await database.prepare(
      "INSERT INTO facebook_weekly_plan_marks (slot_date, slot_key, marked_at, marked_by) " +
      "VALUES (?, ?, ?, ?) ON CONFLICT(slot_date, slot_key) DO UPDATE SET " +
      "marked_at = excluded.marked_at, marked_by = excluded.marked_by"
    ).bind(date, slotKey, new Date().toISOString(), actor).run();
  } else {
    await database.prepare(
      "DELETE FROM facebook_weekly_plan_marks WHERE slot_date = ? AND slot_key = ?"
    ).bind(date, slotKey).run();
  }
}
