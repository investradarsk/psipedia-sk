import { env } from "cloudflare:workers";
import { defaultNavigationItems, type NavigationItem } from "@/lib/navigation";
import { configFlagEnabled } from "@/config/runtime-env";

type NavigationRow = {
  id: string;
  label: string;
  href: string;
  parent_id: string | null;
  position: number;
  visible: number;
};

type RuntimeBindings = { DB?: D1Database; PUBLIC_MAP_ENABLED?: string };
let navigationSchemaReady: Promise<void> | null = null;

function getD1Binding() {
  const database = (env as unknown as RuntimeBindings).DB;
  return database && typeof database.prepare === "function" ? database : null;
}

async function ensureNavigationStore(database: D1Database) {
  if (navigationSchemaReady) return navigationSchemaReady;
  navigationSchemaReady = database.prepare(`
    CREATE TABLE IF NOT EXISTS navigation_items (
      id TEXT PRIMARY KEY NOT NULL,
      label TEXT NOT NULL,
      href TEXT NOT NULL,
      parent_id TEXT,
      position INTEGER NOT NULL DEFAULT 0,
      visible INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL,
      updated_by TEXT NOT NULL
    )
  `).run().then(async () => {
    await database.prepare("CREATE INDEX IF NOT EXISTS navigation_items_parent_position_idx ON navigation_items (parent_id, position)").run();
  }).catch((error) => {
    navigationSchemaReady = null;
    throw error;
  });
  return navigationSchemaReady;
}

function rowToItem(row: NavigationRow): NavigationItem {
  return {
    id: row.id,
    label: row.label,
    href: row.href,
    parentId: row.parent_id,
    position: row.position,
    visible: Boolean(row.visible),
  };
}

export function applyPublicMapLaunchGate(items: NavigationItem[], enabled: boolean) {
  const withoutMap = items.filter((item) => item.id !== "mapa" && item.href !== "/mapa");
  if (!enabled) return withoutMap;
  const mapItem: NavigationItem = {
    id: "mapa",
    label: "Mapa",
    href: "/mapa",
    parentId: null,
    position: 4.5,
    visible: true,
  };
  const directoryIndex = withoutMap.findIndex((item) => item.parentId === null && item.href === "/adresar");
  if (directoryIndex < 0) return [...withoutMap, mapItem];
  return [
    ...withoutMap.slice(0, directoryIndex + 1),
    mapItem,
    ...withoutMap.slice(directoryIndex + 1),
  ];
}

export async function getNavigationItems() {
  const bindings = env as unknown as RuntimeBindings;
  const enabled = configFlagEnabled(bindings.PUBLIC_MAP_ENABLED);
  const database = getD1Binding();
  if (!database) return applyPublicMapLaunchGate(defaultNavigationItems, enabled);
  const result = await database.prepare("SELECT id, label, href, parent_id, position, visible FROM navigation_items ORDER BY position, label").all<NavigationRow>();
  const items = result.results.length ? result.results.map(rowToItem) : defaultNavigationItems;
  return applyPublicMapLaunchGate(items, enabled);
}

function normalizeInternalHref(value: string, label: string) {
  const href = value.trim().slice(0, 240);
  if (!href.startsWith("/") || href.startsWith("//")) {
    throw new Error(`Adresa položky „${label}“ musí byť interná cesta začínajúca znakom /.`);
  }
  if (/[\\\u0000-\u001f\u007f\s]/.test(href) || /(^|\/)\.\.?($|\/)/.test(href)) {
    throw new Error(`Adresa položky „${label}“ nie je platná interná cesta.`);
  }
  try {
    const parsed = new URL(href, "https://psipedia.sk");
    if (parsed.origin !== "https://psipedia.sk") throw new Error("external");
  } catch {
    throw new Error(`Adresa položky „${label}“ nie je platná interná cesta.`);
  }
  return href;
}

function normalizeItems(payload: unknown): NavigationItem[] {
  if (!Array.isArray(payload)) throw new Error("Zoznam navigácie nie je platný.");
  if (payload.length > 40) throw new Error("Navigácia môže mať najviac 40 položiek.");
  const seen = new Set<string>();
  const items = payload.map((raw, index) => {
    const value = raw as Partial<NavigationItem>;
    const id = typeof value.id === "string" ? value.id.trim().slice(0, 80) : "";
    const label = typeof value.label === "string" ? value.label.trim().slice(0, 80) : "";
    const rawHref = typeof value.href === "string" ? value.href : "";
    const parentId = typeof value.parentId === "string" && value.parentId.trim() ? value.parentId.trim().slice(0, 80) : null;
    if (!id || seen.has(id)) throw new Error("Každá položka musí mať jedinečný identifikátor.");
    if (!label) throw new Error(`Položka č. ${index + 1} nemá názov.`);
    const href = normalizeInternalHref(rawHref, label);
    seen.add(id);
    return { id, label, href, parentId, position: index, visible: value.visible !== false };
  });
  const ids = new Set(items.map((item) => item.id));
  const byId = new Map(items.map((item) => [item.id, item]));

  for (const item of items) {
    if (item.parentId && (!ids.has(item.parentId) || item.parentId === item.id)) {
      throw new Error(`Podmenu položky „${item.label}“ nemá platného rodiča.`);
    }

    const chain = new Set<string>([item.id]);
    let current = item;
    while (current.parentId) {
      if (chain.has(current.parentId)) throw new Error("Navigácia obsahuje cyklus v parent/child väzbách.");
      chain.add(current.parentId);
      const parent = byId.get(current.parentId);
      if (!parent) break;
      current = parent;
    }

    const parent = item.parentId ? byId.get(item.parentId) : null;
    if (parent?.parentId) throw new Error("Navigácia podporuje iba jednu úroveň podmenu.");
  }

  const visibleTargets = new Map<string, string>();
  for (const item of items.filter((candidate) => candidate.visible)) {
    const key = item.href.toLocaleLowerCase("sk-SK");
    const previous = visibleTargets.get(key);
    if (previous) {
      throw new Error(`Aktívne položky „${previous}“ a „${item.label}“ smerujú na rovnakú adresu ${item.href}.`);
    }
    visibleTargets.set(key, item.label);
  }

  return items;
}

export async function saveNavigationItems(payload: unknown, updatedBy: string) {
  const database = getD1Binding();
  if (!database) throw new Error("Databáza navigácie zatiaľ nie je pripojená.");
  await ensureNavigationStore(database);
  const items = normalizeItems(payload);
  const now = new Date().toISOString();
  const statements = [database.prepare("DELETE FROM navigation_items")];
  for (const item of items) {
    statements.push(database.prepare(`
      INSERT INTO navigation_items (id, label, href, parent_id, position, visible, updated_at, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(item.id, item.label, item.href, item.parentId, item.position, item.visible ? 1 : 0, now, updatedBy));
  }
  await database.batch(statements);
  return items;
}
