export const adoptionStatuses = ["DRAFT", "ACTIVE", "RESERVED", "ADOPTED", "ARCHIVED"] as const;
export type AdoptionStatus = (typeof adoptionStatuses)[number];

export type AdoptionBreedReference = {
  breedId: number | null;
  breedName: string;
  breedSlug: string | null;
};

type ManagedBreedRow = {
  id: number;
  name: string;
  slug: string;
};

export type AdoptionFoundationDatabase = {
  prepare(query: string): {
    bind(...values: unknown[]): {
      first<T>(): Promise<T | null>;
    };
  };
};

export function normalizeAdoptionStatus(value: unknown, fallback: AdoptionStatus = "DRAFT"): AdoptionStatus {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!normalized) return fallback;
  if (!(adoptionStatuses as readonly string[]).includes(normalized)) {
    throw new Error("Neplatný stav adopčného profilu.");
  }
  return normalized as AdoptionStatus;
}

export function normalizeOptionalPositiveId(value: unknown, label: string): number | null {
  if (value === null || value === undefined || value === "") return null;
  const normalized = Number(value);
  if (!Number.isSafeInteger(normalized) || normalized <= 0) {
    throw new Error(`${label} musí byť platné kladné ID.`);
  }
  return normalized;
}

export async function resolveBreed(
  database: AdoptionFoundationDatabase,
  breedId: unknown,
): Promise<AdoptionBreedReference> {
  const normalizedBreedId = normalizeOptionalPositiveId(breedId, "Plemeno");
  if (normalizedBreedId === null) {
    return { breedId: null, breedName: "", breedSlug: null };
  }

  const row = await database
    .prepare("SELECT id, name, slug FROM managed_breeds WHERE id = ? LIMIT 1")
    .bind(normalizedBreedId)
    .first<ManagedBreedRow>();

  if (!row) throw new Error("Vybrané plemeno neexistuje v managed_breeds.");

  return {
    breedId: row.id,
    breedName: row.name.trim(),
    breedSlug: row.slug.trim() || null,
  };
}
