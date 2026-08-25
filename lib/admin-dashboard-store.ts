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
type CountRow = { module: keyof AdminModuleCounts; count: number };

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

export async function getAdminModuleCounts(): Promise<AdminModuleCounts> {
  const database = (env as unknown as RuntimeBindings).DB;
  if (!database || typeof database.prepare !== "function") return emptyCounts;

  const result = await database.prepare(`
    SELECT 'articles' AS module, COUNT(*) AS count FROM managed_articles WHERE portal_section != 'steniatka'
    UNION ALL SELECT 'puppies', COUNT(*) FROM managed_articles WHERE portal_section = 'steniatka'
    UNION ALL SELECT 'breeds', COUNT(*) FROM managed_breeds
    UNION ALL SELECT 'sections', COUNT(*) FROM portal_section_settings
    UNION ALL SELECT 'tips', COUNT(*) FROM news_tips
    UNION ALL SELECT 'feedback', COUNT(*) FROM article_feedback
    UNION ALL SELECT 'inquiries', COUNT(*) FROM directory_inquiries
    UNION ALL SELECT 'events', COUNT(*) FROM managed_events
    UNION ALL SELECT 'directory', COUNT(*) FROM directory_profiles
    UNION ALL SELECT 'help', COUNT(*) FROM managed_help_cases
  `).all<CountRow>();

  return result.results.reduce<AdminModuleCounts>(
    (counts, row) => ({ ...counts, [row.module]: Number(row.count) || 0 }),
    { ...emptyCounts },
  );
}
