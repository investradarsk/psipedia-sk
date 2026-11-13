/** Compact, timezone-independent date presentation for public event previews. */
export const EVENT_CARD_MONTHS = [
  "JAN", "FEB", "MAR", "APR", "MÁJ", "JÚN",
  "JÚL", "AUG", "SEP", "OKT", "NOV", "DEC",
] as const;

type EventDateRange = {
  startDate: string;
  endDate?: string | null;
};

function cardDatePart(value: string) {
  const monthNumber = Number(value.slice(5, 7));
  return {
    day: Number(value.slice(8, 10)),
    month: EVENT_CARD_MONTHS[monthNumber - 1] ?? value.slice(5, 7),
    year: value.slice(0, 4),
    monthNumber,
  };
}

/** E.g. "17. – 20. DEC 2026" or "30. NOV – 2. DEC 2026". */
export function compactEventCardDate(event: EventDateRange): string {
  const start = cardDatePart(event.startDate);
  const startLabel = `${start.day}. ${start.month} ${start.year}`;
  if (!event.endDate || event.endDate <= event.startDate) return startLabel;

  const end = cardDatePart(event.endDate);
  if (start.year === end.year && start.monthNumber === end.monthNumber) {
    return `${start.day}. – ${end.day}. ${end.month} ${end.year}`;
  }
  if (start.year === end.year) {
    return `${start.day}. ${start.month} – ${end.day}. ${end.month} ${end.year}`;
  }
  return `${startLabel} – ${end.day}. ${end.month} ${end.year}`;
}
