import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { googlePlacesApiKey } from "@/lib/google-places-provider";
import { isGeoSchemaAvailable } from "@/lib/geo-store";
import {
  confirmOrganizationProfileGooglePlace,
  discoverOrganizationProfileGooglePlaces,
  loadOrganizationGoogleMapsProfile,
  resetOrganizationGoogleMapsNotRequired,
  setOrganizationGoogleMapsNotRequired,
} from "@/lib/organization-google-maps-workflow";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };

function parseId(value: string) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
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

  const organizationId = parseId((await params).id);
  if (!organizationId) return Response.json({ error: "Neplatné ID organizácie." }, { status: 400 });

  const state = await loadOrganizationGoogleMapsProfile(organizationId);
  if (!state) return Response.json({ error: "Organizácia sa nenašla." }, { status: 404 });

  return Response.json({
    point: state.point,
    source: state.source,
    schemaReady: await isGeoSchemaAvailable(),
    explicitPrivate: state.explicitPrivate,
    googlePlacesConfigured: Boolean(googlePlacesApiKey()),
    googlePlaceAction: state.googlePlaceAction,
    googleMapsNotRequired: state.workflowDecision === "NOT_REQUIRED",
    googleMapsNotRequiredSystemDerived: false,
    representedLocationLabel: state.canonicalLocation?.label || state.canonicalLocation?.address || state.canonicalLocation?.city || null,
    representedLocationRole: null,
    representedTargetId: state.canonicalLocation?.id ?? null,
    locationCount: state.locations.length,
  }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request, { params }: Props) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();
  if (!sameOriginJson(request)) {
    return Response.json({ error: "Neplatný pôvod alebo formát požiadavky." }, { status: 403 });
  }

  const organizationId = parseId((await params).id);
  if (!organizationId) return Response.json({ error: "Neplatné ID organizácie." }, { status: 400 });

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Neplatné JSON dáta." }, { status: 400 });
  }

  const action = typeof body.action === "string" ? body.action : "";
  try {
    if (action === "discover-google-place") {
      const result = await discoverOrganizationProfileGooglePlaces(organizationId);
      return Response.json(result);
    }

    if (action === "confirm-google-place") {
      const placeId = typeof body.placeId === "string" ? body.placeId.trim() : "";
      if (!placeId) return Response.json({ error: "Vyber konkrétne miesto z Google Maps." }, { status: 400 });
      const result = await confirmOrganizationProfileGooglePlace({
        organizationId,
        placeId,
        actorRef: user.email,
      });
      return Response.json(result);
    }

    if (action === "google-maps-not-required") {
      await setOrganizationGoogleMapsNotRequired(organizationId, user.email);
      return Response.json({ googleMapsNotRequired: true });
    }

    if (action === "reset-google-maps-not-required") {
      await resetOrganizationGoogleMapsNotRequired(organizationId, user.email);
      return Response.json({ googleMapsNotRequired: false });
    }

    return Response.json({ error: "Neznáma Google Maps akcia." }, { status: 400 });
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : "Google Maps operácia zlyhala.",
    }, { status: 409 });
  }
}
