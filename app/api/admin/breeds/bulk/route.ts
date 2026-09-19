import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { bulkUpdateManagedBreedStatus } from "@/lib/breed-store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();
  if (request.headers.get("origin") !== new URL(request.url).origin
    || !request.headers.get("content-type")?.startsWith("application/json")) {
    return Response.json({ error: "Neplatný pôvod požiadavky." }, { status: 403 });
  }
  try {
    return Response.json(await bulkUpdateManagedBreedStatus(await request.json(), user.email));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Hromadná zmena zlyhala." }, { status: 409 });
  }
}
