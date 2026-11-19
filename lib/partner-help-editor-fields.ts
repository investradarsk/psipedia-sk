/** Shared public-field contract for a managed Help record.
 * Admin-only properties (SEO, canonical identity, publication metadata, internal
 * verification, private lost/found contacts and map coordinates) are not writable.
 * Field keys are canonical D1 column names: no mirror or shadow profile model.
 */
export type HelpEditorType = "ADOPTION_DOG" | "LOST_FOUND_DOG" | "HELP_CASE";
export type HelpEditorField = {
  key: string;
  label: string;
  kind: "text" | "textarea" | "select" | "date" | "number" | "checkbox" | "nullableBoolean";
  required?: boolean;
  max?: number;
  options?: readonly string[];
  minimum?: number;
  maximum?: number;
};

const sex = ["UNKNOWN", "MALE", "FEMALE"];
const size = ["UNKNOWN", "SMALL", "MEDIUM", "LARGE", "GIANT"];
const suitability = ["UNKNOWN", "YES", "NO", "CONDITIONAL"];
const booleanField = (key: string, label: string): HelpEditorField => ({ key, label, kind: "checkbox" });
const nullableBooleanField = (key: string, label: string): HelpEditorField => ({ key, label, kind: "nullableBoolean" });
const textField = (key: string, label: string, max = 500, required = false): HelpEditorField => ({ key, label, kind: "text", max, required });
const areaField = (key: string, label: string, max = 12000): HelpEditorField => ({ key, label, kind: "textarea", max });
const enumField = (key: string, label: string, options: readonly string[]): HelpEditorField => ({ key, label, kind: "select", options });
const dateField = (key: string, label: string): HelpEditorField => ({ key, label, kind: "date" });
const numberField = (key: string, label: string, maximum = 100000): HelpEditorField => ({ key, label, kind: "number", minimum: 0, maximum });

export const helpEditorFields: Record<HelpEditorType, readonly HelpEditorField[]> = {
  ADOPTION_DOG: [
    textField("name", "Meno psa", 180, true),
    enumField("sex", "Pohlavie", sex),
    dateField("birth_date", "Dátum narodenia"),
    numberField("approximate_age_months", "Približný vek (mesiace)", 600),
    enumField("size", "Veľkosť", size),
    numberField("weight", "Hmotnosť (kg)", 300),
    textField("breed_name", "Plemeno", 180),
    booleanField("breed_mix", "Kríženec"),
    textField("color", "Farba"),
    textField("region", "Kraj"), textField("district", "Okres"), textField("city", "Mesto", 160),
    textField("organization_name", "Organizácia"),
    areaField("short_description", "Krátky opis", 1000),
    areaField("description", "Podrobný opis", 20000),
    areaField("temperament", "Povaha", 5000),
    enumField("activity_level", "Aktivita", ["UNKNOWN","LOW","MEDIUM","HIGH","VERY_HIGH"]),
    enumField("suitable_for_children", "Vzťah k deťom", suitability),
    enumField("suitable_for_dogs", "Vzťah k psom", suitability),
    enumField("suitable_for_cats", "Vzťah k mačkám", suitability),
    enumField("suitable_for_other_animals", "Vzťah k iným zvieratám", suitability),
    nullableBooleanField("apartment_suitable","Vhodný do bytu"),
    nullableBooleanField("beginner_suitable","Vhodný pre začiatočníka"),
    booleanField("needs_experienced_owner","Potrebuje skúseného majiteľa"),
    enumField("vaccination_status", "Očkovanie", ["UNKNOWN","NONE","PARTIAL","UP_TO_DATE"]),
    nullableBooleanField("chipped","Čipovaný"),nullableBooleanField("neutered","Kastrovaný"),
    areaField("health_notes", "Zdravotný stav", 6000),
    areaField("special_needs", "Osobitné potreby", 6000),
    areaField("adoption_requirements", "Podmienky adopcie", 6000),
    textField("contact_email", "Verejný e-mail"),
    textField("contact_phone", "Verejný telefón"),
    textField("contact_url", "Verejný web", 1200),
  ],
  LOST_FOUND_DOG: [
    textField("dog_name", "Meno psa", 180),
    enumField("sex", "Pohlavie", sex),
    textField("breed", "Plemeno"),
    booleanField("breed_unknown","Plemeno nie je známe"),
    textField("color", "Farba"),
    textField("approximate_age", "Približný vek"),
    enumField("size", "Veľkosť", size.slice(0,4)),
    areaField("short_description","Krátky opis",1000),
    areaField("description", "Popis udalosti", 20000),
    areaField("distinguishing_marks", "Rozpoznávacie znaky", 3000),
    areaField("collar_description", "Obojok", 2000),
    enumField("chipped", "Čip", ["UNKNOWN","YES","NO"]),
    dateField("event_date", "Dátum udalosti"),
    textField("last_seen_date_time", "Naposledy videný – dátum a čas"),
    textField("region", "Kraj"),textField("district", "Okres"),textField("city", "Obec", 160),
    areaField("location_description", "Približná verejná lokalita", 3000),
    enumField("public_location_precision","Presnosť verejnej lokality",["MUNICIPALITY","NEIGHBORHOOD","APPROXIMATE"]),
    areaField("public_contact_note", "Verejný kontakt / poznámka", 3000),
    textField("public_phone","Verejný telefón"),textField("public_email","Verejný e-mail"),
    textField("public_website_url","Verejný web",1200),
    textField("public_facebook_url","Facebook",1200),textField("public_instagram_url","Instagram",1200),
  ],
  HELP_CASE: [
    textField("title", "Názov", 180, true),
    enumField("category", "Kategória", ["docasna-opatera","zbierky","dobrovolnictvo","urgentne-pripady"]),
    areaField("excerpt", "Krátky opis", 1200),
    areaField("description", "Podrobný opis", 20000),
    textField("organization", "Organizácia"),
    textField("dog_name", "Meno psa"),
    textField("breed", "Plemeno"),
    textField("age_note", "Vek"),
    textField("city", "Mesto", 160),
    textField("region", "Kraj"),
    areaField("location_note", "Lokalita", 3000),
    dateField("reported_date", "Dátum oznámenia"),
    dateField("deadline_date", "Termín výzvy"),
    textField("action_label", "Text tlačidla", 180),
    textField("action_url", "Odkaz výzvy", 1200),
    areaField("contact_note", "Verejný kontakt", 3000),
    numberField("goal_amount", "Cieľ zbierky (€)", 100000000),
    numberField("raised_amount", "Vyzbierané (€)", 100000000),
    booleanField("urgent", "Urgentné"),
    booleanField("resolved", "Prípad je ukončený"),
  ],
};

export type HelpEditorValue = string | number | boolean | null;
export type HelpEditorPatch = Record<string, HelpEditorValue>;

export class HelpEditorValidationError extends Error {
  constructor(message: string, readonly status = 400) { super(message); this.name = "HelpEditorValidationError"; }
}
function validDate(v: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(v+"T12:00:00.000Z");
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0,10) === v;
}
export function normalizeHelpEditorPatch(type: HelpEditorType, raw: unknown, allowEmpty = false): HelpEditorPatch {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new HelpEditorValidationError("Zmeny musia byť objekt.");
  const data = raw as Record<string, unknown>;
  if (Object.keys(data).length > 60) throw new HelpEditorValidationError("Priveľa polí v jednej zmene.");
  const contract = new Map(helpEditorFields[type].map(f => [f.key, f]));
  const result: HelpEditorPatch = {};
  for (const [key, value] of Object.entries(data)) {
    const field = contract.get(key);
    if (!field) throw new HelpEditorValidationError("Toto pole nie je možné upraviť: "+key+".");
    if (field.kind === "checkbox" || field.kind === "nullableBoolean") {
      if (typeof value !== "boolean" && !(field.kind === "nullableBoolean" && value === null)) throw new HelpEditorValidationError("Neplatná hodnota: "+field.label+".");
      result[key] = value as boolean | null;
    } else if (field.kind === "number") {
      const n = value === "" || value === null ? null : value;
      if (n !== null && (typeof n !== "number" || !Number.isFinite(n) || n < (field.minimum ?? 0) || n > (field.maximum ?? Infinity))) {
        throw new HelpEditorValidationError("Neplatná číselná hodnota: "+field.label+".");
      }
      result[key] = n;
    } else {
      if (typeof value !== "string") throw new HelpEditorValidationError("Neplatná hodnota: "+field.label+".");
      const clean = value.trim().replace(/\r\n?/g,"\n");
      if (clean.length > (field.max ?? 1200)) throw new HelpEditorValidationError("Text je príliš dlhý: "+field.label+".");
      if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(clean)) throw new HelpEditorValidationError("Text obsahuje nepovolené znaky.");
      if (/[<>]/.test(clean)) throw new HelpEditorValidationError("Verejné polia nesmú obsahovať HTML.");
      if (key === "action_url" && clean && !/^(?:https?:\/\/|\/(?!\/)|mailto:|tel:)/i.test(clean)) throw new HelpEditorValidationError("Odkaz výzvy musí byť bezpečný.");
      if (field.required && !clean) throw new HelpEditorValidationError("Povinné pole: "+field.label+".");
      if (field.kind === "select" && !field.options?.includes(clean)) throw new HelpEditorValidationError("Neplatná možnosť: "+field.label+".");
      if (field.kind === "date" && clean && !validDate(clean)) throw new HelpEditorValidationError("Neplatný dátum: "+field.label+".");
      result[key] = clean;
    }
  }
  if (!Object.keys(result).length && !allowEmpty) throw new HelpEditorValidationError("Nezmenili ste žiadny údaj.");
  return result;
}
