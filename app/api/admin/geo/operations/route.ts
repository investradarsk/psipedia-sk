import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { isGeoTargetType, type GeoTargetType } from "@/lib/geo";
import { geoapifyApiKey } from "@/lib/geoapify-geocoder";
import { initializeGeoCandidates, previewGeoCandidates, runGeoCanary } from "@/lib/geo-operations";

export const dynamic = "force-dynamic";

function int(value: string | null, fallback: number, max: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isSafeInteger(parsed) ? Math.max(1, Math.min(max, parsed)) : fallback;
}

function target(value: string | null): GeoTargetType | null {
  const normalized = value?.toUpperCase() ?? "";
  return isGeoTargetType(normalized) ? normalized : null;
}

function sameOriginJson(request: Request) {
  const origin = request.headers.get("origin");
  return Boolean(origin) && origin === new URL(request.url).origin
    && (request.headers.get("content-type")?.toLowerCase().includes("application/json") ?? false);
}

export async function GET(request: Request) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();
  const url = new URL(request.url);
  try {
    const preview = await previewGeoCandidates({
      limit: int(url.searchParams.get("limit"), 50, 200),
      targetType: target(url.searchParams.get("target")),
      directoryCategory: url.searchParams.get("category") || null,
    });
    return Response.json({
      preview,
      providerConfigured: Boolean(geoapifyApiKey()),
      fullBackfillEnabled: false,
      productionInventoryExecuted: false,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Geo dry-run nie je dostupný." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();
  if (!sameOriginJson(request)) return Response.json({ error: "Neplatný pôvod alebo formát požiadavky." }, { status: 403 });
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return Response.json({ error: "Neplatné JSON dáta." }, { status: 400 }); }

  const action = typeof body.action === "string" ? body.action : "";
  const targetType = typeof body.targetType === "string" ? target(body.targetType) : null;
  const directoryCategory = typeof body.directoryCategory === "string" ? body.directoryCategory : null;

  try {
    if (action === "initialize") {
      if (body.confirm !== "INITIALIZE") return Response.json({ error: "Chýba explicitné INITIALIZE potvrdenie." }, { status: 400 });
      const limit = Math.max(1, Math.min(100, Math.trunc(Number(body.limit) || 20)));
      const report = await initializeGeoCandidates({ limit, actorRef: user.email, targetType, directoryCategory });
      return Response.json({ report, fullBackfillEnabled: false });
    }

    if (action === "canary") {
      if (body.confirm !== "CANARY") return Response.json({ error: "Chýba explicitné CANARY potvrdenie." }, { status: 400 });
      const limit = Math.max(1, Math.min(10, Math.trunc(Number(body.limit) || 5)));
      const report = await runGeoCanary({ limit, targetType, directoryCategory });
      return Response.json({ report, persisted: false });
    }

    return Response.json({ error: "Neznáma geo operations akcia." }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Geo operations akcia zlyhala." }, { status: 409 });
  }
}
