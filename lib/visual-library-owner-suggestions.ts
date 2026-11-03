/**
 * Conservative, read-only shortlist for human visual inspection.
 * It matches intent/category/source/route evidence, NOT screenshot pixels.
 * Returning a pair is never a claim of duplicate code or visual equivalence.
 */
export type OwnerSuggestionSource = {
  id: string;
  title: string;
  family: string;
  paths: readonly string[];
  routes: readonly string[];
  knownUses: readonly { url: string }[];
};

export type OwnerVisualSuggestion = {
  leftId: string;
  rightId: string;
  score: number;
  reasons: string[];
};

const GENERIC_WORDS = new Set([
  "a", "aj", "až", "so", "na", "pre", "vo", "pri", "bez", "do", "z", "o",
  "spolocny", "spolocna", "spolocne", "ukazka", "ukazkovy", "ukazkova",
  "verejny", "verejna", "realny", "realna", "skutocny", "skutocna",
  "banner", "bannery", "karta", "karty", "komponent", "profil", "sekcia",
  "sekcie", "variant", "zobrazenie", "obsahovy", "obsahova", "nadpis",
]);

function tokens(text: string): string[] {
  return [...new Set(text.toLocaleLowerCase("sk").normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/g)
    .filter((part) => part.length > 3 && !GENERIC_WORDS.has(part)))];
}

function pathname(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.origin === "https://psipedia.sk" ? parsed.pathname : null;
  } catch { return null; }
}

/**
 * Compare groups, not variants of the same rendered React component.
 * Same filename alone never counts as a duplicate.
 */
export function suggestOwnerVisualPairs(
  groups: readonly OwnerSuggestionSource[],
  maxResults = 12,
): OwnerVisualSuggestion[] {
  const candidates: OwnerVisualSuggestion[] = [];
  const limit = Math.min(40, Math.max(0, Math.trunc(maxResults)));
  for (let i = 0; i < groups.length; i++) {
    const a = groups[i];
    for (let j = i + 1; j < groups.length; j++) {
      const b = groups[j];
      if (a.id === b.id || a.family !== b.family) continue;

      // A family identifies a comparable visual purpose, not proof of similarity.
      let score = 10;
      const reasons = ["Rovnaká kategória vizuálneho prvku"];
      const common = tokens(a.title).filter((word) => tokens(b.title).includes(word));
      if (common.length) {
        score += Math.min(12, common.length * 6);
        reasons.push("Podobný účel podľa názvu");
      }
      const routes = new Set(a.routes);
      if (b.routes.some((route) => routes.has(route))) {
        score += 12;
        reasons.push("Spoločná kandidátska šablóna podľa kódu");
      }
      const pages = new Set(a.knownUses.map((item) => pathname(item.url)).filter(Boolean));
      if (b.knownUses.some((use) => {
        const page = pathname(use.url);
        return page !== null && pages.has(page);
      })) {
        score += 20;
        reasons.push("Doložené použitie na rovnakej stránke");
      }
      const sameSource = a.paths.some((path) => b.paths.includes(path));
      if (sameSource) {
        score += 3;
        reasons.push("Implementácie zdieľajú súbor; môžu byť aj odlišné exporty");
      } else if (a.paths.length && b.paths.length) {
        score += 4;
        reasons.push("Samostatné zdrojové súbory na porovnanie");
      }
      candidates.push({ leftId: a.id, rightId: b.id, score, reasons });
    }
  }
  return candidates.sort((a,b) =>
    b.score - a.score ||
    (a.leftId+"|"+a.rightId).localeCompare(b.leftId+"|"+b.rightId,"sk"),
  ).slice(0, limit);
}
