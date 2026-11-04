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
  // SQLite lower() folds ASCII only. Fold the accented capitals used by the
  // closure vocabulary explicitly, then compare prefixes without GLOB patterns.
  // D1 limits pattern complexity more strictly than standalone SQLite.
  const matches = (field: string, prefixes: string[]) => {
    let value = `trim(COALESCE(${alias}${field},''))`;
    const accented = new Set([...prefixes.join("")].filter((char) => char.charCodeAt(0) > 127));
    for (const char of accented)
      value = `replace(${value},'${char.toLocaleUpperCase("sk")}','${char}')`;
    value = `lower(${value})`;
    return prefixes.map(
      (prefix) =>
        `(substr(${value},1,${prefix.length}) = '${prefix}' AND substr(${value},${prefix.length + 1},1) IN ('',' ','.',':'))`,
    );
  };
  return `${alias}resolved = 0 AND NOT (${alias}category = 'zbierky' AND (${[...matches("excerpt", closedSummaryPrefixes), ...matches("action_label", closedActionPrefixes)].join(" OR ")}))`;
}
