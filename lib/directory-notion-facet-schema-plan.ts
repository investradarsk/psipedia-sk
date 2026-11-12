import { directoryFilterRegistry } from "./directory-filter-contract";

/**
 * Read-only deployment plan for the EXISTING Notion Adresár data source.
 * Never writes columns, records, relationships or production D1.
 * Apply only after separate owner approval and a live identity/schema check.
 */
export const DIRECTORY_NOTION_DATA_SOURCE_ID = "84e0664c-ca47-405f-9d54-31b20287bc8c";

type Column = {
  type?: string;
  options?: readonly { name?: string }[];
  select?: { options?: readonly { name?: string }[] };
};
const notionLabels: Readonly<Record<string, string>> = {
  yes: "Áno", no: "Nie", unknown: "Neznáme",
  ambulance: "Ambulancia", clinic: "Klinika", hospital: "Nemocnica",
};
const optionColors: Readonly<Record<string, string>> = {
  yes: "green", no: "red", unknown: "gray",
  ambulance: "blue", clinic: "green", hospital: "purple",
};

function sameSource(a: string, b: string) {
  return a.replaceAll("-", "").toLowerCase() === b.replaceAll("-", "").toLowerCase();
}

/** Fail closed on an unrelated data source or incompatible existing properties. */
export function planDirectoryNotionFacetColumns(input: {
  dataSourceId: string;
  schema: Readonly<Record<string, Column>>;
}) {
  if (!sameSource(input.dataSourceId, DIRECTORY_NOTION_DATA_SOURCE_ID))
    throw new Error("DIRECTORY_NOTION_WRONG_DATA_SOURCE");
  if (input.schema["Názov"]?.type !== "title" ||
      !["text", "rich_text"].includes(input.schema["Psipedia ID"]?.type ?? "") ||
      input.schema["Služby z katalógu"]?.type !== "relation")
    throw new Error("DIRECTORY_NOTION_SCHEMA_IDENTITY_MISMATCH");
  const missing: string[] = [];
  for (const field of directoryFilterRegistry) {
    const name = field.notion.property;
    const existing = input.schema[name];
    if (!existing) {
      missing.push(name);
      continue;
    }
    const options = existing.options ?? existing.select?.options ?? [];
    const names = options.map(item => item.name);
    const expectedNames = field.allowedValues.map(value => notionLabels[value] ?? value);
    if (existing.type !== "select" || !expectedNames.every(expected => names.includes(expected)))
      throw new Error("DIRECTORY_NOTION_FACET_SCHEMA_CONFLICT: " + field.id);
  }
  const statements = missing.map(name => {
    if (name.includes('"') || name.includes("\n"))
      throw new Error("DIRECTORY_NOTION_FACET_NAME_INVALID");
    const definition = directoryFilterRegistry.find(field => field.notion.property === name);
    if (!definition) throw new Error("DIRECTORY_NOTION_FACET_DEFINITION_MISSING");
    const options = definition.allowedValues.map(value => {
      const label = notionLabels[value] ?? value;
      if (!/^[^'";\\\n]{1,80}$/.test(label))
        throw new Error("DIRECTORY_NOTION_FACET_OPTION_INVALID");
      return "'" + label + "':" + (optionColors[value] ?? "gray");
    });
    return `ADD COLUMN "${name}" SELECT(${options.join(", ")})`;
  });
  return {
    dataSourceId: DIRECTORY_NOTION_DATA_SOURCE_ID,
    missing,
    existing: directoryFilterRegistry.length - missing.length,
    total: directoryFilterRegistry.length,
    statements,
    noOp: statements.length === 0,
  };
}
