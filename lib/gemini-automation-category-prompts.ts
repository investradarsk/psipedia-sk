import {
  geminiAutomationCatalog, getGeminiCatalogItem,
  type GeminiCatalogItem,
} from "./gemini-automation-catalog.ts";

export const GEMINI_PROMPT_MIN_LENGTH = 40;
export const GEMINI_PROMPT_MAX_LENGTH = 6000;

/** Subject-specific guidance; the canonical catalog defines which categories exist. */
const focus: Record<string, string> = {
  "directory.veterinari": "Over verejné kontakty, pracovisko a ponúkanú veterinárnu starostlivosť.",
  "directory.treneri": "Rozlišuj individuálny a skupinový výcvik a psie školy.",
  "directory.kynologicke-kluby": "Over aktívny kynologický klub, cvičisko a jeho zameranie.",
  "directory.chovatelske-kluby": "Over klub, zastrešené plemená a oficiálne kontakty.",
  "directory.chovatelske-stanice": "Over názov chovateľskej stanice a plemená.",
  "directory.salony-a-sluzby": "Over psí salón a druhy starostlivosti o srsť.",
  "directory.hotely-a-opatrovanie": "Over hotel pre psov alebo opatrovateľskú službu a jej rozsah.",
  "directory.vencenie": "Over ponúkané venčenie psov a verejne uvedenú oblasť pôsobenia.",
  "directory.fyzioterapia": "Over fyzioterapiu psov a typ poskytovanej rehabilitácie.",
  "directory.dalsie-sluzby": "Vyber relevantnú inú službu pre psov mimo hlavných kategórií.",
  "events.vystavy": "Over termín, miesto a organizátora budúcej výstavy psov.",
  "events.preteky": "Over disciplínu, termín a organizátora budúcich pretekov alebo skúšok.",
  "events.seminare": "Over termín, organizátora a program budúceho seminára.",
  "events.treningy": "Over termín a organizátora verejného tréningu so psami.",
  "events.stretnutia": "Over termín a miesto budúceho verejného kynologického stretnutia.",
  "events.dalsie": "Over termín iného budúceho verejného podujatia so psami.",
  "help.adopcia": "Over, že pes je stále dostupný na adopciu u uvedenej organizácie.",
  "help.utulky": "Over fungujúci útulok alebo organizáciu pomáhajúcu psom a jej verejné kontakty.",
  "help.docasna-opatera": "Over aktuálnu výzvu na dočasnú opateru psa.",
  "help.zbierky": "Over aktuálnosť zbierky, jej organizátora a deklarovaný cieľ.",
  "help.stratene-a-najdene": "Over dátum a všeobecnú lokalitu aktuálneho pátrania. Nepreberaj súkromné kontakty ani presnú adresu majiteľa.",
  "help.dobrovolnictvo": "Over aktuálnu dobrovoľnícku výzvu a jej organizátora.",
};

export type GeminiCategoryPromptRow = {
  stable_key: string;
  user_prompt: string;
  updated_at: string;
};
export type GeminiCategoryPromptView = GeminiCatalogItem & {
  defaultPrompt: string;
  userPrompt: string | null;
  effectivePrompt: string;
  customized: boolean;
  updatedAt: string | null;
};

export class GeminiCategoryPromptValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeminiCategoryPromptValidationError";
  }
}

export function defaultGeminiCategoryPrompt(item: GeminiCatalogItem): string {
  const detail = focus[item.stableKey];
  if (!detail) throw new Error("Missing Gemini category guidance: " + item.stableKey);
  const task = item.section === "directory"
    ? "Vyhľadaj na Google novú firmu alebo službu pre psov na Slovensku."
    : item.section === "events"
      ? "Vyhľadaj na Google nové budúce podujatie so psami na Slovensku."
      : item.subcategory === "utulky"
        ? "Vyhľadaj na Google nový aktívny útulok alebo organizáciu pomáhajúcu psom na Slovensku."
        : "Vyhľadaj na Google nový aktuálny prípad alebo verejnú výzvu na pomoc psom na Slovensku.";
  return [
    "Máš existujúce záznamy Psipedie pre kategóriu „" + item.label + "“. " + task,
    "Porovnaj kandidáta s existujúcimi záznamami a nevytváraj duplicity. " + detail,
    "Dohľadaj verejne dostupné fakty a zdrojové odkazy, správne vyplň podporované polia Notionu a napíš prirodzený slovenský popis iba z doložených údajov.",
    "Nevymýšľaj chýbajúce údaje. Vytvor výhradne neverejný koncept v stave Nápad. Publikovanie a schvaľovanie sú samostatné operácie mimo tejto úlohy.",
  ].join("\n\n");
}

export function geminiCategoryPromptView(
  item: GeminiCatalogItem, row: GeminiCategoryPromptRow | null = null,
): GeminiCategoryPromptView {
  const defaultPrompt = defaultGeminiCategoryPrompt(item);
  const userPrompt = row?.user_prompt ?? null;
  return {
    ...item, defaultPrompt, userPrompt,
    effectivePrompt: userPrompt ?? defaultPrompt,
    customized: userPrompt !== null,
    updatedAt: row?.updated_at ?? null,
  };
}

export function geminiCategoryPromptViews(rows: readonly GeminiCategoryPromptRow[]): GeminiCategoryPromptView[] {
  const byKey = new Map(rows.map((row) => [row.stable_key, row]));
  return geminiAutomationCatalog.map((item) => geminiCategoryPromptView(item, byKey.get(item.stableKey) ?? null));
}

function strictPayload(value: unknown, allowed: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new GeminiCategoryPromptValidationError("Neplatné údaje promptu.");
  }
  const obj = value as Record<string, unknown>;
  if (Object.keys(obj).length !== allowed.length ||
      Object.keys(obj).some((key) => !allowed.includes(key)) ||
      allowed.some((key) => !Object.hasOwn(obj, key))) {
    throw new GeminiCategoryPromptValidationError("Možno upravovať iba text promptu kategórie.");
  }
  return obj;
}

function stableKey(value: unknown): string {
  if (typeof value !== "string" || !getGeminiCatalogItem(value)) {
    throw new GeminiCategoryPromptValidationError("Neznáma kategória Gemini.");
  }
  return value;
}

/** Custom text has no authority over draft-only and publication guards of the worker. */
export function parseGeminiCategoryPromptSave(value: unknown) {
  const obj = strictPayload(value, ["stable_key", "user_prompt"]);
  const key = stableKey(obj.stable_key);
  if (typeof obj.user_prompt !== "string") {
    throw new GeminiCategoryPromptValidationError("Prompt musí byť text.");
  }
  const userPrompt = obj.user_prompt.replace(/\r\n?/g, "\n").trim();
  if (userPrompt.length < GEMINI_PROMPT_MIN_LENGTH || userPrompt.length > GEMINI_PROMPT_MAX_LENGTH) {
    throw new GeminiCategoryPromptValidationError("Prompt musí mať 40 až 6 000 znakov.");
  }
  if (/(?:^|[\s.!?])(?:automaticky\s+)?(?:publikuj|zverejni|uverejni|publish)\s+(?:priamo|automaticky|bez\s+schválenia|na\s+webe)/iu.test(userPrompt)) {
    throw new GeminiCategoryPromptValidationError("Prompt nesmie požadovať automatické publikovanie.");
  }
  return { stableKey: key, userPrompt };
}

export function parseGeminiCategoryPromptReset(value: unknown) {
  return { stableKey: stableKey(strictPayload(value, ["stable_key"]).stable_key) };
}
