/**
 * Scheduling uses browser-local wall time, exactly as the article editor's
 * datetime-local input and new Date(localValue) conversion do.
 * Store and transmit only UTC ISO instants; never slice a UTC ISO timestamp
 * to display a local wall time.
 */
const pad = (value: number) => String(value).padStart(2, "0");

export function formatArticleLocalDateTime(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Reject invalid calendar dates and spring-forward wall times (e.g. 02:30
 * during a DST gap). A repeated autumn hour uses JS Date's earlier instant,
 * consistent with the existing article editor's datetime-local contract.
 */
export function parseArticleLocalDateTime(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const wallTime = `${date}T${time}`;
  const timestamp = new Date(wallTime);
  if (!Number.isFinite(timestamp.getTime())) return null;
  const iso = timestamp.toISOString();
  return formatArticleLocalDateTime(iso) === wallTime ? iso : null;
}
