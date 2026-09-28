export type EditorialAuthorKind = "individual" | "team" | "external";

export type EditorialAuthorProfile = {
  id: number;
  slug: string;
  kind: EditorialAuthorKind;
  displayName: string;
  avatarUrl: string | null;
  shortBio: string;
  role: string;
  active: boolean;
  isDefault: boolean;
};

type EditorialAuthorProfileRow = {
  id: number;
  slug: string;
  kind: string;
  display_name: string;
  avatar_url: string | null;
  short_bio: string;
  role: string;
  is_active: number;
  is_default: number;
};

function rowToProfile(row: EditorialAuthorProfileRow): EditorialAuthorProfile {
  return {
    id: Number(row.id),
    slug: row.slug,
    kind: row.kind === "individual" || row.kind === "external" ? row.kind : "team",
    displayName: row.display_name,
    avatarUrl: row.avatar_url || null,
    shortBio: row.short_bio || "",
    role: row.role || "",
    active: Boolean(row.is_active),
    isDefault: Boolean(row.is_default),
  };
}

export async function listEditorialAuthorProfiles(database: D1Database, includeInactive = false) {
  const where = includeInactive ? "" : "WHERE is_active = 1";
  const result = await database.prepare(`
    SELECT id, slug, kind, display_name, avatar_url, short_bio, role, is_active, is_default
    FROM editorial_author_profiles
    ${where}
    ORDER BY is_default DESC, display_name COLLATE NOCASE ASC, id ASC
  `).all<EditorialAuthorProfileRow>();
  return result.results.map(rowToProfile);
}

export async function getEditorialAuthorProfile(
  database: D1Database,
  id: number,
  activeOnly = true,
): Promise<EditorialAuthorProfile | null> {
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const row = await database.prepare(`
    SELECT id, slug, kind, display_name, avatar_url, short_bio, role, is_active, is_default
    FROM editorial_author_profiles
    WHERE id = ? ${activeOnly ? "AND is_active = 1" : ""}
    LIMIT 1
  `).bind(id).first<EditorialAuthorProfileRow>();
  return row ? rowToProfile(row) : null;
}

export async function getDefaultEditorialAuthorProfile(database: D1Database) {
  const row = await database.prepare(`
    SELECT id, slug, kind, display_name, avatar_url, short_bio, role, is_active, is_default
    FROM editorial_author_profiles
    WHERE is_active = 1 AND is_default = 1
    ORDER BY id ASC
    LIMIT 1
  `).first<EditorialAuthorProfileRow>();
  return row ? rowToProfile(row) : null;
}

export async function resolveArticleAuthorSelection(
  database: D1Database,
  input: { authorProfileId?: number | null; legacyAuthor?: string | null },
): Promise<{ authorProfileId: number | null; author: string }> {
  const legacyAuthor = input.legacyAuthor?.trim() || "";
  if (input.authorProfileId !== undefined && input.authorProfileId !== null) {
    const profile = await getEditorialAuthorProfile(database, Number(input.authorProfileId), true);
    if (!profile) throw new Error("Vybraný autor neexistuje alebo nie je aktívny.");
    return { authorProfileId: profile.id, author: profile.displayName };
  }

  if (legacyAuthor && legacyAuthor !== "Redakcia Psipedia") {
    return { authorProfileId: null, author: legacyAuthor };
  }

  const defaultProfile = await getDefaultEditorialAuthorProfile(database);
  if (defaultProfile) return { authorProfileId: defaultProfile.id, author: defaultProfile.displayName };
  return { authorProfileId: null, author: legacyAuthor || "Redakcia Psipedia" };
}


export type EditorialAuthorProfileInput = {
  displayName?: unknown;
  kind?: unknown;
  avatarUrl?: unknown;
  shortBio?: unknown;
  role?: unknown;
  active?: unknown;
  isDefault?: unknown;
};

function safeAuthorText(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function slugifyEditorialAuthorName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70) || "autor";
}

export function normalizeEditorialAuthorProfileInput(input: EditorialAuthorProfileInput) {
  const displayName = safeAuthorText(input.displayName, 160);
  const kind: EditorialAuthorKind = input.kind === "individual" || input.kind === "external" ? input.kind : "team";
  const avatarUrl = safeAuthorText(input.avatarUrl, 2_000);
  const shortBio = safeAuthorText(input.shortBio, 1_200);
  const role = safeAuthorText(input.role, 160);
  const active = input.active !== false;
  const isDefault = input.isDefault === true;

  if (displayName.length < 2) throw new Error("Meno autora musí mať aspoň 2 znaky.");
  if (avatarUrl && !avatarUrl.startsWith("/media/")) {
    let parsed: URL;
    try {
      parsed = new URL(avatarUrl);
    } catch {
      throw new Error("Avatar musí byť platná HTTPS adresa alebo interný obrázok.");
    }
    if (parsed.protocol !== "https:") throw new Error("Avatar musí používať HTTPS.");
  }
  if (isDefault && !active) throw new Error("Predvolený autor musí zostať aktívny.");

  return { displayName, kind, avatarUrl: avatarUrl || null, shortBio, role, active, isDefault };
}

async function uniqueEditorialAuthorSlug(database: D1Database, displayName: string, excludeId?: number) {
  const base = slugifyEditorialAuthorName(displayName);
  for (let suffix = 1; suffix <= 100; suffix += 1) {
    const slug = suffix === 1 ? base : `${base}-${suffix}`;
    const row = await database.prepare(
      `SELECT id FROM editorial_author_profiles WHERE slug = ? ${excludeId ? "AND id <> ?" : ""} LIMIT 1`,
    ).bind(...(excludeId ? [slug, excludeId] : [slug])).first<{ id: number }>();
    if (!row) return slug;
  }
  throw new Error("Pre autora sa nepodarilo vytvoriť jedinečnú adresu.");
}

export async function createEditorialAuthorProfile(
  database: D1Database,
  rawInput: EditorialAuthorProfileInput,
  editorEmail: string,
) {
  const input = normalizeEditorialAuthorProfileInput(rawInput);
  const slug = await uniqueEditorialAuthorSlug(database, input.displayName);
  const now = new Date().toISOString();

  const row = await database.prepare(`
    INSERT INTO editorial_author_profiles (
      slug, kind, display_name, avatar_url, short_bio, role, is_active, is_default,
      created_at, updated_at, created_by, updated_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
    RETURNING id, slug, kind, display_name, avatar_url, short_bio, role, is_active, is_default
  `).bind(
    slug,
    input.kind,
    input.displayName,
    input.avatarUrl,
    input.shortBio,
    input.role,
    input.active ? 1 : 0,
    now,
    now,
    editorEmail,
    editorEmail,
  ).first<EditorialAuthorProfileRow>();

  if (!row) throw new Error("Profil autora sa nepodarilo vytvoriť.");

  if (input.isDefault) {
    await database.batch([
      database.prepare("UPDATE editorial_author_profiles SET is_default = 0, updated_at = ?, updated_by = ? WHERE is_default = 1 AND id <> ?")
        .bind(now, editorEmail, row.id),
      database.prepare("UPDATE editorial_author_profiles SET is_default = 1, is_active = 1, updated_at = ?, updated_by = ? WHERE id = ?")
        .bind(now, editorEmail, row.id),
    ]);
  }

  const saved = await getEditorialAuthorProfile(database, row.id, false);
  if (!saved) throw new Error("Profil autora sa po uložení nepodarilo načítať.");
  return saved;
}

export async function updateEditorialAuthorProfile(
  database: D1Database,
  id: number,
  rawInput: EditorialAuthorProfileInput,
  editorEmail: string,
) {
  const current = await getEditorialAuthorProfile(database, id, false);
  if (!current) throw new Error("Profil autora sa nenašiel.");
  const input = normalizeEditorialAuthorProfileInput(rawInput);
  if (current.isDefault && !input.active) {
    throw new Error("Predvoleného autora nemožno deaktivovať. Najprv nastav iný predvolený profil.");
  }
  const slug = await uniqueEditorialAuthorSlug(database, input.displayName, id);
  const now = new Date().toISOString();
  const keepDefault = current.isDefault || input.isDefault;

  if (input.isDefault && !current.isDefault) {
    await database.batch([
      database.prepare("UPDATE editorial_author_profiles SET is_default = 0, updated_at = ?, updated_by = ? WHERE is_default = 1 AND id <> ?")
        .bind(now, editorEmail, id),
      database.prepare(`
        UPDATE editorial_author_profiles SET
          slug = ?, kind = ?, display_name = ?, avatar_url = ?, short_bio = ?, role = ?,
          is_active = 1, is_default = 1, updated_at = ?, updated_by = ?
        WHERE id = ?
      `).bind(
        slug,
        input.kind,
        input.displayName,
        input.avatarUrl,
        input.shortBio,
        input.role,
        now,
        editorEmail,
        id,
      ),
    ]);
  } else {
    await database.prepare(`
      UPDATE editorial_author_profiles SET
        slug = ?, kind = ?, display_name = ?, avatar_url = ?, short_bio = ?, role = ?,
        is_active = ?, is_default = ?, updated_at = ?, updated_by = ?
      WHERE id = ?
    `).bind(
      slug,
      input.kind,
      input.displayName,
      input.avatarUrl,
      input.shortBio,
      input.role,
      input.active ? 1 : 0,
      keepDefault ? 1 : 0,
      now,
      editorEmail,
      id,
    ).run();
  }

  const saved = await getEditorialAuthorProfile(database, id, false);
  if (!saved) throw new Error("Profil autora sa po uložení nepodarilo načítať.");
  return saved;
}
