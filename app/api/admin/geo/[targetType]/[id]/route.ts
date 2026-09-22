import { geoapifyApiKey } from "@/lib/geoapify-geocoder";
import {
  isGeoPublicPrecision,
  isGeoPublicVisibility,
  isGeoTargetType,
  type GeoPublicPrecision,
  type GeoTargetType,
} from "@/lib/geo";
import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { resolveGeoTarget } from "@/lib/geo-service";
import {
  getGeoPointForTarget,
  getGeoSourceLocation,
  isGeoSchemaAvailable,
  initializeGeoPointForTarget,
  resetManualGeoOverride,
  setGeoVisibility,
  setManualGeoCoordinates,
  writeGeoModerationEvent,
} from "@/lib/geo-store";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ targetType: string; id: string }> };

async function parsedTarget(params: Props["params"]): Promise<{ targetType: GeoTargetType; id: number } | null> {
  const raw = await params;
  const targetType = raw.targetType.toUpperCase();
  const id = Number.parseInt(raw.id, 10);
  return isGeoTargetType(targetType) && Number.isSafeInteger(id) && id > 0 ? { targetType, id } : null;
}

function sameOriginJson(request: Request) {
  const origin = request.headers.get("origin");
  return Boolean(origin)
    && origin === new URL(request.url).origin
    && (request.headers.get("content-type")?.toLowerCase().includes("application/json") ?? false);
}

export async function GET(_request: Request, { params }: Props) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();
  const target = await parsedTarget(params);
  if (!target) return Response.json({ error: "Neplatný geo target." }, { status: 400 });
  const source = await getGeoSourceLocation(target.targetType, target.id);
  if (!source) return Response.json({ error: "Canonical target neexistuje." }, { status: 404 });
  const schemaReady = await isGeoSchemaAvailable();
  const point = schemaReady ? await getGeoPointForTarget(target.targetType, target.id) : null;
  return Response.json({
    point,
    source,
    schemaReady,
    provider: { name: "geoapify", configured: Boolean(geoapifyApiKey()) },
    productionBackfillEnabled: false,
    publicMapEnabled: false,
  }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request, { params }: Props) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();
  if (!sameOriginJson(request)) return Response.json({ error: "Neplatný pôvod alebo formát požiadavky." }, { status: 403 });
  const target = await parsedTarget(params);
  if (!target) return Response.json({ error: "Neplatný geo target." }, { status: 400 });

  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return Response.json({ error: "Neplatné JSON dáta." }, { status: 400 }); }

  const action = typeof body.action === "string" ? body.action : "";
  if (!(await isGeoSchemaAvailable())) {
    return Response.json({ error: "Geo migrácia 0064 ešte nie je aplikovaná v tejto D1 databáze." }, { status: 503 });
  }
  try {
    if (action === "initialize") {
      const result = await initializeGeoPointForTarget(target.targetType, target.id, user.email);
      return Response.json(result);
    }

    if (action === "classify") {
      const visibility = body.visibility;
      const precision = body.precision;
      if (!isGeoPublicVisibility(visibility)) return Response.json({ error: "Neplatná visibility." }, { status: 400 });
      const normalizedPrecision: GeoPublicPrecision | null = visibility === "HIDDEN"
        ? null
        : isGeoPublicPrecision(precision) ? precision : null;
      if (visibility !== "HIDDEN" && !normalizedPrecision) return Response.json({ error: "Verejná poloha potrebuje precision." }, { status: 400 });
      const point = await setGeoVisibility({
        targetType: target.targetType,
        targetId: target.id,
        visibility,
        precision: normalizedPrecision,
        actorRef: user.email,
        reason: typeof body.reason === "string" ? body.reason.slice(0, 300) : "ADMIN_CLASSIFICATION",
      });
      return Response.json({ point });
    }

    if (action === "manual") {
      const latitude = Number(body.latitude);
      const longitude = Number(body.longitude);
      const visibility = body.visibility;
      const precision = body.precision;
      const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 300) : "";
      if (visibility !== "EXACT_PUBLIC" && visibility !== "APPROXIMATE_PUBLIC") return Response.json({ error: "Manual marker musí byť verejný exact alebo approximate." }, { status: 400 });
      if (!isGeoPublicPrecision(precision)) return Response.json({ error: "Neplatná precision." }, { status: 400 });
      if (!reason) return Response.json({ error: "Pri manual override je povinný dôvod." }, { status: 400 });
      const point = await setManualGeoCoordinates({
        targetType: target.targetType, targetId: target.id, latitude, longitude,
        visibility, precision, actorRef: user.email, reason,
      });
      return Response.json({ point });
    }

    if (action === "reset-manual") {
      const point = await resetManualGeoOverride(target.targetType, target.id, user.email);
      return Response.json({ point });
    }

    if (action === "retry") {
      const before = await getGeoPointForTarget(target.targetType, target.id);
      if (!before) return Response.json({ error: "Geo point neexistuje." }, { status: 404 });
      await writeGeoModerationEvent({
        geoPointId: before.id,
        action: "GEO_RETRY_REQUESTED",
        actorType: "ADMIN",
        actorRef: user.email,
        fromStatus: before.geocodeStatus,
        toStatus: before.geocodeStatus,
        changedFields: ["attempt_count"],
      });
      const point = await resolveGeoTarget({ targetType: target.targetType, targetId: target.id });
      return Response.json({ point });
    }

    return Response.json({ error: "Neznáma geo akcia." }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Geo operácia zlyhala." }, { status: 409 });
  }
}
