import { env } from "cloudflare:workers";
import { DIRECTORY_FILTER_CONTRACT_VERSION, mergeDirectoryFilterValues, serviceFilterCategories, type ServiceFilterCategory } from "@/lib/directory-filter-contract";
import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { archiveManagedDirectoryProfile, getManagedDirectoryProfileById, isDirectoryProfileConflict, restoreManagedDirectoryProfile, setManagedDirectoryProfileReviewed, updateManagedDirectoryProfile, type ManagedDirectoryProfileInput } from "@/lib/directory-store";
import { verifyDirectoryAddressSelection, verifyDirectoryNumberlessAddressSelection, verifyDirectoryNumberlessLocality } from "@/lib/directory-address-provider";
import { autoAssignGooglePlaceForDirectoryProfile } from "@/lib/google-place-canary";
import {
  applyVerifiedDirectoryAddressGeo,
  directoryPhysicalAddressChanged,
  preserveDirectoryPhysicalAddress,
  requireDirectoryAddressProviderSchema,
  withUnconfirmedDirectoryAddress,
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
    let payload: ManagedDirectoryProfileInput = changed
      ? withUnconfirmedDirectoryAddress(body)
      : preserveDirectoryPhysicalAddress(before, body);

    const houseNumber = (body.houseNumber ?? before.houseNumber).trim();
    const postalCode = (body.postalCode ?? before.postalCode).trim();
    const addressFormat = body.addressFormat ?? before.addressFormat;
    const hasLocality = Boolean(
      (body.region ?? before.region).trim()
      && (body.district ?? before.district).trim()
      && (body.city ?? before.city).trim()
    );

    // Technical verification upgrades the address when it succeeds. A provider
    // mismatch/outage never vetoes the editorial save and never erases the
    // admin-entered public address.
    try {
      if (
        numberlessLocalityConfirmed
        && !houseNumber
        && addressFormat === "STREET"
        && postalCode
        && hasLocality
      ) {
        const numberless = verifyDirectoryNumberlessLocality({
          region: body.region ?? before.region,
          district: body.district ?? before.district,
          city: body.city ?? before.city,
          postalCode,
          street: body.street ?? before.street,
        });
        payload = withVerifiedDirectoryNumberlessAddress(body, numberless);
      } else if (body.addressProviderResultId?.trim() && houseNumber && hasLocality) {
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
      } else if (body.addressProviderResultId?.trim() && postalCode && hasLocality) {
        const numberless = await verifyDirectoryNumberlessAddressSelection({
          region: body.region ?? before.region,
          district: body.district ?? before.district,
          city: body.city ?? before.city,
          postalCode,
          providerResultId: body.addressProviderResultId,
          street: body.street ?? before.street,
        });
        payload = withVerifiedDirectoryNumberlessAddress(body, numberless);
      }
    } catch {
      verified = null;
      // Keep the base payload selected above. If structured data changed it
      // remains LEGACY_UNCONFIRMED; if it did not, the prior technical state is
      // preserved.
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
    if (body.action === "set-category-filters") {
      const patch = (body as { filterPatch?: unknown }).filterPatch;
      if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
        return Response.json({ error: "Neplatný balík filtrov." }, { status: 400 });
      }
      const requested = patch as { category?: unknown; contractVersion?: unknown; updates?: unknown };
      if (requested.contractVersion !== DIRECTORY_FILTER_CONTRACT_VERSION
        || typeof requested.category !== "string"
        || !(serviceFilterCategories as readonly string[]).includes(requested.category)
        || !requested.updates || typeof requested.updates !== "object" || Array.isArray(requested.updates)
        || Object.keys(requested.updates).length > 21) {
        return Response.json({ error: "Neplatná kategória, verzia alebo hodnoty filtrov." }, { status: 400 });
      }
      const db = (env as unknown as { DB?: D1Database }).DB;
      if (!db) return Response.json({ error: "Databáza nie je dostupná." }, { status: 503 });
      const row = await db.prepare("SELECT category,status,source_data_json FROM directory_profiles WHERE id=?1 LIMIT 1")
        .bind(id).first<{ category: string; status: string; source_data_json: string }>();
      if (!row) return Response.json({ error: "Profil sa nenašiel." }, { status: 404 });
      if (row.status === "archived") return Response.json({ error: "Archivovaný profil nie je možné upravovať." }, { status: 409 });
      if (row.category !== requested.category) {
        return Response.json({ error: "Kategória profilu sa zmenila. Obnovte stránku." }, { status: 409 });
      }
      // This helper validates every registry ID and value, rejects out-of-category keys,
      // and retains arbitrary legacy metadata. Never write the client's full JSON snapshot.
      const next = mergeDirectoryFilterValues(row.source_data_json, row.category as ServiceFilterCategory, requested.updates as Record<string, unknown>);
      if (Object.keys(requested.updates).length) {
        const updated = await db.prepare(`UPDATE directory_profiles
          SET source_data_json=?1,updated_at=?2,updated_by=?3
          WHERE id=?4 AND category=?5 AND source_data_json=?6 RETURNING id`)
          .bind(next, new Date().toISOString(), user.email, id, row.category, row.source_data_json).first<{ id: number }>();
        if (!updated) return Response.json({ error: "Údaje profilu sa medzičasom zmenili. Obnovte stránku." }, { status: 409 });
      }
      return Response.json({ profile: await getManagedDirectoryProfileById(id) });
    }
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
