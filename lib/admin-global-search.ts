import type { D1Database } from "@cloudflare/workers-types";

export type AdminGlobalRecord = {
  title: string;
  subtitle: string;
  href: string;
  category: string;
};
type SearchRow = { id: number; title: string; subtitle: string };
type Group = { category: string; prefix: string; sql: string };
const contains = (column: string) => "instr(lower(coalesce(" + column + ", '')), lower(?)) > 0";

// Only approved table and column names are defined here. No user text is
// interpolated into SQL; it is bound to every placeholder.
const groups: Group[] = [
  {
    category: "Služby pre psov", prefix: "/admin/adresar/",
    sql: "SELECT id,name AS title, trim(coalesce(category,'') || ' · ' || coalesce(city,'')) AS subtitle FROM directory_profiles WHERE " +
      [contains("name"), contains("city"), contains("category")].join(" OR ") + " ORDER BY updated_at DESC LIMIT 6",
  },
  {
    category: "Podujatia", prefix: "/admin/podujatia/",
    sql: "SELECT id,title,trim(coalesce(city,'') || ' · ' || coalesce(venue,'')) AS subtitle FROM managed_events WHERE " +
      [contains("title"), contains("city"), contains("venue")].join(" OR ") + " ORDER BY start_date DESC LIMIT 6",
  },
  {
    category: "Adopcie", prefix: "/admin/adopcie/",
    sql: "SELECT id,name AS title,trim(coalesce(city,'') || ' · ' || coalesce(breed_name,'')) AS subtitle FROM adoption_dogs WHERE " +
      [contains("name"), contains("breed_name"), contains("organization_name")].join(" OR ") + " ORDER BY updated_at DESC LIMIT 6",
  },
  {
    category: "Stratené a nájdené", prefix: "/admin/stratene-najdene/",
    sql: "SELECT id,coalesce(nullif(dog_name,''), 'Hlásenie #' || id) AS title,coalesce(city,'') AS subtitle FROM lost_found_dog_reports WHERE " +
      [contains("dog_name"), contains("city"), contains("search_text")].join(" OR ") + " ORDER BY updated_at DESC LIMIT 6",
  },
  {
    category: "Pomoc psom", prefix: "/admin/pomoc/",
    sql: "SELECT id,title,trim(coalesce(category,'') || ' · ' || coalesce(city,'')) AS subtitle FROM help_cases WHERE category NOT IN ('adopcia','utulky','stratene-a-najdene') AND (" +
      [contains("title"), contains("organization"), contains("city")].join(" OR ") + ") ORDER BY updated_at DESC LIMIT 6",
  },
  {
    category: "Organizácie", prefix: "/admin/organizacie/",
    sql: "SELECT id,name AS title,coalesce(city,'') AS subtitle FROM help_organizations WHERE " +
      [contains("name"), contains("city")].join(" OR ") + " ORDER BY updated_at DESC LIMIT 6",
  },
  {
    category: "Články", prefix: "/admin/clanky/",
    sql: "SELECT id,title,coalesce(category,'') AS subtitle FROM managed_articles WHERE " +
      [contains("title"), contains("excerpt")].join(" OR ") + " ORDER BY updated_at DESC LIMIT 6",
  },
  {
    category: "Plemená", prefix: "/admin/plemena/",
    sql: "SELECT id,name AS title,coalesce(official_fci_name,'') AS subtitle FROM managed_breeds WHERE " +
      [contains("name"), contains("official_fci_name")].join(" OR ") + " ORDER BY updated_at DESC LIMIT 6",
  },
];

export async function searchAdminRecords(database: D1Database, input: string) {
  const query = input.trim().slice(0, 80);
  if (query.length < 2) return { results: [] as AdminGlobalRecord[], incomplete: false };
  const answers = await Promise.allSettled(groups.map(group => {
    const matchCount = (group.sql.match(/lower\(\?\)/g) ?? []).length;
    return database.prepare(group.sql).bind(...Array(matchCount).fill(query)).all<SearchRow>();
  }));
  const results: AdminGlobalRecord[] = [];
  let incomplete = false;
  for (let i = 0; i < answers.length; i += 1) {
    const answer = answers[i];
    if (answer.status !== "fulfilled") {
      // The portal migrates schemas independently; one missing source must not
      // hide healthy matches from other modules.
      incomplete = true;
      continue;
    }
    for (const row of answer.value.results ?? []) {
      if (!Number.isSafeInteger(row.id) || row.id < 1) continue;
      results.push({
        title: String(row.title || "Bez názvu"),
        subtitle: String(row.subtitle || ""),
        category: groups[i].category,
        href: groups[i].prefix + row.id,
      });
    }
  }
  return { results: results.slice(0, 36), incomplete };
}
