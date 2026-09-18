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
