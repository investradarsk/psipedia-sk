import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { NOTION_AUTHORITY_GROUPS } from "@/lib/notion-field-authority";
import { manualTransferCatalog } from "@/lib/notion-manual-transfer-contract";

export const dynamic = "force-dynamic";

/**
 * Part 1/3: authenticated, read-only scope/field capability listing.
 * No queue run, Notion request, production write or transfer button here.
 */
export async function GET() {
  if (!(await getAdminApiUser())) return unauthorizedAdminResponse();
  return Response.json({
    version: 1,
    stage: "FOUNDATION_ONLY",
    executable: false,
    areas: manualTransferCatalog(NOTION_AUTHORITY_GROUPS),
    excluded: ["articles", "facebook-images", "service-catalog"],
    note: "Samostatný manuálny prenos sa sprístupní až po doplnení vykonávača, kontroly rozdielov a reportov.",
  }, { headers: { "Cache-Control": "no-store" } });
}
