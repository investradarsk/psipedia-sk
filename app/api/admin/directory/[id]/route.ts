import { env } from "cloudflare:workers";
import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { archiveManagedDirectoryProfile, getManagedDirectoryProfileById, isDirectoryProfileConflict, restoreManagedDirectoryProfile, setManagedDirectoryProfileReviewed, updateManagedDirectoryProfile, type ManagedDirectoryProfileInput } from "@/lib/directory-store";
import { verifyDirectoryAddressSelection, verifyDirectoryNumberlessAddressSelection, verifyDirectoryNumberlessLocality } from "@/lib/directory-address-provider";
import { autoAssignGooglePlaceForDirectoryProfile } from "@/lib/google-place-canary";
import {
  applyVerifiedDirectoryAddressGeo,
  directoryPhysicalAddressChanged,
  preserveDirectoryPhysicalAddress,
  requireDirectoryAddressProviderSchema,
  withVerifiedDirectoryAddress,
  withVerifiedDirectoryNumberlessAddress,
} from "@/lib/directory-address-save";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };
type UploadBindings = { BUCKET?: R2Bucket };

async function numericId(params: Props["params"]) {
  const value = Number.parseInt((await params).id, 10);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function errorResponse(error: unknown) {
  const conflict = isDirectoryProfileConflict(error);
  const message = error instanceof Error ? error.message : "Nastala neočakávaná chyba.";
  return Response.json({ error: conflict ? "V tejto kategórii už rovnaká adresa existuje." : message }, { status: conflict ? 409 : 400 });
}

export async function GET(_request: Request, { params }: Props) {
  const user = await getAdminApiUser(); if (!user) return unauthorizedAdminResponse();
  const id = await numericId(params); if (!id) return Response.json({ error: "Neplatné ID profilu." }, { status: 400 });
  const profile = await getManagedDirectoryProfileById(id);
  return profile ? Response.json({ profile }) : Response.json({ error: "Profil sa nenašiel." }, { status: 404 });
}

export async function PUT(request: Request, { params }: Props) {
  const user = await getAdminApiUser(); if (!user) return unauthorizedAdminResponse();
  const id = await numericId(params); if (!id) return Response.json({ error: "Neplatné ID profilu." }, { status: 400 });
  try {
    const before = await getManagedDirectoryProfileById(id);
    if (!before) return Response.json({ error: "Profil sa nenašiel." }, { status: 404 });
    const rawBody = await request.json() as ManagedDirectoryProfileInput & { numberlessLocalityConfirmed?: unknown };
    const { numberlessLocalityConfirmed: rawNumberlessLocalityConfirmed, ...body } = rawBody;
    const numberlessLocalityConfirmed = rawNumberlessLocalityConfirmed === true;
    const changed = directoryPhysicalAddressChanged(before, body);
    let verified = null;
    let payload: ManagedDirectoryProfileInput = body;
    if (numberlessLocalityConfirmed) {
      const houseNumber = (body.houseNumber ?? before.houseNumber).trim();
      const addressFormat = body.addressFormat ?? before.addressFormat;
      if (houseNumber) {
        throw new Error("Zadanú lokalitu možno použiť iba bez čísla domu.");
      }
      if (addressFormat !== "STREET") {
        throw new Error("Zadanú lokalitu možno použiť iba ako ulicu / lokalitu.");
      }
      const numberless = verifyDirectoryNumberlessLocality({
        region: body.region ?? before.region,
        district: body.district ?? before.district,
        city: body.city ?? before.city,
        postalCode: body.postalCode ?? before.postalCode,
        street: body.street ?? before.street,
      });
      payload = withVerifiedDirectoryNumberlessAddress(body, numberless);
    } else if (body.addressProviderResultId?.trim()) {
      const houseNumber = (body.houseNumber ?? before.houseNumber).trim();
      if (houseNumber) {
        await requireDirectoryAddressProviderSchema();
        verified = await verifyDirectoryAddressSelection({
          region: body.region ?? before.region,
          district: body.district ?? before.district,
          city: body.city ?? before.city,
          providerResultId: body.addressProviderResultId,
          street: body.street ?? before.street,
          houseNumber,
        });
        payload = withVerifiedDirectoryAddress(body, verified);
      } else {
        const numberless = await verifyDirectoryNumberlessAddressSelection({
          region: body.region ?? before.region,
          district: body.district ?? before.district,
          city: body.city ?? before.city,
          postalCode: body.postalCode ?? before.postalCode,
          providerResultId: body.addressProviderResultId,
          street: body.street ?? before.street,
        });
        payload = withVerifiedDirectoryNumberlessAddress(body, numberless);
      }
    } else if (changed) {
      const clearingForOnlineOnly = body.online === true
        && !body.region?.trim()
        && !body.district?.trim()
        && !body.city?.trim();
      if (!clearingForOnlineOnly) {
        throw new Error("Zmenu fyzickej adresy potvrď výberom ulice z Geoapify návrhov alebo explicitným použitím zadanej lokality.");
      }
      payload = {
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
    } else {
      payload = preserveDirectoryPhysicalAddress(before, body);
    }
    const profile = await updateManagedDirectoryProfile(id, payload, user.email, before);
    if (!profile) return Response.json({ error: "Profil sa nenašiel." }, { status: 404 });
    if (before.imageKey && before.imageKey !== profile.imageKey) {
      const bucket = (env as unknown as UploadBindings).BUCKET;
      if (bucket) await bucket.delete(before.imageKey).catch(() => undefined);
    }
    if (verified) {
      await applyVerifiedDirectoryAddressGeo({ profileId: id, verified, actorRef: user.email });
    }
    await autoAssignGooglePlaceForDirectoryProfile({ targetId: id });
    return Response.json({ profile });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(_request: Request, { params }: Props) {
  const user = await getAdminApiUser(); if (!user) return unauthorizedAdminResponse();
  const id = await numericId(params); if (!id) return Response.json({ error: "Neplatné ID profilu." }, { status: 400 });
  try {
    const profile = await archiveManagedDirectoryProfile(id, user.email);
    if (!profile) return Response.json({ error: "Profil sa nenašiel." }, { status: 404 });
    return Response.json({ archived: true, profile });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Profil sa nepodarilo archivovať." }, { status: 500 }); }
}

export async function PATCH(request: Request, { params }: Props) {
  const user = await getAdminApiUser(); if (!user) return unauthorizedAdminResponse();
  const id = await numericId(params); if (!id) return Response.json({ error: "Neplatné ID profilu." }, { status: 400 });
  try {
    const body = await request.json() as { action?: unknown; reviewed?: unknown };
    if (body.action === "set-reviewed") {
      if (typeof body.reviewed !== "boolean") {
        return Response.json({ error: "Stav kontroly musí byť true alebo false." }, { status: 400 });
      }
      const profile = await setManagedDirectoryProfileReviewed(id, body.reviewed, user.email);
      return profile ? Response.json({ profile }) : Response.json({ error: "Profil sa nenašiel." }, { status: 404 });
    }
    if (body.action !== "restore") return Response.json({ error: "Nepodporovaná lifecycle akcia." }, { status: 400 });
    const profile = await restoreManagedDirectoryProfile(id, user.email);
    return profile ? Response.json({ profile }) : Response.json({ error: "Profil sa nenašiel." }, { status: 404 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Profil sa nepodarilo obnoviť." }, { status: 400 }); }
}
