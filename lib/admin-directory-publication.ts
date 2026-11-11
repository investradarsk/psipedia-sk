/**
 * Owner-only, compare-and-swap transition used when a successful Directory form
 * save unexpectedly comes back as a draft. This never rewrites content fields
 * and never changes unrelated profile identities.
 */
export class DirectoryPublicationConflictError extends Error {
  constructor() {
    super("Profil bol medzičasom upravený alebo nie je koncept. Obnov ho a skús publikovať znova.");
    this.name = "DirectoryPublicationConflictError";
  }
}

export async function publishDirectoryDraftByCas(input: {
  db: D1Database;
  id: number;
  expectedUpdatedAt: string;
  expectedSlug: string;
  expectedCategory: string;
  actor: string;
  now?: string;
}): Promise<void> {
  const { db, id, expectedUpdatedAt, expectedSlug, expectedCategory, actor } = input;
  if (!Number.isSafeInteger(id) || id < 1 ||
      !expectedUpdatedAt || expectedUpdatedAt.length > 60 ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(expectedSlug) ||
      !/^[a-z0-9-]{2,80}$/.test(expectedCategory) ||
      typeof actor !== "string" || !actor.trim()) {
    throw new DirectoryPublicationConflictError();
  }
  const now = input.now ?? new Date().toISOString();
  const updated = await db.prepare(
    "UPDATE directory_profiles SET status='published'," +
    "published_at=COALESCE(published_at,?),updated_at=?,updated_by=? " +
    "WHERE id=? AND status='draft' AND updated_at=? AND slug=? AND category=? " +
    "RETURNING id"
  ).bind(now, now, actor, id, expectedUpdatedAt, expectedSlug, expectedCategory)
    .first<{ id: number }>();
  if (updated?.id !== id) throw new DirectoryPublicationConflictError();
}
