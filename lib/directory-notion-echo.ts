/**
 * A targeted Admin -> D1 -> Notion mirror stores the exact revision returned
 * by Notion after its own PATCH. A signed webhook for that SAME revision is
 * an echo of our write, not permission to import a second value into D1.
 *
 * A subsequent genuine Notion edit advances its page revision and continues
 * through the existing per-property webhook handler. No new D1 table needed.
 */
export function isDirectoryAdminWritebackEcho(
  pageEditedAt: string | null | undefined,
  acknowledgedOutboundRevision: string | null | undefined,
  hasSignedChangedProperties: boolean,
): boolean {
  return hasSignedChangedProperties &&
    typeof pageEditedAt === "string" && pageEditedAt.length > 0 &&
    typeof acknowledgedOutboundRevision === "string" &&
    pageEditedAt === acknowledgedOutboundRevision;
}
