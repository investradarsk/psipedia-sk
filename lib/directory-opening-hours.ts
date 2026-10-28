/**
 * Read-only formatter for the opening hours supplied by an individual provider.
 * Only explicit weekday rows are normalized. Free-form text, split shifts,
 * holiday notes and day ranges are never guessed or silently discarded.
 */
export type WeekdayHours = { day: string; hours: string };

const DAYS = [
  { name: "Pondelok", aliases: ["pondelok", "po"] },
  { name: "Utorok", aliases: ["utorok", "ut"] },
  { name: "Streda", aliases: ["streda", "st"] },
  { name: "Štvrtok", aliases: ["štvrtok", "št", "stvrtok", "stvr"] },
  { name: "Piatok", aliases: ["piatok", "pi"] },
  { name: "Sobota", aliases: ["sobota", "so"] },
  { name: "Nedeľa", aliases: ["nedeľa", "nedela", "ne"] },
] as const;

function dayIndex(token: string): number {
  return DAYS.findIndex((day) => day.aliases.includes(token.toLocaleLowerCase("sk") as never));
}

export function parseDirectoryOpeningHours(value: string): WeekdayHours[] | null {
  const lines = value.split(/[\n;]+/).map((part) => part.trim()).filter(Boolean);
  if (!lines.length || lines.length > 7) return null;

  const collected = new Map<number, string>();
  for (const line of lines) {
    // A dash between two weekday names describes a range, not a single day.
    const match = /^([\p{L}]+)(?:\s*:\s*|\s+[–-]\s*|\s+)(.+)$/iu.exec(line);
    if (!match) return null;
    const index = dayIndex(match[1]);
    if (index < 0 || collected.has(index)) return null;
    const hours = match[2].trim();
    // Do not reinterpret non-clock notes such as holiday schedules.
    if (!/(?:\b(?:[01]?\d|2[0-3])[:.][0-5]\d\b|^zatvoren[eé]?$|^na objedn[aá]vku$|^pod[lľ]a dohody$|^nonstop$)/iu.test(hours)) return null;
    collected.set(index, hours);
  }

  return [...collected.entries()]
    .sort(([a], [b]) => a - b)
    .map(([index, hours]) => ({ day: DAYS[index].name, hours }));
}
