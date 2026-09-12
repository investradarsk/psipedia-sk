import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { isFoundationResourceType, isFoundationSubmissionStatus, listModerationSubmissions } from "@/lib/moderation-store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();
  const url = new URL(request.url);
  const statusValue = url.searchParams.get("status");
  const resourceValue = url.searchParams.get("resourceType");
  if (statusValue && !isFoundationSubmissionStatus(statusValue)) return Response.json({ error: "Neplatný stav." }, { status: 400 });
  if (resourceValue && !isFoundationResourceType(resourceValue)) return Response.json({ error: "Neplatný typ zdroja." }, { status: 400 });
  const rows = await listModerationSubmissions({ status: statusValue || undefined, resourceType: resourceValue || undefined });
  return Response.json({ items: rows }, { headers: { "cache-control": "no-store" } });
}
