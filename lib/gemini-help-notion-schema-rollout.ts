/**
 * Read-only, idempotent plan for a separately authorized production Notion
 * schema change. This function NEVER makes network calls or writes to Notion.
 */
export const CANONICAL_HELP_DATABASE_ID = "4a883a05-35af-45b8-b7cc-5ad7ac5670e9";
export const CANONICAL_HELP_DATA_SOURCE_ID = "3ed793fc-1d18-819c-bb39-000b753d0002";

const REVIEW_NAME = "Gemini kontrola";
const REASON_NAME = "Dôvod odmietnutia";
const APPROVED_OPTIONS = ["Na kontrolu", "Schválené", "Odmietnuté"] as const;
const REVIEW_ADD = 'ADD COLUMN "Gemini kontrola" SELECT(\'Na kontrolu\':gray, \'Schválené\':green, \'Odmietnuté\':red)';
const REASON_ADD = 'ADD COLUMN "Dôvod odmietnutia" RICH_TEXT';

type Column = {
  type?: string;
  options?: { name?: string }[];
  select?: { options?: { name?: string }[] };
};

const sameId = (a: string, b: string) =>
  a.replaceAll("-", "").toLowerCase() === b.replaceAll("-", "").toLowerCase();

/** Accepts the native Notion connector data-source state (`type: text`)
 * or the Notion REST schema (`type: rich_text`).
 * Caller must fetch and verify database AND data source on every execution.
 */
export function planHelpGeminiReviewSchema(input: {
  databaseId: string;
  dataSourceId: string;
  schema: Record<string, Column>;
}) {
  if (!sameId(input.databaseId, CANONICAL_HELP_DATABASE_ID) ||
      !sameId(input.dataSourceId, CANONICAL_HELP_DATA_SOURCE_ID))
    throw new Error("WRONG_CANONICAL_HELP_DATA_SOURCE");
  const schema = input.schema;
  if (schema["Názov"]?.type !== "title" ||
      !["text", "rich_text"].includes(schema["Psipedia stav"]?.type ?? "") ||
      !["text", "rich_text"].includes(schema["Psipedia ID"]?.type ?? "") ||
      !["text", "rich_text"].includes(schema["Slug"]?.type ?? ""))
    throw new Error("NOT_CANONICAL_HELP_SCHEMA");

  const existingReview = schema[REVIEW_NAME];
  const existingReason = schema[REASON_NAME];
  if (existingReview) {
    const options = existingReview.options ?? existingReview.select?.options ?? [];
    const names = options.map(option => option.name);
    if (existingReview.type !== "select" || names.length !== APPROVED_OPTIONS.length ||
        !APPROVED_OPTIONS.every(name => names.includes(name)))
      throw new Error("GEMINI_REVIEW_SCHEMA_CONFLICT");
  }
  if (existingReason && !["text", "rich_text"].includes(existingReason.type ?? ""))
    throw new Error("GEMINI_REJECTION_SCHEMA_CONFLICT");

  const additions = [
    ...(!existingReview ? [REVIEW_ADD] : []),
    ...(!existingReason ? [REASON_ADD] : []),
  ];
  return {
    dataSourceId: CANONICAL_HELP_DATA_SOURCE_ID,
    existingProperties: Object.keys(schema).length,
    additions,
    statements: additions.join("; "),
    noOp: additions.length === 0,
  };
}
