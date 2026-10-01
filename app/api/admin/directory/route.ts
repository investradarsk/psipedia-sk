import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { createManagedDirectoryProfile, isDirectoryProfileConflict, listManagedDirectoryProfileSummaries, type ManagedDirectoryProfileInput } from "@/lib/directory-store";
import { verifyDirectoryAddressSelection, verifyDirectoryNumberlessAddressSelection, verifyDirectoryNumberlessLocality } from "@/lib/directory-address-provider";
import {
  applyVerifiedDirectoryAddressGeo,
  requireDirectoryAddressProviderSchema,
  withUnconfirmedDirectoryAddress,
  withVerifiedDirectoryAddress,
  withVerifiedDirectoryNumberlessAddress,
} from "@/lib/directory-address-save";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  const conflict = isDirectoryProfileConflict(error);
  const message = error instanceof Error ? error.message : "Nastala neočakávaná chyba.";
  return Response.json({ error: conflict ? "V tejto kategórii už rovnaká adresa existuje." : message }, { status: conflict ? 409 : 400 });
}

export async function GET(request: Request) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();
  try {
    const url = new URL(request.url);
    const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
    const pageSize = Math.max(1, Math.min(100, Number.parseInt(url.searchParams.get("limit") ?? "50", 10) || 50));
    return Response.json(await listManagedDirectoryProfileSummaries({ page, pageSize }));
  }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Profily sa nepodarilo načítať." }, { status: 500 }); }
}

export async function POST(request: Request) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();
  try {
    const rawBody = await request.json() as ManagedDirectoryProfileInput & { numberlessLocalityConfirmed?: unknown };
    const { numberlessLocalityConfirmed: rawNumberlessLocalityConfirmed, ...body } = rawBody;
    const numberlessLocalityConfirmed = rawNumberlessLocalityConfirmed === true;
    const physicalHints = Boolean(
      body.region?.trim()
      || body.district?.trim()
      || body.city?.trim()
      || body.postalCode?.trim()
      || body.street?.trim()
      || body.houseNumber?.trim()
    );
    const hasLocality = Boolean(body.region?.trim() && body.district?.trim() && body.city?.trim());
    let payload: ManagedDirectoryProfileInput = physicalHints
      ? withUnconfirmedDirectoryAddress(body)
      : {
          ...body,
          region: "",
          district: "",
          city: "",
          postalCode: "",
          street: "",
          houseNumber: "",
          addressFormat: "",
          confirmServiceAddress: false,
          clearServiceAddressConfirmation: true,
        };
    let verified = null;

    if (physicalHints) {
      // Provider/locality validation is an enhancement only. Any mismatch,
      // missing provider result or provider outage falls back to warning-only
      // structured hints while preserving the editorial public address.
      try {
        if (
          numberlessLocalityConfirmed
          && !body.houseNumber?.trim()
          && body.addressFormat === "STREET"
          && body.postalCode?.trim()
          && hasLocality
        ) {
          const numberless = verifyDirectoryNumberlessLocality({
            region: body.region ?? "",
            district: body.district ?? "",
            city: body.city ?? "",
            postalCode: body.postalCode ?? "",
            street: body.street ?? "",
          });
          payload = withVerifiedDirectoryNumberlessAddress(body, numberless);
        } else if (body.addressProviderResultId?.trim() && body.houseNumber?.trim() && hasLocality) {
          await requireDirectoryAddressProviderSchema();
          verified = await verifyDirectoryAddressSelection({
            region: body.region ?? "",
            district: body.district ?? "",
            city: body.city ?? "",
            providerResultId: body.addressProviderResultId,
            street: body.street ?? "",
            houseNumber: body.houseNumber,
          });
          payload = withVerifiedDirectoryAddress(body, verified);
        } else if (body.addressProviderResultId?.trim() && body.postalCode?.trim() && hasLocality) {
          const numberless = await verifyDirectoryNumberlessAddressSelection({
            region: body.region ?? "",
            district: body.district ?? "",
            city: body.city ?? "",
            postalCode: body.postalCode,
            providerResultId: body.addressProviderResultId,
            street: body.street ?? "",
          });
          payload = withVerifiedDirectoryNumberlessAddress(body, numberless);
        }
      } catch {
        verified = null;
        payload = withUnconfirmedDirectoryAddress(body);
      }
    }
    const profile = await createManagedDirectoryProfile(payload, user.email);
    if (verified) {
      await applyVerifiedDirectoryAddressGeo({ profileId: profile.id, verified, actorRef: user.email });
    }
    return Response.json({ profile }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
