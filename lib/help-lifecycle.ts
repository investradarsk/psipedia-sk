/** Explicit editorial closure wins over a stale urgent flag. No guessed dates or amounts. */
const closedSummaryPrefixes = [
  "ukončená zbierka",
  "ukončená výzva",
  "zbierka je ukončená",
  "zbierka bola ukončená",
  "výzva je ukončená",
  "výzva bola ukončená",
];
const closedActionPrefixes = ["pozrieť ukončenú", "zobraziť ukončenú"];
function startsWithClosure(value: string | undefined, prefixes: string[]) {
  const text = (value ?? "").trim().toLocaleLowerCase("sk");
  return prefixes.some(
    (prefix) =>
      text === prefix ||
      text.startsWith(prefix + " ") ||
      text.startsWith(prefix + ".") ||
      text.startsWith(prefix + ":"),
  );
}
export function applyHelpLifecycle<
  T extends {
    category: string;
    excerpt?: string;
    actionLabel?: string;
    resolved: boolean;
    urgent: boolean;
  },
>(item: T): T {
  const explicitClosure =
    item.category === "zbierky" &&
    (startsWithClosure(item.excerpt, closedSummaryPrefixes) ||
      startsWithClosure(item.actionLabel, closedActionPrefixes));
  const resolved = item.resolved || explicitClosure;
  return {
    ...item,
    resolved,
    urgent: item.urgent && !resolved,
    ...(resolved && item.category === "zbierky" && typeof item.actionLabel === "string"
      ? { actionLabel: "Pozrieť ukončenú výzvu" }
      : {}),
  };
}
/** The exact same prefix policy must filter counts and highlights before LIMIT. */
export function activeHelpSql(alias = "") {
  if (alias && !/^[a-z_]+\.$/.test(alias)) throw new Error("Invalid internal SQL alias");
  // SQLite NOCASE folds ASCII only. GLOB letter pairs also cover Slovak capitals.
  const patterns = (field: string, prefixes: string[]) =>
    prefixes.map((prefix) => {
      const folded = [...prefix]
        .map((char) =>
          char.toLocaleUpperCase("sk") === char ? char : `[${char}${char.toLocaleUpperCase("sk")}]`,
        )
        .join("");
      const value = `trim(COALESCE(${alias}${field},''))`;
      return `(${["", " *", ".*", ":*"].map((suffix) => `${value} GLOB '${folded}${suffix}'`).join(" OR ")})`;
    });
  return `${alias}resolved = 0 AND NOT (${alias}category = 'zbierky' AND (${[...patterns("excerpt", closedSummaryPrefixes), ...patterns("action_label", closedActionPrefixes)].join(" OR ")}))`;
}
