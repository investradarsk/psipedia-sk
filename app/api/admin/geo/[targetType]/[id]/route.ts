import { env } from "cloudflare:workers";
import { googleMapsRendererConfigured, publicMapLaunchEnabled } from "@/config/runtime-env";
import { geoapifyApiKey } from "@/lib/geoapify-geocoder";
import {
  geoFingerprintInput,
  isGeoPublicPrecision,
  isGeoPublicVisibility,
  isGeoTargetType,
  sourceGeoFingerprint,
  type GeoPublicPrecision,
  type GeoSourceLocation,
  type GeoTargetType,
} from "@/lib/geo";
import { directoryExactGeoCandidate, directoryNumberlessPlaceCandidate } from "@/lib/directory-service-address";
import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { diagnoseGeoTarget, previewGeoSource, resolveGeoTarget } from "@/lib/geo-service";
import {
  applyGeocoderResolution,
  applyGooglePlaceResolution,
  getGeoPointForTarget,
  getGeoSourceLocation,
  getGoogleMapsWorkflowDecision,
  hasExplicitPrivateGeoDecision,
  isGeoSchemaAvailable,
  initializeGeoPointForTarget,
  resetGoogleMapsNotRequired,
  resetManualGeoOverride,
  setGeoVisibility,
  setGoogleMapsNotRequired,
  setManualGeoCoordinates,
  writeGeoModerationEvent,
} from "@/lib/geo-store";
import { evaluateGooglePlaceCandidates, evaluateNumberlessGooglePlaceCandidates } from "@/lib/google-place-matching";
import { googlePlacesApiKey, searchGooglePlacesText } from "@/lib/google-places-provider";
import {
  discoverGoogleTargetPlaces,
  googlePlaceActionForSource,
} from "@/lib/google-place-target-discovery";
import { autoAssignGooglePlaceForDirectoryProfile } from "@/lib/google-place-canary";
import { confirmAdminGooglePlace } from "@/lib/admin-google-place-confirmation";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ targetType: string; id: string }> };
type MapBindings = {
  PUBLIC_MAP_ENABLED?: string;
  GOOGLE_MAPS_BROWSER_API_KEY?: string;
  GOOGLE_MAPS_MAP_ID?: string;
};

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

function mapRuntime() {
  const bindings = env as unknown as MapBindings;
  const runtime = {
    PUBLIC_MAP_ENABLED: bindings.PUBLIC_MAP_ENABLED ?? process.env.PUBLIC_MAP_ENABLED,
    GOOGLE_MAPS_BROWSER_API_KEY: bindings.GOOGLE_MAPS_BROWSER_API_KEY ?? process.env.GOOGLE_MAPS_BROWSER_API_KEY,
    GOOGLE_MAPS_MAP_ID: bindings.GOOGLE_MAPS_MAP_ID ?? process.env.GOOGLE_MAPS_MAP_ID,
  };
  return {
    publicMapEnabled: publicMapLaunchEnabled(runtime),
    configured: googleMapsRendererConfigured(runtime),
    apiKey: runtime.GOOGLE_MAPS_BROWSER_API_KEY ?? "",
    mapId: runtime.GOOGLE_MAPS_MAP_ID ?? "",
  };
}

function exactAddress(source: GeoSourceLocation) {
  if (source.targetType !== "DIRECTORY_PROFILE") return null;
  return directoryExactGeoCandidate({
    region: source.region ?? "",
    district: source.district ?? "",
    city: source.city ?? "",
    postalCode: source.postalCode ?? "",
    street: source.street ?? "",
    houseNumber: source.houseNumber ?? "",
    addressFormat: source.addressFormat ?? "",
    serviceAddressConfirmation: source.serviceAddressConfirmation ?? "LEGACY_UNCONFIRMED",
    online: source.online,
  });
}

function numberlessAddress(source: GeoSourceLocation) {
  if (source.targetType !== "DIRECTORY_PROFILE") return null;
  return directoryNumberlessPlaceCandidate({
    region: source.region ?? "",
    district: source.district ?? "",
    city: source.city ?? "",
    postalCode: source.postalCode ?? "",
    street: source.street ?? "",
    houseNumber: source.houseNumber ?? "",
    addressFormat: source.addressFormat ?? "",
    serviceAddressConfirmation: source.serviceAddressConfirmation ?? "LEGACY_UNCONFIRMED",
    online: source.online,
  });
}

async function googleMapsAddressPreview(source: GeoSourceLocation, latitude: number, longitude: number) {
  const canonical = exactAddress(source);
  const key = googlePlacesApiKey();
  if (!canonical || !key) {
    return {
      status: key ? "NOT_CONFIRMED" as const : "UNAVAILABLE" as const,
      formattedAddress: null,
      placeId: null,
      reason: key ? "Canonical adresa nie je vhodná na Google overenie." : "Google Places serverový kľúč nie je dostupný.",
    };
  }

  try {
    const query = [source.label, canonical.formattedAddress.replace(/\n/g, ", "), "Slovensko"]
      .map((value) => value.trim())
      .filter(Boolean)
      .join(" ");
    const candidates = await searchGooglePlacesText({ query, apiKey: key });
    const match = evaluateGooglePlaceCandidates({
      targetId: source.targetId,
      name: source.label,
      city: source.city ?? "",
      postalCode: source.postalCode ?? "",
      canonicalAddress: canonical.formattedAddress,
      latitude,
      longitude,
    }, candidates);
    if (match.decision === "MATCH" && match.candidate) {
      return {
        status: "CONFIRMED" as const,
        formattedAddress: match.candidate.formattedAddress,
        placeId: match.candidate.id,
        reason: match.reason,
      };
    }
    return {
      status: "NOT_CONFIRMED" as const,
      formattedAddress: null,
      placeId: null,
      reason: match.reason,
    };
  } catch (error) {
    return {
      status: "UNAVAILABLE" as const,
      formattedAddress: null,
      placeId: null,
      reason: error instanceof Error ? error.message : "Google Maps overenie zlyhalo.",
    };
  }
}

async function googleMapsNumberlessPlacePreview(source: GeoSourceLocation) {
  const canonical = numberlessAddress(source);
  const key = googlePlacesApiKey();
  if (!canonical || !key) {
    return {
      status: key ? "NOT_CONFIRMED" as const : "UNAVAILABLE" as const,
      formattedAddress: null,
      placeId: null,
      reason: key ? "Canonical adresa bez čísla nie je vhodná na Google overenie." : "Google Places serverový kľúč nie je dostupný.",
      candidate: null,
    };
  }

  try {
    const query = [source.label, source.street, source.postalCode, source.city, "Slovensko"]
      .map((value) => value?.trim() ?? "")
      .filter(Boolean)
      .join(" ");
    const candidates = await searchGooglePlacesText({ query, apiKey: key });
    const match = evaluateNumberlessGooglePlaceCandidates({
      targetId: source.targetId,
      name: source.label,
      city: source.city ?? "",
      postalCode: source.postalCode ?? "",
      street: source.street ?? "",
      canonicalAddress: canonical.formattedAddress,
    }, candidates);
    if (match.decision === "MATCH" && match.candidate) {
      return {
        status: "CONFIRMED" as const,
        formattedAddress: match.candidate.formattedAddress,
        placeId: match.candidate.id,
        reason: match.reason,
        candidate: match.candidate,
      };
    }
    return {
      status: "NOT_CONFIRMED" as const,
      formattedAddress: null,
      placeId: null,
      reason: match.reason,
      candidate: null,
    };
  } catch (error) {
    return {
      status: "UNAVAILABLE" as const,
      formattedAddress: null,
      placeId: null,
      reason: error instanceof Error ? error.message : "Google Maps overenie zlyhalo.",
      candidate: null,
    };
  }
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
  const explicitPrivate = schemaReady ? await hasExplicitPrivateGeoDecision(target.targetType, target.id) : false;
  const googleMapsNotRequired = schemaReady
    ? await getGoogleMapsWorkflowDecision(target.targetType, target.id) === "NOT_REQUIRED"
    : false;
  return Response.json({
    point,
    source,
    schemaReady,
    explicitPrivate,
    provider: { name: "geoapify", configured: Boolean(geoapifyApiKey()) },
    googlePlacesConfigured: Boolean(googlePlacesApiKey()),
    googlePlaceAction: googlePlaceActionForSource(source),
    googleMapsNotRequired,
    googleMapsNotRequiredSystemDerived: source.targetType === "MANAGED_EVENT" && Boolean(source.online),
    representedLocationLabel: source.targetType === "ORGANIZATION_LOCATION"
      ? (source.label || source.address || source.city || null)
      : null,
    representedLocationRole: source.targetType === "ORGANIZATION_LOCATION" ? source.locationRole ?? null : null,
    representedTargetId: target.id,
    productionBackfillEnabled: false,
    ...mapRuntime(),
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
    if (action === "google-maps-not-required") {
      const source = await getGeoSourceLocation(target.targetType, target.id);
      if (!source) return Response.json({ error: "Canonical target sa nenašiel." }, { status: 404 });
      if (source.targetType === "MANAGED_EVENT" && source.online) {
        return Response.json({ point: await getGeoPointForTarget(target.targetType, target.id), systemDerived: true });
      }
      const point = await setGoogleMapsNotRequired({
        targetType: target.targetType,
        targetId: target.id,
        actorRef: user.email,
      });
      return Response.json({ point, googleMapsNotRequired: true });
    }

    if (action === "reset-google-maps-not-required") {
      const source = await getGeoSourceLocation(target.targetType, target.id);
      if (!source) return Response.json({ error: "Canonical target sa nenašiel." }, { status: 404 });
      if (source.targetType === "MANAGED_EVENT" && source.online) {
        return Response.json({ error: "Online podujatie fyzický Google Place nepotrebuje." }, { status: 409 });
      }
      const point = await resetGoogleMapsNotRequired({
        targetType: target.targetType,
        targetId: target.id,
        actorRef: user.email,
      });
      return Response.json({ point, googleMapsNotRequired: false });
    }

    if (action === "discover-google-place") {
      const source = await getGeoSourceLocation(target.targetType, target.id);
      if (!source) return Response.json({ error: "Canonical target sa nenašiel." }, { status: 404 });
      const policy = googlePlaceActionForSource(source);
      if (!policy.available) return Response.json({ error: policy.reason }, { status: 409 });
      const candidates = await discoverGoogleTargetPlaces(source);
      return Response.json({
        candidates,
        requiresSiteConfirmation:
          source.targetType === "ORGANIZATION_LOCATION" && source.locationRole !== "SITE",
      });
    }

    if (action === "confirm-google-place") {
      const placeId = typeof body.placeId === "string" ? body.placeId.trim() : "";
      if (!placeId) return Response.json({ error: "Vyber konkrétne miesto z Google Maps." }, { status: 400 });
      const result = await confirmAdminGooglePlace({
        targetType: target.targetType,
        targetId: target.id,
        placeId,
        actorRef: user.email,
        publicLocation: body.publicLocation !== false,
        allowPrivateOverride: body.allowPrivateOverride === true,
        confirmOrganizationSite: body.confirmOrganizationSite === true,
      });
      return Response.json(result);
    }

    if (action === "preview") {
      if (target.targetType !== "DIRECTORY_PROFILE") {
        return Response.json({ error: "Jednoduché overenie podľa adresy je dostupné iba pre profil adresára." }, { status: 400 });
      }
      const source = await getGeoSourceLocation(target.targetType, target.id);
      if (!source) return Response.json({ error: "Profil sa nenašiel." }, { status: 404 });
      const canonical = exactAddress(source);
      const numberless = canonical ? null : numberlessAddress(source);
      if (!canonical && !numberless) {
        return Response.json({ error: "Najprv ulož kompletnú a overenú adresu profilu." }, { status: 409 });
      }
      const sourceFingerprint = await sourceGeoFingerprint(geoFingerprintInput(source, "EXACT_PUBLIC", "EXACT"));

      if (numberless) {
        const google = await googleMapsNumberlessPlacePreview(source);
        if (google.status !== "CONFIRMED" || !google.candidate) {
          return Response.json({
            error: google.status === "UNAVAILABLE"
              ? google.reason
              : "Konkrétne miesto sa nepodarilo jednoznačne potvrdiť v Google Maps. Skontroluj názov a adresu profilu.",
          }, { status: 409 });
        }
        return Response.json({
          preview: {
            latitude: google.candidate.latitude,
            longitude: google.candidate.longitude,
            providerResultId: google.candidate.id,
            sourceFingerprint,
            canonicalAddress: numberless.formattedAddress,
            mode: "NUMBERLESS_PLACE",
            google: {
              status: google.status,
              formattedAddress: google.formattedAddress,
              placeId: google.placeId,
              reason: google.reason,
            },
          },
        });
      }

      const preview = await previewGeoSource({ source, visibility: "EXACT_PUBLIC", precision: "EXACT" });
      if (!preview.result || preview.errorCode) {
        return Response.json({ error: "Poloha sa podľa zadanej adresy nedá spoľahlivo určiť." }, { status: 409 });
      }
      const google = await googleMapsAddressPreview(source, preview.result.latitude, preview.result.longitude);
      return Response.json({
        preview: {
          latitude: preview.result.latitude,
          longitude: preview.result.longitude,
          providerResultId: preview.result.providerResultId,
          sourceFingerprint,
          canonicalAddress: canonical.formattedAddress,
          mode: "EXACT_ADDRESS",
          google,
        },
      });
    }

    if (action === "confirm-preview") {
      if (target.targetType !== "DIRECTORY_PROFILE") {
        return Response.json({ error: "Potvrdenie adresy je dostupné iba pre profil adresára." }, { status: 400 });
      }
      const publicLocation = body.publicLocation !== false;
      let point = await getGeoPointForTarget(target.targetType, target.id);
      if (!point) {
        point = (await initializeGeoPointForTarget(target.targetType, target.id, user.email)).point;
      }

      if (!publicLocation) {
        point = await setGeoVisibility({
          targetType: target.targetType,
          targetId: target.id,
          visibility: "HIDDEN",
          precision: null,
          actorRef: user.email,
          reason: "ADMIN_SIMPLE_LOCATION_PRIVATE",
        });
        return Response.json({ point, google: null });
      }

      const source = await getGeoSourceLocation(target.targetType, target.id);
      if (!source) return Response.json({ error: "Profil sa nenašiel." }, { status: 404 });
      const canonical = exactAddress(source);
      const numberless = canonical ? null : numberlessAddress(source);
      if (!canonical && !numberless) return Response.json({ error: "Najprv ulož kompletnú a overenú adresu profilu." }, { status: 409 });
      const currentFingerprint = await sourceGeoFingerprint(geoFingerprintInput(source, "EXACT_PUBLIC", "EXACT"));
      const expectedFingerprint = typeof body.sourceFingerprint === "string" ? body.sourceFingerprint : "";
      if (!expectedFingerprint || expectedFingerprint !== currentFingerprint) {
        return Response.json({ error: "Adresa sa od vyhľadania zmenila. Nájdite polohu znova." }, { status: 409 });
      }

      if (point.publicVisibility !== "EXACT_PUBLIC" || point.publicPrecision !== "EXACT") {
        point = await setGeoVisibility({
          targetType: target.targetType,
          targetId: target.id,
          visibility: "EXACT_PUBLIC",
          precision: "EXACT",
          actorRef: user.email,
          reason: "ADMIN_SIMPLE_LOCATION_CONFIRMATION",
        });
      }

      if (numberless) {
        const expectedGooglePlaceId = typeof body.providerResultId === "string" ? body.providerResultId : "";
        if (!expectedGooglePlaceId) {
          return Response.json({ error: "Chýba potvrdený Google Place výsledok. Nájdite polohu znova." }, { status: 409 });
        }
        const google = await googleMapsNumberlessPlacePreview(source);
        if (
          google.status !== "CONFIRMED"
          || !google.candidate
          || google.candidate.id !== expectedGooglePlaceId
        ) {
          return Response.json({
            error: "Google Place sa od náhľadu zmenil alebo už nie je jednoznačný. Nájdite polohu znova.",
          }, { status: 409 });
        }
        point = await applyGooglePlaceResolution({
          targetType: target.targetType,
          targetId: target.id,
          place: {
            id: google.candidate.id,
            latitude: google.candidate.latitude,
            longitude: google.candidate.longitude,
          },
        });
        return Response.json({
          point,
          google: {
            result: "UPDATED",
            googlePlaceId: google.candidate.id,
            reason: google.reason,
          },
        });
      }

      const preview = await previewGeoSource({ source, visibility: "EXACT_PUBLIC", precision: "EXACT" });
      if (!preview.result || preview.errorCode) {
        return Response.json({ error: "Poloha sa už nedá spoľahlivo potvrdiť. Nájdite ju znova." }, { status: 409 });
      }
      const expectedProviderResultId = typeof body.providerResultId === "string" ? body.providerResultId : "";
      if (expectedProviderResultId && preview.result.providerResultId && expectedProviderResultId !== preview.result.providerResultId) {
        return Response.json({ error: "Výsledok vyhľadania sa zmenil. Nájdite polohu znova." }, { status: 409 });
      }

      point = await applyGeocoderResolution({
        targetType: target.targetType,
        targetId: target.id,
        result: preview.result,
        method: "GEOCODER",
      });
      const google = await autoAssignGooglePlaceForDirectoryProfile({ targetId: target.id });
      return Response.json({ point, google });
    }

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

    if (action === "diagnose") {
      const diagnostic = await diagnoseGeoTarget({ targetType: target.targetType, targetId: target.id });
      return Response.json({ diagnostic });
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
