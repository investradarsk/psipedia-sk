import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import {
  processGooglePlaceBulkTarget,
  selectGooglePlaceBulkTargets,
} from "@/lib/google-place-bulk";
import { isGeoTargetType } from "@/lib/geo";

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
    if (action === "select-targets") {
      const selection = await selectGooglePlaceBulkTargets({
        count: body.count,
        filters: body.filters,
        cursor: body.cursor,
      });
      return Response.json(selection);
    }

    if (action === "process-target") {
      if (body.confirm !== "GOOGLE-PLACE-BULK") {
        return Response.json({ error: "Chýba explicitné GOOGLE-PLACE-BULK potvrdenie." }, { status: 400 });
      }
      const targetType = typeof body.targetType === "string" ? body.targetType : "";
      const targetId = Number(body.targetId);
      if (!isGeoTargetType(targetType) || !Number.isSafeInteger(targetId) || targetId <= 0) {
        return Response.json({ error: "Neplatný canonical Google bulk target." }, { status: 400 });
      }
      const result = await processGooglePlaceBulkTarget({
        targetType,
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
