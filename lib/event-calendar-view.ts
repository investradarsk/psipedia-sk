import type { DogEvent } from "@/lib/events";

/** These are event-local calendar dates (Europe/Bratislava), not UTC timestamps. */
export const calendarWeekdays = ["Po", "Ut", "St", "Št", "Pi", "So", "Ne"] as const;
const MONTH_NAMES = ["január", "február", "marec", "apríl", "máj", "jún", "júl", "august", "september", "október", "november", "december"];

export function resolveCalendarMonth(requested: string, filteredMonth: string, today: string): string {
  const valid = (value: string) => /^20\d{2}-(?:0[1-9]|1[0-2])$/.test(value);
  return valid(requested) ? requested : valid(filteredMonth) ? filteredMonth : today.slice(0, 7);
}

export function calendarMonthLabel(month: string): string {
  return `${MONTH_NAMES[Number(month.slice(5)) - 1]} ${month.slice(0, 4)}`;
}

export function moveCalendarMonth(month: string, offset: number): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + offset, 1, 12));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function calendarMonthBounds(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDate = new Date(Date.UTC(year, monthNumber, 0, 12)).getUTCDate();
  return { start: `${month}-01`, end: `${month}-${String(lastDate).padStart(2, "0")}` };
}

export function calendarMonthDays(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const firstDay = new Date(Date.UTC(year, monthNumber - 1, 1, 12));
  const mondayOffset = (firstDay.getUTCDay() + 6) % 7;
  const lastDay = new Date(Date.UTC(year, monthNumber, 0, 12)).getUTCDate();
  const slots = Math.ceil((mondayOffset + lastDay) / 7) * 7;
  return Array.from({ length: slots }, (_, index) => {
    const date = new Date(Date.UTC(year, monthNumber - 1, index - mondayOffset + 1, 12));
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
    return { date: key, day: date.getUTCDate(), inMonth: key.startsWith(month) };
  });
}

export function eventOverlapsDay(event: Pick<DogEvent, "startDate" | "endDate">, day: string): boolean {
  return event.startDate <= day && (event.endDate || event.startDate) >= day;
}

export function eventsForCalendarDay<T extends Pick<DogEvent, "startDate" | "endDate">>(events: T[], day: string): T[] {
  return events.filter((event) => eventOverlapsDay(event, day));
}
