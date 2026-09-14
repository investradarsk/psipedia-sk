import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { applyManagedHelpBulk, preflightManagedHelpBulk } from "@/lib/help-bulk-store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();
  if (request.headers.get("origin") !== new URL(request.url).origin || !request.headers.get("content-type")?.startsWith("application/json")) {
    return Response.json({ error: "Neplatný pôvod požiadavky." }, { status: 403 });
  }
  try {
    const body = await request.json() as { action?: string };
    if (body.action === "preflight") return Response.json(await preflightManagedHelpBulk(body));
    if (body.action === "apply") return Response.json(await applyManagedHelpBulk(body, user.email));
    return Response.json({ error: "Neplatná hromadná akcia." }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Hromadná zmena zlyhala." }, { status: 409 });
  }
}
