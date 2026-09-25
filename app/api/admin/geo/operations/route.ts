import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { isGeoPublicPrecision, isGeoPublicVisibility, isGeoTargetType, type GeoTargetType } from "@/lib/geo";
import { geoapifyApiKey } from "@/lib/geoapify-geocoder";
import {
  initializeGeoCandidates,
  previewExplicitGeoOnboarding,
  previewGeoCandidates,
  previewSafeGeoInitialization,
  runExplicitGeoOnboarding,
  runGeoBackfillChunk,
  runGeoCanary,
  validateExplicitGeoTargetIds,
} from "@/lib/geo-operations";

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
    const targetType = target(url.searchParams.get("target"));
    const directoryCategory = url.searchParams.get("category") || null;
    const preview = await previewGeoCandidates({
      limit: int(url.searchParams.get("limit"), 50, 200),
      targetType,
      directoryCategory,
    });
    const safeInitialization = targetType
      ? await previewSafeGeoInitialization({
          limit: 20,
          targetType,
          directoryCategory,
        })
      : null;
    return Response.json({
      preview,
      safeInitialization,
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
    if (action === "explicit-preview" || action === "explicit-onboard") {
      if (!targetType) return Response.json({ error: "Explicitný onboarding vyžaduje explicitný targetType." }, { status: 400 });
      let targetIds: number[];
      try { targetIds = validateExplicitGeoTargetIds(body.targetIds); }
      catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Neplatné target IDs." }, { status: 400 });
      }
      const visibility = body.visibility;
      const precision = body.precision;
      if (!isGeoPublicVisibility(visibility)) {
        return Response.json({ error: "Explicitný onboarding vyžaduje platnú visibility." }, { status: 400 });
      }
      if (!isGeoPublicPrecision(precision)) {
        return Response.json({ error: "Explicitný onboarding vyžaduje platnú precision." }, { status: 400 });
      }

      if (action === "explicit-preview") {
        const report = await previewExplicitGeoOnboarding({ targetType, targetIds, visibility, precision });
        return Response.json({ report, persisted: false, providerCalled: false });
      }

      if (body.confirm !== "EXPLICIT-ONBOARD") {
        return Response.json({ error: "Chýba explicitné EXPLICIT-ONBOARD potvrdenie." }, { status: 400 });
      }
      const report = await runExplicitGeoOnboarding({
        targetType,
        targetIds,
        visibility,
        precision,
        actorRef: user.email,
      });
      return Response.json({ report, persisted: true, fullBackfillEnabled: false });
    }

    if (action === "initialize") {
      if (body.confirm !== "INITIALIZE") return Response.json({ error: "Chýba explicitné INITIALIZE potvrdenie." }, { status: 400 });
      const safeOnly = body.safeOnly === true;
      if (safeOnly && !targetType) return Response.json({ error: "Safe-only initialization vyžaduje explicitný target type." }, { status: 400 });
      if (safeOnly && targetType === "DIRECTORY_PROFILE" && !directoryCategory) {
        return Response.json({ error: "Safe-only directory initialization vyžaduje explicitnú category." }, { status: 400 });
      }
      const limit = Math.max(1, Math.min(100, Math.trunc(Number(body.limit) || 20)));
      const report = await initializeGeoCandidates({ limit, actorRef: user.email, targetType, directoryCategory, safeOnly });
      return Response.json({ report, fullBackfillEnabled: false });
    }

    if (action === "canary") {
      if (body.confirm !== "CANARY") return Response.json({ error: "Chýba explicitné CANARY potvrdenie." }, { status: 400 });
      const limit = Math.max(1, Math.min(10, Math.trunc(Number(body.limit) || 5)));
      const report = await runGeoCanary({ limit, targetType, directoryCategory });
      return Response.json({ report, persisted: false });
    }

    if (action === "backfill") {
      if (body.confirm !== "BACKFILL-CHUNK") return Response.json({ error: "Chýba explicitné BACKFILL-CHUNK potvrdenie." }, { status: 400 });
      if (!targetType) return Response.json({ error: "Bounded backfill vyžaduje explicitný target type." }, { status: 400 });
      if (targetType === "DIRECTORY_PROFILE" && !directoryCategory) {
        return Response.json({ error: "Directory backfill vyžaduje explicitnú category." }, { status: 400 });
      }
      const limit = Math.max(1, Math.min(20, Math.trunc(Number(body.limit) || 5)));
      const report = await runGeoBackfillChunk({ limit, targetType, directoryCategory });
      return Response.json({ report, persisted: true, fullBackfillEnabled: false });
    }

    return Response.json({ error: "Neznáma geo operations akcia." }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Geo operations akcia zlyhala." }, { status: 409 });
  }
}
