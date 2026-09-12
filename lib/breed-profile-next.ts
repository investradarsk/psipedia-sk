import type { BreedSport } from "@/lib/breed-store";

export type BreedProfileSport = Pick<BreedSport, "key" | "label" | "rating" | "note">;

const SPORT_ALIASES: Record<string, { key: string; label: string }> = {
  obedience: { key: "obedience", label: "Obedience" },
  poslusnost: { key: "obedience", label: "Obedience" },
  sportova_poslusnost: { key: "obedience", label: "Obedience" },
  nosework: { key: "nosework", label: "Nosework" },
  pachove_prace: { key: "nosework", label: "Nosework" },
  pachova_praca: { key: "nosework", label: "Nosework" },
  zachranarska_praca: { key: "zachranarska-praca", label: "Záchranárska práca" },
  zachranarske_prace: { key: "zachranarska-praca", label: "Záchranárska práca" },
  rescue: { key: "zachranarska-praca", label: "Záchranárska práca" },
  agility: { key: "agility", label: "Agility" },
  canicross: { key: "canicross", label: "Canicross" },
  dogtrekking: { key: "dogtrekking", label: "Dogtrekking" },
  dogfrisbee: { key: "dogfrisbee", label: "Dogfrisbee" },
  pasenie: { key: "pasenie", label: "Pasenie" },
  herding: { key: "pasenie", label: "Pasenie" },
  stopovanie: { key: "stopovanie", label: "Stopovanie" },
  tracking: { key: "stopovanie", label: "Stopovanie" },
};

function normalizedToken(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function parseSports(input: unknown): unknown[] {
  if (Array.isArray(input)) return input;
  if (typeof input !== "string" || !input.trim()) return [];
  try {
    const parsed: unknown = JSON.parse(input);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function normalizeBreedSports(input: unknown): BreedProfileSport[] {
  const seen = new Set<string>();
  const output: BreedProfileSport[] = [];

  for (const raw of parseSports(input)) {
    if (!raw || typeof raw !== "object") continue;
    const candidate = raw as Partial<BreedSport>;
    const rawKey = typeof candidate.key === "string" ? candidate.key.trim() : "";
    const rawLabel = typeof candidate.label === "string" ? candidate.label.trim() : "";
    const rating = Number(candidate.rating);
    if ((!rawKey && !rawLabel) || !Number.isFinite(rating) || rating < 1 || rating > 5) continue;

    const keyToken = normalizedToken(rawKey || rawLabel);
    const labelToken = normalizedToken(rawLabel || rawKey);
    const alias = SPORT_ALIASES[keyToken] ?? SPORT_ALIASES[labelToken];
    const key = alias?.key ?? keyToken ?? labelToken;
    const label = alias?.label ?? (rawLabel || rawKey);
    if (!key || !label || seen.has(key)) continue;

    seen.add(key);
    output.push({
      key,
      label,
      rating: Math.round(rating),
      note: typeof candidate.note === "string" && candidate.note.trim() ? candidate.note.trim() : undefined,
    });
  }

  return output;
}

export function textParagraphs(...values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const paragraphs: string[] = [];
  for (const value of values) {
    for (const part of value?.split(/\n\s*\n/).map((item) => item.trim()).filter(Boolean) ?? []) {
      const key = part.replace(/\s+/g, " ").toLocaleLowerCase("sk");
      if (seen.has(key)) continue;
      seen.add(key);
      paragraphs.push(part);
    }
  }
  return paragraphs;
}
