import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { createManagedDirectoryProfile, isDirectoryProfileConflict, listManagedDirectoryProfileSummaries, type ManagedDirectoryProfileInput } from "@/lib/directory-store";
import { verifyDirectoryAddressSelection } from "@/lib/directory-address-provider";
import { applyVerifiedDirectoryAddressGeo, requireDirectoryAddressProviderSchema, withVerifiedDirectoryAddress } from "@/lib/directory-address-save";

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
    const body = await request.json() as ManagedDirectoryProfileInput;
    const physicalLocality = Boolean(body.region?.trim() || body.district?.trim() || body.city?.trim());
    let payload = body;
    let verified = null;
    if (physicalLocality) {
      await requireDirectoryAddressProviderSchema();
      if (!body.addressProviderResultId?.trim()) {
        throw new Error("Vyber konkrétnu adresu z Geoapify návrhov.");
      }
      verified = await verifyDirectoryAddressSelection({
        region: body.region ?? "",
        district: body.district ?? "",
        city: body.city ?? "",
        providerResultId: body.addressProviderResultId,
      });
      payload = withVerifiedDirectoryAddress(body, verified);
    } else {
      payload = { ...body, postalCode: "", street: "", houseNumber: "", addressFormat: "", confirmServiceAddress: false };
    }
    const profile = await createManagedDirectoryProfile(payload, user.email);
    if (verified) {
      await applyVerifiedDirectoryAddressGeo({ profileId: profile.id, verified, actorRef: user.email });
    }
    return Response.json({ profile }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
