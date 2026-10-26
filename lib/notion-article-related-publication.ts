/**
 * Fail closed for Notion-authored "Súvisiaci článok" manifest blocks.
 * The editor picker already filters published articles; Notion JSON needs
 * the equivalent protection before creating or updating an Admin draft.
 */
export async function assertPublishedRelatedBlocks(
  blocks: readonly { type: string; href?: string }[],
  currentSlug: string,
  lookupCanonicalPublishedHref: (slug: string) => Promise<string | null>,
  siteOrigin = "https://psipedia.sk",
): Promise<void> {
  const origin = new URL(siteOrigin).origin;
  const seen = new Map<string, string | null>();

  for (const block of blocks) {
    if (block.type !== "related") continue;
    const href = block.href?.trim() ?? "";
    let url: URL;
    try {
      url = new URL(href, origin);
    } catch {
      throw new Error("Súvisiaci článok má neplatnú URL.");
    }
    if (!href || (!href.startsWith("/") && !href.startsWith(origin + "/"))
      || url.origin !== origin || url.search || url.hash || url.username || url.password) {
      throw new Error("Súvisiaci článok musí používať internú kanonickú URL Psipedie.");
    }
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length !== 2 || !/^[a-z0-9-]+$/.test(parts[1]) || parts[1] === currentSlug) {
      throw new Error("Súvisiaci článok nemá platnú samostatnú adresu.");
    }
    const slug = parts[1];
    if (!seen.has(slug)) seen.set(slug, await lookupCanonicalPublishedHref(slug));
    if (seen.get(slug) !== url.pathname) {
      throw new Error(`Súvisiaci článok ${url.pathname} nie je publikovaný na svojej kanonickej adrese.`);
    }
  }
}
