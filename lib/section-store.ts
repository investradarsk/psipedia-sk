import { env } from "cloudflare:workers";
import { portalSections, type PortalSection, type PortalSubpage } from "@/lib/portal";

export type ManagedPortalSection = PortalSection & { position: number; visible: boolean };
type Row = { slug: string; label: string; eyebrow: string; description: string; intro: string; subpages_json: string; position: number; visible: number };
type RuntimeBindings = { DB?: D1Database };
let ready: Promise<void> | null = null;

function database() {
  const db = (env as unknown as RuntimeBindings).DB;
  return db && typeof db.prepare === "function" ? db : null;
}

async function ensure(db: D1Database) {
  if (ready) return ready;
  ready = (async () => {
    await db.prepare(`CREATE TABLE IF NOT EXISTS portal_section_settings (
      slug TEXT PRIMARY KEY NOT NULL, label TEXT NOT NULL, eyebrow TEXT NOT NULL,
      description TEXT NOT NULL, intro TEXT NOT NULL, subpages_json TEXT NOT NULL DEFAULT '[]',
      position INTEGER NOT NULL DEFAULT 0, visible INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL, updated_by TEXT NOT NULL
    )`).run();
    const now = new Date().toISOString();
    await db.batch(portalSections.map((section, position) => db.prepare(`
      INSERT OR IGNORE INTO portal_section_settings
      (slug,label,eyebrow,description,intro,subpages_json,position,visible,updated_at,updated_by)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `).bind(section.slug, section.label, section.eyebrow, section.description, section.intro, JSON.stringify(section.subpages), position, 1, now, "system@psipedia.sk")));
    const refreshedSections = portalSections.filter((section) => ["adresar", "pomoc-psom", "recenzie"].includes(section.slug));
    await db.batch(refreshedSections.map((section) => db.prepare(`
      UPDATE portal_section_settings
      SET label=?, description=?, intro=?, subpages_json=?, updated_at=?, updated_by=?
      WHERE slug=? AND (
        label IN ('Adresár','Recenzie') OR
        subpages_json LIKE '%"utulky-a-zachrana"%' OR
        subpages_json LIKE '%"urgentne-pripady"%' OR
        subpages_json LIKE '%"vybava"%'
      )
    `).bind(section.label, section.description, section.intro, JSON.stringify(section.subpages), now, "system@psipedia.sk", section.slug)));
  })().catch((error) => { ready = null; throw error; });
  return ready;
}

function parseSubpages(value: string, fallback: PortalSubpage[]) {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return fallback;
    return parsed.map((item) => {
      const stored = item as PortalSubpage;
      const defaults = fallback.find((candidate) => candidate.slug === stored.slug);
      if (!defaults) return stored;
      const merged = { ...defaults, ...stored };
      if (stored.slug === "vycvik" && stored.label === "Výcvik") merged.label = defaults.label;
      return merged;
    });
  }
  catch { return fallback; }
}

function merge(row: Row): ManagedPortalSection | null {
  const base = portalSections.find((section) => section.slug === row.slug);
  if (!base) return null;
  const label = row.slug === "starostlivost" && row.label === "Starostlivosť" ? base.label : row.label;
  return { ...base, label, eyebrow: row.eyebrow, description: row.description, intro: row.intro, subpages: parseSubpages(row.subpages_json, base.subpages), position: row.position, visible: Boolean(row.visible) };
}

export async function listManagedPortalSections() {
  const db = database();
  if (!db) return portalSections.map((section, position) => ({ ...section, position, visible: true }));
  const result = await db.prepare("SELECT slug,label,eyebrow,description,intro,subpages_json,position,visible FROM portal_section_settings ORDER BY position,label").all<Row>();
  return result.results.map(merge).filter((item): item is ManagedPortalSection => Boolean(item));
}

export async function getManagedPortalSection(slug: string) {
  return (await listManagedPortalSections()).find((section) => section.slug === slug) ?? null;
}

export async function getManagedPortalSubpage(sectionSlug: string, subpageSlug: string) {
  const section = await getManagedPortalSection(sectionSlug);
  if (!section || !section.visible) return null;
  const subpage = section.subpages.find((item) => item.slug === subpageSlug && item.visible !== false);
  return subpage ? { section, subpage } : null;
}

function cleanSubpages(value: unknown): PortalSubpage[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 30).map((raw) => {
    const item = raw as Partial<PortalSubpage>;
    const slug = String(item.slug ?? "").trim().replace(/^\/+|\/+$/g, "").slice(0, 80);
    const label = String(item.label ?? "").trim().slice(0, 100);
    const description = String(item.description ?? "").trim().slice(0, 400);
    const intro = item.intro ? String(item.intro).trim().slice(0, 3000) : undefined;
    const icon = item.icon ? String(item.icon).trim().slice(0, 12) : undefined;
    const imageUrl = item.imageUrl ? String(item.imageUrl).trim().slice(0, 500) : undefined;
    const imageAlt = item.imageAlt ? String(item.imageAlt).trim().slice(0, 220) : undefined;
    const href = item.href ? String(item.href).trim().slice(0, 240) : undefined;
    const cleanList = (list: unknown, max: number, length: number) => Array.isArray(list)
      ? list.map((entry) => String(entry).trim().slice(0, length)).filter(Boolean).slice(0, max)
      : [];
    const serviceLinks = Array.isArray(item.serviceLinks) ? item.serviceLinks.map((entry) => {
      const link = entry as { label?: unknown; href?: unknown };
      return { label: String(link.label ?? "").trim().slice(0, 100), href: String(link.href ?? "").trim().slice(0, 240) };
    }).filter((entry) => entry.label && (entry.href.startsWith("/") || /^https:\/\//i.test(entry.href))).slice(0, 6) : [];
    const expertAdvice = item.expertAdvice ? String(item.expertAdvice).trim().slice(0, 1800) : undefined;
    const seoTitle = item.seoTitle ? String(item.seoTitle).trim().slice(0, 80) : undefined;
    const metaDescription = item.metaDescription ? String(item.metaDescription).trim().slice(0, 200) : undefined;
    if (!slug || !label) throw new Error("Každá podsekcia musí mať názov a adresu.");
    if (imageUrl && !imageUrl.startsWith("/media/") && !imageUrl.startsWith("/images/") && !/^https:\/\//i.test(imageUrl)) throw new Error("Adresa obrázka oblasti nie je platná.");
    return {
      slug, label, description, visible: item.visible !== false,
      ...(icon ? { icon } : {}), ...(intro ? { intro } : {}), ...(imageUrl ? { imageUrl } : {}),
      ...(imageAlt ? { imageAlt } : {}), ...(href ? { href } : {}),
      popularTopics: cleanList(item.popularTopics, 8, 100),
      commonQuestions: cleanList(item.commonQuestions, 10, 220),
      homeSteps: cleanList(item.homeSteps, 10, 500),
      warningSigns: cleanList(item.warningSigns, 10, 500),
      ...(expertAdvice ? { expertAdvice } : {}), serviceLinks,
      featuredArticleSlugs: cleanList(item.featuredArticleSlugs, 10, 100),
      ...(seoTitle ? { seoTitle } : {}), ...(metaDescription ? { metaDescription } : {}),
    };
  });
}

export async function saveManagedPortalSections(payload: unknown, user: string) {
  if (!Array.isArray(payload)) throw new Error("Zoznam sekcií nie je platný.");
  const db = database();
  if (!db) throw new Error("Databáza sekcií nie je pripojená.");
  await ensure(db);
  const allowed = new Set(portalSections.map((section) => section.slug));
  const now = new Date().toISOString();
  const statements = payload.map((raw, position) => {
    const item = raw as Partial<ManagedPortalSection>;
    if (!item.slug || !allowed.has(item.slug)) throw new Error("Neznáma sekcia.");
    const label = String(item.label ?? "").trim().slice(0, 100);
    if (!label) throw new Error("Názov sekcie nemôže byť prázdny.");
    return db.prepare(`UPDATE portal_section_settings SET label=?,eyebrow=?,description=?,intro=?,subpages_json=?,position=?,visible=?,updated_at=?,updated_by=? WHERE slug=?`)
      .bind(label, String(item.eyebrow ?? "").trim().slice(0, 160), String(item.description ?? "").trim().slice(0, 500), String(item.intro ?? "").trim().slice(0, 1200), JSON.stringify(cleanSubpages(item.subpages)), position, item.visible === false ? 0 : 1, now, user, item.slug);
  });
  await db.batch(statements);
  return listManagedPortalSections();
}
