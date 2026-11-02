/**
 * Read-only review candidates for the public visual-source registry.
 * A shared role, name or CSS file can suggest an audit, but NEVER proves
 * duplicate rendered markup, duplicated CSS declarations, or a defect.
 */
export type VisualSource = {
  name: string;
  path: string;
  label?: string;
  family?: string;
  area: "public" | "mixed" | "admin";
  routes: readonly string[];
  styleModules?: readonly string[];
};

export type RelatedVisualGroup = {
  id: string;
  title: string;
  description: string;
  paths: readonly string[];
};

export type VisualSourceCandidate = {
  id: string;
  leftPath: string;
  rightPath: string;
  group: string;
  reason: "same-name" | "related-purpose";
  explanation: string;
  sharedRoutes: string[];
  affectedRoutes: string[];
  leftStyleModules: string[];
  rightStyleModules: string[];
  score: number;
};

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase("sk").normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Sort route candidates, do not synthesize real profile slugs. */
function sortedRoutes(values: readonly string[]): string[] {
  return [...new Set(values.filter((route) => route.startsWith("/") &&
    !route.startsWith("//") && route !== "/admin" && !route.startsWith("/admin/")))].sort();
}

export function findVisualSourceCandidates(
  components: readonly VisualSource[],
  groups: readonly RelatedVisualGroup[],
  limit = 80,
): VisualSourceCandidate[] {
  const visible = [...new Map(components.filter((item) => item.area !== "admin")
    .map((item) => [item.path, item])).values()];
  const byPath = new Map(visible.map((item) => [item.path, item]));
  const results = new Map<string, VisualSourceCandidate>();
  const bounded = Math.max(0, Math.min(150, Math.floor(limit)));

  const evaluate = (left: VisualSource, right: VisualSource, group: string, description: string) => {
    if (left.path === right.path) return;
    const [a, b] = left.path < right.path ? [left, right] : [right, left];
    const sameName = normalized(a.name) === normalized(b.name);
    const reason = sameName ? "same-name" : "related-purpose";
    const sharedRoutes = sortedRoutes(a.routes.filter((route) => b.routes.includes(route)));
    const affectedRoutes = sortedRoutes([...a.routes, ...b.routes]);
    const leftStyleModules = [...new Set(a.styleModules ?? [])].sort();
    const rightStyleModules = [...new Set(b.styleModules ?? [])].sort();
    const styleEvidence = leftStyleModules.length && rightStyleModules.length
      ? leftStyleModules.join("|") === rightStyleModules.join("|")
        ? "Oba súbory importujú rovnaké CSS moduly."
        : "Importujú rôzne CSS moduly; rozdiel v konečnom vzhľade treba ešte overiť."
      : "Pri aspoň jednom súbore nie je známy vlastný CSS modul.";
    const explanation = sameName
      ? "Dva rôzne zdrojové súbory majú rovnaký názov. Neznamená to rovnaké vykreslenie."
      : description + " Ide o podobný účel, nie o potvrdenú duplicitu.";
    const candidate: VisualSourceCandidate = {
      id: a.path + "|" + b.path,
      leftPath: a.path, rightPath: b.path, group,
      reason, explanation: explanation + " " + styleEvidence,
      sharedRoutes, affectedRoutes, leftStyleModules, rightStyleModules,
      score: sameName ? 100 : sharedRoutes.length ? 78 : 55,
    };
    const existing = results.get(candidate.id);
    if (!existing || candidate.score > existing.score) results.set(candidate.id, candidate);
  };

  // Direct same-name candidates are important even outside predefined families.
  const byName = new Map<string, VisualSource[]>();
  for (const component of visible) {
    const key = normalized(component.name);
    const entries = byName.get(key) ?? [];
    entries.push(component);
    byName.set(key, entries);
  }
  for (const entries of byName.values()) {
    if (entries.length < 2) continue;
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        evaluate(entries[i], entries[j], "Rovnaký názov súboru", "");
      }
    }
  }

  // Related families in the generator are specific, manually reviewable groups.
  for (const group of groups) {
    const entries = [...new Set(group.paths)].map((path) => byPath.get(path))
      .filter((value): value is VisualSource => Boolean(value));
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        evaluate(entries[i], entries[j], group.title, group.description);
      }
    }
  }
  return [...results.values()]
    .sort((a, b) => b.score - a.score ||
      a.group.localeCompare(b.group, "sk") || a.id.localeCompare(b.id, "sk"))
    .slice(0, bounded);
}
