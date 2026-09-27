import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import {
  applyGooglePlaceCanary,
  GOOGLE_PLACE_CANARY_DEFAULT,
  GOOGLE_PLACE_CANARY_MAX,
  previewGooglePlaceCanary,
} from "@/lib/google-place-canary";
import { googlePlacesApiKey } from "@/lib/google-places-provider";

export const dynamic = "force-dynamic";

function sameOriginJson(request: Request) {
  const origin = request.headers.get("origin");
  return Boolean(origin)
    && origin === new URL(request.url).origin
    && (request.headers.get("content-type")?.toLowerCase().includes("application/json") ?? false);
}

export async function GET() {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();
  return Response.json({
    configured: Boolean(googlePlacesApiKey()),
    defaultLimit: GOOGLE_PLACE_CANARY_DEFAULT,
    maxLimit: GOOGLE_PLACE_CANARY_MAX,
    productionWrites: "explicit-apply-only",
  }, { headers: { "Cache-Control": "private, no-store" } });
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

  try {
    if (body.action === "preview") {
      const limit = Math.max(1, Math.min(GOOGLE_PLACE_CANARY_MAX, Math.trunc(Number(body.limit) || GOOGLE_PLACE_CANARY_DEFAULT)));
      const report = await previewGooglePlaceCanary({ targetIds: body.targetIds, limit });
      return Response.json({ report, persisted: false, providerCalled: true });
    }
    if (body.action === "apply") {
      const report = await applyGooglePlaceCanary({
        selections: body.selections,
        confirmation: body.confirmation,
      });
      return Response.json({ report, persisted: report.written > 0, providerCalled: true });
    }
    return Response.json({ error: "Neznáma Google Places canary akcia." }, { status: 400 });
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : "Google Places canary zlyhal.",
    }, { status: 409 });
  }
}
