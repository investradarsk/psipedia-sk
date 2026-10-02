import { env } from "cloudflare:workers";
import { cache } from "react";
import { portalSections, type PortalSection, type PortalSubpage, type SectionHeroConfig } from "@/lib/portal";

export type ManagedPortalSection = PortalSection & { position: number; visible: boolean; updatedAt?: string };
export type ManagedPortalSectionArticleCounts = { total: number; published: number; scheduled: number; draft: number };
export type ManagedPortalSectionArticleCountResult = {
  available: boolean;
  counts: Record<string, ManagedPortalSectionArticleCounts>;
};
type ArticleCountRow = { slug: string; total: number; published: number; scheduled: number; draft: number };
type Row = { slug: string; label: string; eyebrow: string; description: string; intro: string; hero_config_json?: string; subpages_json: string; position: number; visible: number; updated_at?: string };
type ManagedSubpagesRow = { slug: string; subpages_json: string };
type RuntimeBindings = { DB?: D1Database };
let ready: Promise<void> | null = null;
let dataRepairReady: Promise<void> | null = null;
const legacyActivityDescriptions: Record<string, string> = {
  "psie-sporty": "Agility, obedience, nosework, canicross, aporty a ďalšie disciplíny.",
  "vylety-so-psom": "Trasy, náročnosť, pravidlá a praktická výbava.",
  "dog-friendly-miesta": "Miesta, kde sú psy vítané a podmienky sú jasné vopred.",
  "dovolenka-so-psom": "Ubytovanie, cestovanie, doklady a bezpečný režim.",
};
const adminFieldLabels = new Set(["adresa", "adresa url", "názov", "názov sekcie", "slug", "url"]);

function database() {
  const db = (env as unknown as RuntimeBindings).DB;
  return db && typeof db.prepare === "function" ? db : null;
}

async function ensure(db: D1Database) {
  if (ready) return ready;
  ready = (async () => {
    await db.prepare(`CREATE TABLE IF NOT EXISTS portal_section_settings (
      slug TEXT PRIMARY KEY NOT NULL, label TEXT NOT NULL, eyebrow TEXT NOT NULL,
      description TEXT NOT NULL, intro TEXT NOT NULL, hero_config_json TEXT NOT NULL DEFAULT '{}', subpages_json TEXT NOT NULL DEFAULT '[]',
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

async function repairCorruptManagedSubpages(db: D1Database) {
  if (dataRepairReady) return dataRepairReady;
  dataRepairReady = (async () => {
    const result = await db.prepare("SELECT slug,subpages_json FROM portal_section_settings WHERE slug IN ('steniatka','aktivity')").all<ManagedSubpagesRow>();
    const now = new Date().toISOString();
    const updates: D1PreparedStatement[] = [];

    for (const row of result.results) {
      let parsed: unknown;
      try { parsed = JSON.parse(row.subpages_json); }
      catch { continue; }
      if (!Array.isArray(parsed)) continue;

      let changed = false;
      let subpages = parsed.map((item) => ({ ...(item as Record<string, unknown>) }));

      if (row.slug === "steniatka") {
        const defaults = portalSections.find((section) => section.slug === "steniatka")?.subpages.find((item) => item.slug === "prve-dni");
        subpages = subpages.map((item) => {
          const normalizedLabel = String(item.label ?? "").trim().replace(/\s+/g, " ");
          if (item.slug === "prve-dni" && normalizedLabel === "Prvé dni doma so šteniatkom Adresa URL" && defaults) {
            changed = true;
            return { ...item, label: defaults.label };
          }
          return item;
        });
      }

      if (row.slug === "aktivity") {
        const hasCanonicalTraining = subpages.some((item) => item.slug === "trening");
        if (hasCanonicalTraining) {
          const before = subpages.length;
          subpages = subpages.filter((item) => {
            const normalizedLabel = String(item.label ?? "").trim().toLocaleLowerCase("sk-SK").replace(/\s+/g, " ");
            return !(item.slug !== "trening" && (normalizedLabel === "tréning psa" || normalizedLabel === "trening psa"));
          });
          if (subpages.length !== before) changed = true;
        }
      }

      if (changed) {
        updates.push(db.prepare("UPDATE portal_section_settings SET subpages_json=?,updated_at=?,updated_by=? WHERE slug=? AND subpages_json=?")
          .bind(JSON.stringify(subpages), now, "system:data-repair", row.slug, row.subpages_json));
      }
    }

    if (updates.length) await db.batch(updates);
  })().catch((error) => { dataRepairReady = null; throw error; });
  return dataRepairReady;
}

function safeHeroHref(value: string) {
  return value.startsWith("/") || /^https:\/\//i.test(value);
}

function cleanHeroConfig(value: unknown, strict = false): SectionHeroConfig {
  let raw = value;
  if (typeof raw === "string") {
    try { raw = JSON.parse(raw); }
    catch { return {}; }
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const item = raw as Partial<SectionHeroConfig>;
  const text = (input: unknown, max: number) => typeof input === "string" ? input.trim().slice(0, max) : "";
  const searchPlaceholder = text(item.searchPlaceholder, 180);
  const searchButtonLabel = text(item.searchButtonLabel, 60);
  const ctaLabel = text(item.ctaLabel, 90);
  const ctaHref = text(item.ctaHref, 300);
  const metaLabel = text(item.metaLabel, 120);
  if (strict && ctaHref && !safeHeroHref(ctaHref)) throw new Error("CTA URL musí byť interná /adresa alebo bezpečná https:// URL.");
  const ctaVariant = item.ctaVariant === "primary" || item.ctaVariant === "accent" || item.ctaVariant === "secondary"
    ? item.ctaVariant
    : undefined;
  const quickLinks = Array.isArray(item.quickLinks) ? item.quickLinks.slice(0, 6).flatMap((entry) => {
    const link = entry as { label?: unknown; href?: unknown; visible?: unknown };
    const label = text(link.label, 80);
    const href = text(link.href, 300);
    if (!label || !href) return [];
    if (!safeHeroHref(href)) {
      if (strict) throw new Error("Quick link URL musí byť interná /adresa alebo bezpečná https:// URL.");
      return [];
    }
    return [{ label, href, visible: link.visible !== false }];
  }) : [];
  return {
    ...(searchPlaceholder ? { searchPlaceholder } : {}),
    ...(searchButtonLabel ? { searchButtonLabel } : {}),
    ...(typeof item.ctaEnabled === "boolean" ? { ctaEnabled: item.ctaEnabled } : {}),
    ...(ctaLabel ? { ctaLabel } : {}),
    ...(ctaHref && safeHeroHref(ctaHref) ? { ctaHref } : {}),
    ...(ctaVariant ? { ctaVariant } : {}),
    ...(metaLabel ? { metaLabel } : {}),
    ...(quickLinks.length ? { quickLinks } : {}),
  };
}

async function selectSectionRows(db: D1Database) {
  try {
    return (await db.prepare("SELECT slug,label,eyebrow,description,intro,hero_config_json,subpages_json,position,visible,updated_at FROM portal_section_settings ORDER BY position,label").all<Row>()).results;
  } catch (error) {
    if (!(error instanceof Error) || !/hero_config_json|no such column/i.test(error.message)) throw error;
    const legacy = await db.prepare("SELECT slug,label,eyebrow,description,intro,subpages_json,position,visible,updated_at FROM portal_section_settings ORDER BY position,label").all<Row>();
    return legacy.results.map((row) => ({ ...row, hero_config_json: "{}" }));
  }
}

function parseSubpages(value: string, fallback: PortalSubpage[]) {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return fallback;
    const storedItems = parsed.map((item) => {
      const stored = item as PortalSubpage;
      const defaults = fallback.find((candidate) => candidate.slug === stored.slug);
      if (!defaults) return stored;
      const merged = { ...defaults, ...stored, heroConfig: { ...(defaults.heroConfig ?? {}), ...cleanHeroConfig(stored.heroConfig) } };
      if (stored.slug === "vycvik" && stored.label === "Výcvik") merged.label = defaults.label;
      if (stored.description === legacyActivityDescriptions[stored.slug]) merged.description = defaults.description;
      return merged;
    });
    const hasCanonicalTraining = fallback.some((item) => item.slug === "trening")
      && storedItems.some((item) => item.slug === "trening");
    const deduplicatedItems = hasCanonicalTraining
      ? storedItems.filter((item) => {
          const normalizedLabel = String(item.label ?? "").trim().toLocaleLowerCase("sk-SK").replace(/\s+/g, " ");
          return !(item.slug !== "trening" && (normalizedLabel === "tréning psa" || normalizedLabel === "trening psa"));
        })
      : storedItems;
    const storedSlugs = new Set(deduplicatedItems.map((item) => item.slug));
    return [...deduplicatedItems, ...fallback.filter((item) => !storedSlugs.has(item.slug))];
  }
  catch { return fallback; }
}

function merge(row: Row): ManagedPortalSection | null {
  const base = portalSections.find((section) => section.slug === row.slug);
  if (!base) return null;
  const label = (row.slug === "starostlivost" && row.label === "Starostlivosť") || (row.slug === "aktivity" && row.label === "Aktivity") ? base.label : row.label;
  const hasLegacyActivityCopy = row.slug === "aktivity" && row.eyebrow === "Spoločné zážitky" && row.description === "Psie športy, výlety a miesta, kde si môžete deň užiť spolu." && row.intro === "Nájdi aktivitu podľa kondície psa, svojich skúseností a času, ktorý máte k dispozícii.";
  return { ...base, label, eyebrow: hasLegacyActivityCopy ? base.eyebrow : row.eyebrow, description: hasLegacyActivityCopy ? base.description : row.description, intro: hasLegacyActivityCopy ? base.intro : row.intro, heroConfig: { ...(base.heroConfig ?? {}), ...cleanHeroConfig(row.hero_config_json) }, subpages: parseSubpages(row.subpages_json, base.subpages), position: row.position, visible: Boolean(row.visible), ...(row.updated_at ? { updatedAt: row.updated_at } : {}) };
}

export const listManagedPortalSections = cache(async function listManagedPortalSections(): Promise<ManagedPortalSection[]> {
  const db = database();
  if (!db) return portalSections.map((section, position) => ({ ...section, position, visible: true }));
  await repairCorruptManagedSubpages(db);
  const rows = await selectSectionRows(db);
  return rows.map(merge).filter((item): item is ManagedPortalSection => Boolean(item));
});

export const listManagedPortalSectionsForSitemap = cache(async function listManagedPortalSectionsForSitemap(): Promise<ManagedPortalSection[]> {
  const db = database();
  if (!db) return portalSections.map((section, position) => ({ ...section, position, visible: true }));
  // Sitemap generation is a read-only public request. Do not invoke the legacy
  // repair path here: parseSubpages/merge already normalize legacy values for
  // rendering without mutating production state.
  const rows = await selectSectionRows(db);
  return rows.map(merge).filter((item): item is ManagedPortalSection => Boolean(item));
});

export const getManagedPortalSection = cache(async function getManagedPortalSection(slug: string) {
  return (await listManagedPortalSections()).find((section) => section.slug === slug) ?? null;
});

export async function getManagedPortalSectionArticleCounts(): Promise<ManagedPortalSectionArticleCountResult> {
  const db = database();
  if (!db) return { available: false, counts: {} };

  try {
    const result = await db.prepare(`
      SELECT
        portal_section AS slug,
        COUNT(*) AS total,
        COALESCE(SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END), 0) AS published,
        COALESCE(SUM(CASE WHEN status = 'scheduled' THEN 1 ELSE 0 END), 0) AS scheduled,
        COALESCE(SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END), 0) AS draft
      FROM managed_articles
      GROUP BY portal_section
    `).all<ArticleCountRow>();

    return {
      available: true,
      counts: Object.fromEntries(result.results.map((row) => [row.slug, {
        total: Number(row.total ?? 0),
        published: Number(row.published ?? 0),
        scheduled: Number(row.scheduled ?? 0),
        draft: Number(row.draft ?? 0),
      }])),
    };
  } catch {
    return { available: false, counts: {} };
  }
}


export const getManagedPortalSubpage = cache(async function getManagedPortalSubpage(sectionSlug: string, subpageSlug: string) {
  const section = await getManagedPortalSection(sectionSlug);
  if (!section || !section.visible) return null;
  const subpage = section.subpages.find((item) => item.slug === subpageSlug && item.visible !== false);
  return subpage ? { section, subpage } : null;
});

function cleanSubpages(value: unknown): PortalSubpage[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 30).map((raw) => {
    const item = raw as Partial<PortalSubpage>;
    const slug = String(item.slug ?? "").trim().replace(/^\/+|\/+$/g, "").slice(0, 80);
    const label = String(item.label ?? "").trim().slice(0, 100);
    const normalizedLabel = label.toLocaleLowerCase("sk-SK").replace(/\s+/g, " ");
    const description = String(item.description ?? "").trim().slice(0, 400);
    const intro = item.intro ? String(item.intro).trim().slice(0, 3000) : undefined;
    const eyebrow = item.eyebrow ? String(item.eyebrow).trim().slice(0, 160) : undefined;
    const heroConfig = cleanHeroConfig(item.heroConfig, true);
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
    if (!/^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/.test(slug)) throw new Error("Adresa podsekcie musí byť platný slug bez úvodnej alebo koncovej pomlčky.");
    if (adminFieldLabels.has(normalizedLabel) || normalizedLabel.endsWith(" adresa url")) throw new Error("Názov podsekcie obsahuje technický názov administračného poľa. Zadaj verejný názov podsekcie.");
    if (imageUrl && !imageUrl.startsWith("/media/") && !imageUrl.startsWith("/images/") && !/^https:\/\//i.test(imageUrl)) throw new Error("Adresa obrázka oblasti nie je platná.");
    return {
      slug, label, description, visible: item.visible !== false,
      ...(icon ? { icon } : {}), ...(intro ? { intro } : {}), ...(eyebrow ? { eyebrow } : {}), ...(Object.keys(heroConfig).length ? { heroConfig } : {}), ...(imageUrl ? { imageUrl } : {}),
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
    const heroConfig = cleanHeroConfig(item.heroConfig, true);
    return db.prepare(`UPDATE portal_section_settings SET label=?,eyebrow=?,description=?,intro=?,hero_config_json=?,subpages_json=?,position=?,visible=?,updated_at=?,updated_by=? WHERE slug=?`)
      .bind(label, String(item.eyebrow ?? "").trim().slice(0, 160), String(item.description ?? "").trim().slice(0, 500), String(item.intro ?? "").trim().slice(0, 1200), JSON.stringify(heroConfig), JSON.stringify(cleanSubpages(item.subpages)), position, item.visible === false ? 0 : 1, now, user, item.slug);
  });
  try {
    await db.batch(statements);
  } catch (error) {
    if (error instanceof Error && /hero_config_json|no such column/i.test(error.message)) {
      throw new Error("Section hero konfigurácia vyžaduje produkčnú migráciu 0107_section_hero_config.sql.");
    }
    throw error;
  }
  return listManagedPortalSections();
}
