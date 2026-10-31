import type { ReconciliationValue } from "./notion-bulk-reconciliation.ts";
import type { BidirectionalAgendaKey } from "./notion-events-help-adapters.ts";

/**
 * Signed Gemini drafts arrive as editorial Notion text, while canonical Admin
 * editors expect typed enums. Convert only safe, deterministic representations.
 * Unknown values become empty/UNKNOWN in a PRIVATE draft, never invented facts.
 * Preserve the unmodified Notion page and report every downgraded field.
 */
export function prepareGeminiDraftFields(
  agenda: BidirectionalAgendaKey,
  source: Record<string, ReconciliationValue>,
): { values: Record<string, ReconciliationValue>; warnings: string[] } {
  const values = { ...source };
  const warnings: string[] = [];
  const raw = (field: string) => String(values[field] ?? "").trim();
  const fold = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/\s+/g, " ").trim();
  function choice(field: string, mapped: Record<string, string>, unknown: string) {
    const before = raw(field);
    const translated = mapped[fold(before)];
    if (!before) {
      values[field] = unknown;
      warnings.push(`Doplň pole „${field}“.`);
    } else if (translated) {
      values[field] = translated;
    } else {
      values[field] = unknown;
      warnings.push(`Skontroluj pole „${field}“ – hodnota z Notionu sa nedá bezpečne preniesť.`);
    }
  }
  function optionalDate(field: string, dateOnly = true) {
    const before = raw(field);
    if (!before) return;
    const valid = dateOnly
      ? /^\d{4}-\d{2}-\d{2}$/.test(before) &&
        !Number.isNaN(Date.parse(before + "T12:00:00Z"))
      : !Number.isNaN(Date.parse(before));
    if (!valid) {
      values[field] = "";
      warnings.push(`Skontroluj dátum v poli „${field}“.`);
    }
  }
  function optionalNumber(field: string, max: number, integer = false) {
    const before = raw(field);
    if (!before) return;
    const value = Number(before.replace(",", "."));
    if (!Number.isFinite(value) || value < 0 || value > max || (integer && !Number.isInteger(value))) {
      values[field] = null;
      warnings.push(`Skontroluj číselnú hodnotu v poli „${field}“.`);
    } else values[field] = value;
  }
  function optionalUrl(field: string) {
    const value = raw(field);
    if (!value) return;
    if (field.includes("obrázok") || field.includes("Obrázok")) {
      if (value.startsWith("/media/") || value.startsWith("/images/")) return;
    }
    try {
      const parsed = new URL(value);
      if ((parsed.protocol === "https:" || parsed.protocol === "http:") &&
          !parsed.username && !parsed.password) return;
    } catch { /* Invalid URLs become a review warning. */ }
    values[field] = "";
    warnings.push(`Skontroluj neplatný odkaz v poli „${field}“.`);
  }
  const sexes = {
    "pes": "MALE", "samec": "MALE", "samcek": "MALE", "male": "MALE", "m": "MALE",
    "suka": "FEMALE", "sucka": "FEMALE", "fenka": "FEMALE", "samica": "FEMALE",
    "female": "FEMALE", "f": "FEMALE", "nezname": "UNKNOWN", "neurcene": "UNKNOWN",
    "unknown": "UNKNOWN",
  };
  const sizes = {
    "maly": "SMALL", "maly pes": "SMALL", "small": "SMALL",
    "stredny": "MEDIUM", "stredny pes": "MEDIUM", "medium": "MEDIUM",
    "velky": "LARGE", "velky pes": "LARGE", "large": "LARGE",
    "nezname": "UNKNOWN", "neurcene": "UNKNOWN", "unknown": "UNKNOWN",
  };
  if (agenda === "adoptions" || agenda === "lost-found") {
    choice("Pohlavie", sexes, "UNKNOWN");
    choice("Veľkosť", agenda === "adoptions"
      ? { ...sizes, "obrovsky": "GIANT", "giant": "GIANT" } : sizes, "UNKNOWN");
  }
  if (agenda === "adoptions") {
    optionalDate("Dátum narodenia");
    optionalNumber("Vek mesiace", 360, true);
    optionalNumber("Hmotnosť", 500);
    optionalUrl("Hlavný obrázok URL");
    optionalUrl("Zdroj dát");
    if (raw("Dátum narodenia") && values["Vek mesiace"] != null && values["Vek mesiace"] !== "") {
      values["Vek mesiace"] = null;
      warnings.push("Dátum narodenia a vek boli vyplnené súčasne; skontroluj vek.");
    }
    if (!raw("Dátum narodenia") && (values["Vek mesiace"] == null || values["Vek mesiace"] === ""))
      warnings.push("Doplň približný vek alebo dátum narodenia.");
    const region = raw("Kraj");
    const regions = new Set(["Bratislavský kraj", "Trnavský kraj", "Trenčiansky kraj",
      "Nitriansky kraj", "Žilinský kraj", "Banskobystrický kraj", "Prešovský kraj", "Košický kraj"]);
    if (region && !regions.has(region)) {
      values["Kraj"] = "";
      warnings.push("Skontroluj kraj.");
    }
  } else if (agenda === "lost-found") {
    choice("Čip", { "ano": "YES", "yes": "YES", "nie": "NO", "no": "NO",
      "nezname": "UNKNOWN", "unknown": "UNKNOWN" }, "UNKNOWN");
    optionalDate("Dátum udalosti");
    optionalDate("Naposledy videný", false);
    optionalUrl("Hlavný obrázok");
    optionalUrl("Zdroj URL");
    // Original private evidence stays in Notion; none enters public D1 columns.
    for (const field of ["Latitude", "Longitude", "Presnosť lokality", "Verejný kontakt"]) {
      if (raw(field)) warnings.push(`Údaj „${field}“ zostáva v Notione na súkromnú kontrolu.`);
    }
    if (raw("Miesto") && raw("Miesto") !== raw("Mesto"))
      warnings.push("Presné miesto zostáva v Notione; v administrácii skontroluj verejnú lokalitu.");
  } else if (agenda === "events") {
    optionalDate("Začiatok");
    optionalDate("Koniec");
    for (const field of ["Čas začiatku", "Čas konca"]) {
      if (raw(field) && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(raw(field))) {
        values[field] = "";
        warnings.push(`Skontroluj čas v poli „${field}“.`);
      }
    }
    if (raw("Začiatok") && raw("Koniec") && raw("Koniec") < raw("Začiatok")) {
      values["Koniec"] = "";
      warnings.push("Dátum konca je pred začiatkom podujatia.");
    }
    for (const field of ["Web", "Registrácia", "Hlavný obrázok URL"]) optionalUrl(field);
  } else if (agenda === "organizations") {
    for (const field of ["Web", "Facebook", "Instagram", "Zdroj dát", "Hlavný obrázok URL"])
      optionalUrl(field);
  } else {
    for (const field of ["Dátum hlásenia", "Deadline"]) optionalDate(field);
    for (const field of ["Cieľ", "Vyzbierané"]) optionalNumber(field, 100000000, true);
    for (const field of ["CTA URL", "Obrázok"]) optionalUrl(field);
  }
  return { values, warnings };
}
