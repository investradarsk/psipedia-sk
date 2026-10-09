import { env } from "cloudflare:workers";

export type EditorialCalendarItem = {
  id: number;
  title: string;
  status: "published" | "scheduled";
  publishedAt: string;
};

/**
 * The editor submits datetime-local values and converts them to UTC via Date.
 * Query a small safety margin around each month so browser-local dates at
 * the edges are never dropped (including DST changes and non-SK operators).
 */
export async function listEditorialCalendarItems(year: number, month: number): Promise<EditorialCalendarItem[]> {
  const database = (env as unknown as { DB?: D1Database }).DB;
  if (!database) throw new Error("Databáza redakcie zatiaľ nie je pripojená.");
  const start = new Date(Date.UTC(year, month - 1, -2)).toISOString();
  const end = new Date(Date.UTC(year, month, 3)).toISOString();
  const rows = await database.prepare(`
    SELECT id, title,
      CASE WHEN status = 'scheduled' AND published_at <= ? THEN 'published' ELSE status END AS status,
      published_at
    FROM managed_articles
    WHERE status IN ('published', 'scheduled')
      AND published_at IS NOT NULL
      AND published_at >= ?
      AND published_at < ?
    ORDER BY published_at ASC, id ASC
  `).bind(new Date().toISOString(), start, end).all<{
    id: number;
    title: string;
    status: string;
    published_at: string;
  }>();
  return rows.results
    .filter((row) => row.status === "published" || row.status === "scheduled")
    .map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status as "published" | "scheduled",
      publishedAt: row.published_at,
    }));
}

export function parseEditorialCalendarMonth(raw: string | undefined, now = new Date()) {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(raw ?? "");
  const year = match ? Number(match[1]) : now.getFullYear();
  const month = match ? Number(match[2]) : now.getMonth() + 1;
  // Restrict navigation to normal editorial dates and avoid invalid Date ranges.
  if (year < 2000 || year > 2100) return { year: now.getFullYear(), month: now.getMonth() + 1 };
  return { year, month };
}
