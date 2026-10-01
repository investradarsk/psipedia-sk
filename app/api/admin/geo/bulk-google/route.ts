import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import {
  processGooglePlaceBulkTarget,
  validateGooglePlaceBulkTargetIds,
} from "@/lib/google-place-bulk";

export const dynamic = "force-dynamic";

function sameOriginJson(request: Request) {
  const origin = request.headers.get("origin");
  return Boolean(origin)
    && origin === new URL(request.url).origin
    && (request.headers.get("content-type")?.toLowerCase().includes("application/json") ?? false);
}

export async function POST(request: Request) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();
  if (!sameOriginJson(request)) {
    return Response.json({ error: "Neplatný pôvod alebo formát požiadavky." }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Neplatné JSON dáta." }, { status: 400 });
  }

  const action = typeof body.action === "string" ? body.action : "";

  try {
    if (action === "validate-targets") {
      const targetIds = validateGooglePlaceBulkTargetIds(body.targetIds);
      return Response.json({ targetIds, count: targetIds.length });
    }

    if (action === "process-target") {
      if (body.confirm !== "GOOGLE-PLACE-BULK") {
        return Response.json({ error: "Chýba explicitné GOOGLE-PLACE-BULK potvrdenie." }, { status: 400 });
      }
      const targetId = Number(body.targetId);
      if (!Number.isSafeInteger(targetId) || targetId <= 0) {
        return Response.json({ error: "Neplatné profile ID." }, { status: 400 });
      }
      const result = await processGooglePlaceBulkTarget({
        targetId,
        actorRef: user.email,
      });
      return Response.json({ result });
    }

    return Response.json({ error: "Neznáma Google bulk akcia." }, { status: 400 });
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : "Google bulk operácia zlyhala.",
    }, { status: 409 });
  }
}
