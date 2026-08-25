import { env } from "cloudflare:workers";

export type AdminModuleCounts = {
  articles: number;
  puppies: number;
  breeds: number;
  sections: number;
  tips: number;
  feedback: number;
  inquiries: number;
  events: number;
  directory: number;
  help: number;
};

type RuntimeBindings = { DB?: D1Database };
type CountRow = { count: number };
type TableRow = { name: string };

const emptyCounts: AdminModuleCounts = {
  articles: 0,
  puppies: 0,
  breeds: 0,
  sections: 0,
  tips: 0,
  feedback: 0,
  inquiries: 0,
  events: 0,
  directory: 0,
  help: 0,
};

const countQueries: Array<{
  key: keyof AdminModuleCounts;
  table: string;
  where?: string;
}> = [
  { key: "articles", table: "managed_articles", where: "portal_section != 'steniatka'" },
  { key: "puppies", table: "managed_articles", where: "portal_section = 'steniatka'" },
  { key: "breeds", table: "managed_breeds" },
  { key: "sections", table: "portal_section_settings" },
  { key: "tips", table: "news_tips" },
  { key: "feedback", table: "article_feedback" },
  { key: "inquiries", table: "directory_inquiries" },
  { key: "events", table: "managed_events" },
  { key: "directory", table: "directory_profiles" },
  { key: "help", table: "managed_help_cases" },
];

export async function getAdminModuleCounts(): Promise<AdminModuleCounts> {
  const database = (env as unknown as RuntimeBindings).DB;
  if (!database || typeof database.prepare !== "function") return { ...emptyCounts };

  try {
    const tables = [...new Set(countQueries.map(({ table }) => table))];
    const placeholders = tables.map(() => "?").join(", ");
    const tableResult = await database
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${placeholders})`)
      .bind(...tables)
      .all<TableRow>();
    const existingTables = new Set(tableResult.results.map(({ name }) => name));
    const availableQueries = countQueries.filter(({ table }) => existingTables.has(table));

    if (!availableQueries.length) return { ...emptyCounts };

    const results = await database.batch(
      availableQueries.map(({ table, where }) =>
        database.prepare(`SELECT COUNT(*) AS count FROM ${table}${where ? ` WHERE ${where}` : ""}`),
      ),
    );

    return availableQueries.reduce<AdminModuleCounts>((counts, { key }, index) => {
      const row = results[index]?.results[0] as CountRow | undefined;
      counts[key] = Number(row?.count) || 0;
      return counts;
    }, { ...emptyCounts });
  } catch (error) {
    console.error("Admin dashboard counts could not be loaded", error);
    return { ...emptyCounts };
  }
}
