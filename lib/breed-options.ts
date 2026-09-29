import { canonicalBreedIdsSql } from "./breed-canonical.ts";

export const CANONICAL_BREED_OPTION_LIMIT = 2000;

export type CanonicalBreedOption = {
  id: number;
  name: string;
};

export type CanonicalBreedOptionsResult = {
  available: boolean;
  options: CanonicalBreedOption[];
};

type BreedOptionRow = {
  id: number;
  name: string;
};

type BreedOptionStatement = {
  bind(...values: unknown[]): BreedOptionStatement;
  all<T>(): Promise<{ results: T[] }>;
  first<T>(): Promise<T | null>;
};

export type BreedOptionDatabase = {
  prepare(sql: string): BreedOptionStatement;
};

type BreedOptionReadInput = {
  selected?: CanonicalBreedOption | null;
  limit?: number;
};

const slovakBreedCollator = new Intl.Collator("sk", {
  usage: "sort",
  sensitivity: "base",
  numeric: true,
});

function normalizeBreedOption(row: BreedOptionRow | CanonicalBreedOption | null | undefined): CanonicalBreedOption | null {
  if (!row) return null;
  const id = Number(row.id);
  const name = typeof row.name === "string" ? row.name.trim() : "";
  if (!Number.isSafeInteger(id) || id <= 0 || !name) return null;
  return { id, name };
}

function sortBreedOptions(options: CanonicalBreedOption[]) {
  return [...options].sort((left, right) =>
    slovakBreedCollator.compare(left.name, right.name)
    || left.name.localeCompare(right.name, "sk")
    || left.id - right.id
  );
}

function safeOptionLimit(value: number | undefined) {
  if (value === undefined) return CANONICAL_BREED_OPTION_LIMIT;
  const normalized = Math.trunc(Number(value));
  if (!Number.isFinite(normalized)) return CANONICAL_BREED_OPTION_LIMIT;
  return Math.max(1, Math.min(CANONICAL_BREED_OPTION_LIMIT, normalized));
}

export async function readCanonicalBreedOptions(
  database: BreedOptionDatabase | null | undefined,
  input: BreedOptionReadInput = {},
): Promise<CanonicalBreedOptionsResult> {
  const persistedSelected = normalizeBreedOption(input.selected);
  if (!database) {
    return {
      available: false,
      options: persistedSelected ? [persistedSelected] : [],
    };
  }

  try {
    const limit = safeOptionLimit(input.limit);
    const result = await database.prepare(
      `SELECT id, name
       FROM managed_breeds
       WHERE id IN (${canonicalBreedIdsSql})
       ORDER BY name COLLATE NOCASE ASC, id ASC
       LIMIT ?`,
    ).bind(limit).all<BreedOptionRow>();

    const byId = new Map<number, CanonicalBreedOption>();
    for (const row of result.results) {
      const option = normalizeBreedOption(row);
      if (option) byId.set(option.id, option);
    }

    if (persistedSelected && !byId.has(persistedSelected.id)) {
      const legacyRow = await database.prepare(
        "SELECT id, name FROM managed_breeds WHERE id = ? LIMIT 1",
      ).bind(persistedSelected.id).first<BreedOptionRow>();
      const legacyOption = normalizeBreedOption(legacyRow) ?? persistedSelected;
      byId.set(legacyOption.id, legacyOption);
    }

    return {
      available: true,
      options: sortBreedOptions([...byId.values()]),
    };
  } catch {
    return {
      available: false,
      options: persistedSelected ? [persistedSelected] : [],
    };
  }
}
