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
