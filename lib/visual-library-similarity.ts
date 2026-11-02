/**
 * Conservative, explainable candidate finder. Shared React component or
 * palette alone are NOT evidence of duplicate content.
 * A result is a review suggestion, NEVER permission to merge automatically.
 */
export type SimilarityItem = {
  id: string;
  label: string;
  title: string;
  description: string;
  ctaHref: string;
  kind: "banner" | "cta" | "hero" | "card";
};

export type SimilarityCandidate = {
  leftId: string;
  rightId: string;
  reason: "identical-copy-and-target" | "shared-target" | "similar-title";
  explanation: string;
  score: number;
};

const genericWords = new Set([
  "a", "aj", "alebo", "ako", "na", "v", "vo", "pre", "pri", "sa", "si", "zo", "do",
  "so", "pes", "psa", "psy", "psov", "psie", "psia", "psiu", "psich",
  "hladate", "najdi", "najdite", "zobrazit", "pozrite", "prejst", "otvorit",
  "sluzby", "sluzieb", "psipedia", "svojho", "vas", "vam", "s", "k", "su", "ich",
]);

export function normalizeSimilarText(value: string): string {
  return value.toLocaleLowerCase("sk").normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim().replace(/\s+/g, " ");
}

function keywords(value: string): Set<string> {
  return new Set(normalizeSimilarText(value).split(" ").filter((word) =>
    word.length >= 4 && !genericWords.has(word)));
}

function normalizedDestination(href: string): string {
  const value = href.trim();
  if (!value.startsWith("/") || value.startsWith("//")) return "";
  const path = value.split(/[?#]/, 1)[0].replace(/\/+$/, "") || "/";
  return path.toLowerCase();
}

function meaningfulTitleSimilarity(a: string, b: string): boolean {
  const left = keywords(a);
  const right = keywords(b);
  if (left.size < 2 || right.size < 2) return false;
  const common = [...left].filter((word) => right.has(word)).length;
  const union = new Set([...left, ...right]).size;
  return common >= 2 && common / union >= 0.72;
}

export function findSimilarityCandidates(
  items: readonly SimilarityItem[],
  limit = 30,
): SimilarityCandidate[] {
  const uniqueItems = [...new Map(items.map((item) => [item.id, item])).values()];
  const result: SimilarityCandidate[] = [];
  for (let i = 0; i < uniqueItems.length; i++) {
    for (let j = i + 1; j < uniqueItems.length; j++) {
      const left = uniqueItems[i];
      const right = uniqueItems[j];
      if (left.kind !== right.kind) continue; // different public UX roles are not duplicates
      const sameTarget = Boolean(normalizedDestination(left.ctaHref)) &&
        normalizedDestination(left.ctaHref) === normalizedDestination(right.ctaHref);
      const sameTitle = Boolean(normalizeSimilarText(left.title)) &&
        normalizeSimilarText(left.title) === normalizeSimilarText(right.title);
      const sameDescription = Boolean(normalizeSimilarText(left.description)) &&
        normalizeSimilarText(left.description) === normalizeSimilarText(right.description);
      let reason: SimilarityCandidate["reason"] | undefined;
      let score = 0;
      let explanation = "";
      if (sameTarget && sameTitle && sameDescription) {
        reason = "identical-copy-and-target";
        explanation = "Rovnaký nadpis, text aj cieľ odkazu. Skontroluj, či majú zostať ako dva samostatné prvky.";
        score = 100;
      } else if (sameTarget) {
        reason = "shared-target";
        explanation = "Oba prvky vedú na rovnakú stránku, ale môžu mať odlišný účel. Nie je to potvrdená duplicita.";
        score = 85;
      } else if (meaningfulTitleSimilarity(left.title, right.title)) {
        reason = "similar-title";
        explanation = "Majú veľmi podobný nadpis. Skontroluj ich vizuál aj rozdielne odkazy.";
        score = 65;
      }
      if (reason) result.push({ leftId: left.id, rightId: right.id, reason, explanation, score });
    }
  }
  return result.sort((a,b) => b.score - a.score ||
    a.leftId.localeCompare(b.leftId) || a.rightId.localeCompare(b.rightId))
    .slice(0, Math.max(0, Math.min(100, Math.floor(limit))));
}
