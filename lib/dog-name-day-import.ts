import { isValidDogNameDayDate, normalizeDogNameDayName, type DogNameDayRecord } from "@/lib/dog-name-days";

export type DogNameDayImportRecord = {
  month: number;
  day: number;
  name: string;
  normalizedName: string;
  source: string;
  note: string | null;
};

export type DogNameDayImportAction = {
  index: number;
  action: "INSERT" | "UPDATE" | "SKIP" | "ERROR";
  record?: DogNameDayImportRecord;
  existingId?: number;
  message?: string;
};

export type DogNameDayImportPlan = {
  actions: DogNameDayImportAction[];
  summary: { INSERT: number; UPDATE: number; SKIP: number; ERROR: number };
};

function importKey(record: Pick<DogNameDayImportRecord, "month" | "day" | "normalizedName">) {
  return `${record.month}:${record.day}:${record.normalizedName}`;
}

function cleanImportRecord(value: unknown): DogNameDayImportRecord {
  if (!value || typeof value !== "object") throw new Error("Riadok nie je objekt.");
  const raw = value as Record<string, unknown>;
  const month = Number(raw.month);
  const day = Number(raw.day);
  const name = typeof raw.name === "string" ? raw.name.trim().replace(/\s+/g, " ") : "";
  const source = typeof raw.source === "string" ? raw.source.trim() : "";
  const note = typeof raw.note === "string" && raw.note.trim() ? raw.note.trim() : null;
  const normalizedName = normalizeDogNameDayName(name);
  if (!isValidDogNameDayDate(month, day)) throw new Error("Neplatný deň alebo mesiac.");
  if (!name || name.length > 120) throw new Error("Meno musí mať 1 až 120 znakov.");
  if (!source || source.length > 1000) throw new Error("Chýba zdroj/proveniencia alebo je príliš dlhý.");
  if (note && note.length > 2000) throw new Error("Poznámka je príliš dlhá.");
  return { month, day, name, normalizedName, source, note };
}

export function planDogNameDayImport(existing: readonly DogNameDayRecord[], input: unknown): DogNameDayImportPlan {
  if (!Array.isArray(input)) throw new Error("Import musí byť JSON pole záznamov.");
  if (input.length > 2000) throw new Error("Jeden import môže obsahovať najviac 2000 záznamov.");
  const existingByKey = new Map(existing.map((record) => [importKey(record), record]));
  const seen = new Set<string>();
  const actions: DogNameDayImportAction[] = input.map((value, index) => {
    try {
      const record = cleanImportRecord(value);
      const key = importKey(record);
      if (seen.has(key)) return { index, action: "ERROR", record, message: "Duplicitné meno pre rovnaký deň v importnom súbore." };
      seen.add(key);
      const current = existingByKey.get(key);
      if (!current) return { index, action: "INSERT", record };
      const unchanged = current.name === record.name && current.source === record.source && (current.note ?? null) === record.note;
      if (unchanged) return { index, action: "SKIP", record, existingId: current.id, message: "Záznam už existuje bez zmeny." };
      if (current.status !== "draft") {
        return { index, action: "ERROR", record, existingId: current.id, message: "Import nesmie automaticky meniť publikovaný alebo archivovaný záznam." };
      }
      return { index, action: "UPDATE", record, existingId: current.id };
    } catch (error) {
      return { index, action: "ERROR", message: error instanceof Error ? error.message : "Neplatný záznam." };
    }
  });
  const summary = { INSERT: 0, UPDATE: 0, SKIP: 0, ERROR: 0 };
  for (const action of actions) summary[action.action] += 1;
  return { actions, summary };
}
