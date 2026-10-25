/**
 * Conservative policy for a Notion-to-canonical DIRECTORY update.
 *
 * Unconfirmed and online/service-area profiles MUST NOT be promoted to a
 * verified exact address just because a region/city/editorial field changed.
 * The only source of an exact public business address is an explicitly
 * confirmed service location followed by provider verification.
 */
export function notionDirectoryUpdateSafety(input: {
  physicalAddressChanged: boolean;
  notionConfirmedLocation: boolean;
  canonicalConfirmedLocation: boolean;
  notionPublicPhone: string;
  canonicalPublicPhone: string;
}) {
  return {
    verifyExactAddress: input.notionConfirmedLocation &&
      (input.physicalAddressChanged || !input.canonicalConfirmedLocation),
    // A stale, unchecked Notion boolean must never demote an already confirmed
    // canonical service location or its associated GEO / Google Place anchor.
    blocksConfirmedAddressDowngrade:
      input.canonicalConfirmedLocation && !input.notionConfirmedLocation,
    // An unchanged legacy value can be a valid two-number contact string even
    // though the admin editor only accepts one telephone. Omit it from the
    // patch rather than revalidating/rewriting it or losing the second number.
    preserveUnchangedCanonicalPhone:
      input.notionPublicPhone === input.canonicalPublicPhone,
  };
}

/**
 * A missing Directory D1 mapping can be recovered only from editorial
 * snapshots that are presently identical. The Notion "Sync hash" property
 * is self-reported metadata, NOT evidence of a previously acknowledged
 * canonical baseline. A divergent page requires operator review.
 */
export function canRecoverNotionDirectoryMapping(
  canonicalHash: string,
  notionHash: string,
): boolean {
  return Boolean(canonicalHash) && canonicalHash === notionHash;
}

/**
 * Mapped Notion Directory pages must remain in the configured canonical data
 * source. A moved, trashed, or wrong-parent page is never a safe PATCH target.
 * This guard uses existing page metadata and needs no D1 migration.
 */
/** A foreign/moved page must never receive even a Sync chyba metadata PATCH. */
export class NotionDirectoryUnsafeTargetError extends Error {}

export function notionDirectoryPageBelongsToSource(
  page: {
    archived?: boolean;
    in_trash?: boolean;
    parent?: { type?: string; data_source_id?: string };
  },
  expectedDataSourceId: string,
): boolean {
  const valid = /^[0-9a-f]{32}$/i;
  const normalized = (value: string) => value.replaceAll("-", "").toLowerCase();
  const expected = normalized(expectedDataSourceId);
  const actual = normalized(page.parent?.data_source_id ?? "");
  return !page.archived && !page.in_trash
    && page.parent?.type === "data_source_id"
    && valid.test(expected) && actual === expected;
}
