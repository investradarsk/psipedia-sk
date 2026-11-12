import { env } from "cloudflare:workers";
import {
  defaultFacebookWeeklyTemplate, validateFacebookWeeklyTemplate,
  type FacebookWeeklySlot,
} from "@/lib/facebook-weekly-template";
import { facebookPlanAddDays } from "@/lib/facebook-weekly-plan";

type Database = Pick<D1Database, "prepare">;
export type TemplateMark = { slot_date: string; slot_id: string };

export class FacebookTemplateConflict extends Error {
  constructor() { super("Plán bol upravený inde. Načítaj ho znova."); }
}

function db(): Database {
  const database = (env as unknown as { DB?: D1Database }).DB;
  if (!database) throw new Error("Databáza kalendára nie je dostupná.");
  return database;
}

/** Feature-detect new additive tables; old 0157 checklist remains functional. */
export async function readFacebookWeeklyTemplate(database: Database = db()) {
  try {
    const insert=expectedVersion===0;
  const row = insert
    ? await database.prepare(
      "INSERT INTO facebook_weekly_template(id,version,slots_json,updated_at,updated_by) "+
      "VALUES(1,1,?,?,?) ON CONFLICT(id) DO NOTHING RETURNING version",
    ).bind(JSON.stringify(slots),now,actor).first<{version:number}>()
    : await database.prepare(
      "UPDATE facebook_weekly_template SET slots_json=?,updated_at=?,updated_by=?,"+
      "version=version+1 WHERE id=1 AND version=? RETURNING version",
    ).bind(JSON.stringify(slots),now,actor,expectedVersion).first<{version:number}>();
  if (!row) throw new FacebookTemplateConflict();
  return {available:true,custom:true,version:row.version,slots};
}

export async function listFacebookTemplateMarks(
  weekStart:string,database:Database=db(),
): Promise<TemplateMark[]> {
  const result = await database.prepare(
    "SELECT slot_date,slot_id FROM facebook_weekly_template_marks "+
    "WHERE slot_date>=? AND slot_date<=? ORDER BY slot_date,slot_id",
  ).bind(weekStart,facebookPlanAddDays(weekStart,13)).all<TemplateMark>();
  return result.results;
}

export async function setFacebookTemplateMark(
  date:string,slotId:string,planned:boolean,actor:string,database:Database=db(),
) {
  const template=await readFacebookWeeklyTemplate(database);
  const weekday=(new Date(date+"T12:00:00Z").getUTCDay()+6)%7;
  if (!template.available || !template.custom ||
    !template.slots.some(slot=>slot.id===slotId&&slot.day===weekday)) {
    throw new Error("Tento riadok už nie je v uloženom pláne.");
  }
  if (planned) {
    await database.prepare(
      "INSERT INTO facebook_weekly_template_marks(slot_date,slot_id,marked_at,marked_by) VALUES(?,?,?,?) "+
      "ON CONFLICT(slot_date,slot_id) DO UPDATE SET marked_at=excluded.marked_at,marked_by=excluded.marked_by",
    ).bind(date,slotId,new Date().toISOString(),actor).run();
  } else {
    await database.prepare(
      "DELETE FROM facebook_weekly_template_marks WHERE slot_date=? AND slot_id=?",
    ).bind(date,slotId).run();
  }
}
