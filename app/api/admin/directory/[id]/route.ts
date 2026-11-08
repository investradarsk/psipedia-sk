import { env } from "cloudflare:workers";
import { DIRECTORY_FILTER_CONTRACT_VERSION, mergeDirectoryFilterValues, serviceFilterCategories, type ServiceFilterCategory } from "@/lib/directory-filter-contract";
import { getAdminApiUser, unauthorizedAdminResponse, requireAdminMutation } from "@/lib/admin-auth";
import { archiveManagedDirectoryProfile, getManagedDirectoryProfileById, isDirectoryProfileConflict, restoreManagedDirectoryProfile, setManagedDirectoryProfileReviewed, updateManagedDirectoryProfile, type ManagedDirectoryProfileInput } from "@/lib/directory-store";
import { verifyDirectoryAddressSelection, verifyDirectoryNumberlessAddressSelection, verifyDirectoryNumberlessLocality } from "@/lib/directory-address-provider";
import { breederEditedFields, mirrorBreederCategoryFiltersToNotion, mirrorPilotDirectoryMetadataFieldsToNotion, preserveLiveBreederFields, runNotionDirectorySyncSweep, savePilotDirectoryMetadataField, PILOT_DIRECTORY_METADATA_FIELDS, type PilotDirectoryMetadataField } from "@/lib/notion-directory-sync";
import { recordDirectoryNotionAlert } from "@/lib/directory-notion-sync-alerts";
import { BREEDER_NOTION_EDITORIAL_FIELDS, type BreederEditorialField } from "@/lib/notion-breeder-field-events";
import { isDirectoryEventPilotCategory } from "@/lib/notion-directory-field-event-scope";
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
  const auth = await requireAdminMutation(request, { strictProvenance: true });
  if (auth.response || !auth.user) return auth.response ?? unauthorizedAdminResponse();
  const user = auth.user;
  const id = await numericId(params); if (!id) return Response.json({ error: "Neplatné ID profilu." }, { status: 400 });
  try {
    const projected = await getManagedDirectoryProfileById(id);
    if (!projected) return Response.json({ error: "Profil sa nenašiel." }, { status: 404 });
    // ManagedDirectoryProfile.importData intentionally projects only primitives.
    // Passing that projection to the normal store save would silently discard
    // nested legacy metadata. Supply the full stored JSON as its merge baseline.
    const db = (env as unknown as { DB?: D1Database }).DB;
    if (!db) return Response.json({ error: "Databáza nie je dostupná." }, { status: 503 });
    const raw = await db.prepare("SELECT source_data_json FROM directory_profiles WHERE id=?1 LIMIT 1")
      .bind(id).first<{ source_data_json: string }>();
    if (!raw) return Response.json({ error: "Profil sa nenašiel." }, { status: 404 });
    let completeSource: unknown;
    try { completeSource = JSON.parse(raw.source_data_json); }
    catch { return Response.json({ error: "Pôvodné metadáta profilu nie sú platné; ukladanie je zablokované." }, { status: 409 }); }
    if (!completeSource || typeof completeSource !== "object" || Array.isArray(completeSource)) {
      return Response.json({ error: "Pôvodné metadáta profilu nie sú platné; ukladanie je zablokované." }, { status: 409 });
    }
    const before = { ...projected, importData: completeSource as typeof projected.importData };
    const rawBody = await request.json() as ManagedDirectoryProfileInput & {
      numberlessLocalityConfirmed?: unknown;
      breederEditedPaths?: unknown;
      trainerServicesEdited?: unknown;
      pilotMetadataFields?: unknown;
    };
    const {
      numberlessLocalityConfirmed: rawNumberlessLocalityConfirmed,
      breederEditedPaths: rawBreederEditedPaths,
      trainerServicesEdited: rawTrainerServicesEdited,
      pilotMetadataFields: rawPilotMetadataFields,
      ...submittedBody
    } = rawBody;
    // A stale full-form payload must never silently undo a newer Notion edit
    // to a field the editor did not touch.
    const editedPaths: BreederEditorialField[] | null =
      (["chovatelske-stanice", "treneri"].includes(before.category) || isDirectoryEventPilotCategory(before.category)) && Array.isArray(rawBreederEditedPaths)
        ? rawBreederEditedPaths.filter(
            (path): path is BreederEditorialField =>
              typeof path === "string" && Object.hasOwn(BREEDER_NOTION_EDITORIAL_FIELDS, path) &&
              !(path === "services" && isDirectoryEventPilotCategory(before.category)),
          )
        : null;
    // The retired internal e-mail is no longer editable. Keep historical D1
    // data until the archival migration, regardless of a stale client payload.
    const safeSubmittedBody = { ...submittedBody, internalEmail: before.internalEmail };
    const fieldPreserved = editedPaths
      ? preserveLiveBreederFields(before, safeSubmittedBody, editedPaths)
      : safeSubmittedBody;
    // The three pilot categories use only Services V3 for service editing.
    // Preserve historical services_json for legacy rendering, but never allow
    // the whole-profile form to overwrite it (even from a stale/manual payload).
    // Trainers retain their previous legacy-service behavior unchanged.
    const body = isDirectoryEventPilotCategory(before.category)
      ? { ...fieldPreserved, services: before.services }
      : before.category === "treneri" && editedPaths && rawTrainerServicesEdited !== true
        ? { ...fieldPreserved, services: before.services }
        : fieldPreserved;
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
    let profile = await updateManagedDirectoryProfile(id, payload, user.email, before);
    if (!profile) return Response.json({ error: "Profil sa nenašiel." }, { status: 404 });
    if (before.imageKey && before.imageKey !== profile.imageKey) {
      const bucket = (env as unknown as UploadBindings).BUCKET;
      if (bucket) await bucket.delete(before.imageKey).catch(() => undefined);
    }
    if (verified) {
      await applyVerifiedDirectoryAddressGeo({ profileId: id, verified, actorRef: user.email });
    }
    // Pilot metadata stays separate from profile normalization and V3 relations.
    const metadataWarnings: string[] = [];
    const changedPilotMetadata: Partial<Record<PilotDirectoryMetadataField, string>> = {};
    if (isDirectoryEventPilotCategory(profile.category) && rawPilotMetadataFields &&
        typeof rawPilotMetadataFields === "object" && !Array.isArray(rawPilotMetadataFields)) {
      const submitted = rawPilotMetadataFields as Record<string, unknown>;
      for (const field of PILOT_DIRECTORY_METADATA_FIELDS) {
        if (!Object.hasOwn(submitted, field) || typeof submitted[field] !== "string") continue;
        const value = (submitted[field] as string).trim();
        if (!value) continue;
        try {
          profile = await savePilotDirectoryMetadataField({
            database: db, profileId: id, category: profile.category, field, value,
          });
          changedPilotMetadata[field] = value;
        } catch (error) {
          console.error("DIRECTORY_PILOT_METADATA_ADMIN_SAVE_FAILED", id, field, error);
          metadataWarnings.push(field + ": zmena nebola uložená");
        }
      }
    }
    // Saving a profile never triggers a paid Google Places search.
    // Only the just-saved linked profile is reconciled. This does not run an
    // entire directory scan, trigger Services V3 or affect Facebook images.
    // The canonical Admin save is not rolled back if Notion is unavailable;
    // per-field failures are surfaced as pending; never claim a successful sync.
    let notionFieldSync: "synced" | "unchanged" | "pending" | "disabled" | "unlinked" = "disabled";
    const notionEnv = env as unknown as {
      DB?: D1Database;
      NOTION_TARGETED_ADMIN_WRITEBACK_ENABLED?: string;
    };
    if (notionEnv.NOTION_TARGETED_ADMIN_WRITEBACK_ENABLED === "true") {
      if (!notionEnv.DB) {
        notionFieldSync = "pending";
      } else {
        try {
          const result = await runNotionDirectorySyncSweep({
            database: notionEnv.DB,
            bindings: env as Parameters<typeof runNotionDirectorySyncSweep>[0]["bindings"],
            targetProfileId: id,
            breederAdminFields: ["chovatelske-stanice", "treneri"].includes(before.category) || isDirectoryEventPilotCategory(before.category)
              ? breederEditedFields(before, profile) : undefined,
          });
          notionFieldSync = !result.enabled || !result.schemaReady || result.failed ? "pending"
            : result.pushedToNotion || result.pulledFromNotion ? "synced"
            : result.unchanged ? "unchanged" : "unlinked";
        } catch {
          notionFieldSync = "pending";
        }
      }
    }
    if (isDirectoryEventPilotCategory(profile.category) &&
        Object.keys(changedPilotMetadata).length > 0) {
      if (notionEnv.NOTION_TARGETED_ADMIN_WRITEBACK_ENABLED === "true" && notionEnv.DB) {
        try {
          const mirrored = await mirrorPilotDirectoryMetadataFieldsToNotion({
            database: notionEnv.DB,
            bindings: env as Parameters<typeof mirrorPilotDirectoryMetadataFieldsToNotion>[0]["bindings"],
            profileId: id, changed: changedPilotMetadata,
          });
          if (mirrored && notionFieldSync !== "pending" && notionFieldSync !== "unlinked") notionFieldSync = "synced";
        } catch (error) {
          console.error("DIRECTORY_PILOT_METADATA_NOTION_WRITEBACK_FAILED", id, error);
          metadataWarnings.push("Prenos ordinačných hodín alebo zdrojov do Notionu sa nepodaril");
          notionFieldSync = "pending";
        }
      } else {
        metadataWarnings.push("Notion writeback je vypnutý; metadata čakajú na prenos");
        notionFieldSync = "pending";
      }
    }
    if (notionEnv.DB && (["chovatelske-stanice", "treneri"].includes(before.category) || isDirectoryEventPilotCategory(before.category))) {
      const edited = breederEditedFields(before, profile);
      if (edited.length || Object.keys(changedPilotMetadata).length) {
        const failed = ["pending", "disabled", "unlinked"].includes(notionFieldSync);
        await recordDirectoryNotionAlert(notionEnv.DB, id, failed ? "pending" : "resolved",
          failed ? "Zmena profilu je uložená v Admine, ale prenos do Notionu nie je potvrdený." : "",
          "ADMIN_TO_NOTION");
      }
    }
    return Response.json({ profile, notionFieldSync, metadataWarnings });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request: Request, { params }: Props) {
  const auth = await requireAdminMutation(request, { strictProvenance: true });
  if (auth.response || !auth.user) return auth.response ?? unauthorizedAdminResponse();
  const user = auth.user;
  const id = await numericId(params); if (!id) return Response.json({ error: "Neplatné ID profilu." }, { status: 400 });
  try {
    const profile = await archiveManagedDirectoryProfile(id, user.email);
    if (!profile) return Response.json({ error: "Profil sa nenašiel." }, { status: 404 });
    return Response.json({ archived: true, profile });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Profil sa nepodarilo archivovať." }, { status: 500 }); }
}

export async function PATCH(request: Request, { params }: Props) {
  const auth = await requireAdminMutation(request, { strictProvenance: true });
  if (auth.response || !auth.user) return auth.response ?? unauthorizedAdminResponse();
  const user = auth.user;
  const id = await numericId(params); if (!id) return Response.json({ error: "Neplatné ID profilu." }, { status: 400 });
  try {
    const body = await request.json() as { action?: unknown; reviewed?: unknown };
    if (body.action === "set-inline-editorial") {
      // Quick edit is deliberately NOT the full PUT payload: it may change
      // only two text columns and never contacts, address, status, filters,
      // images, slug, canonical services or source_data_json.
      const typed = body as {
        action: string;
        expectedUpdatedAt?: unknown;
        changes?: unknown;
      };
      if (request.headers.get("origin") !== new URL(request.url).origin ||
          !request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
        return Response.json({ error: "Neplatný pôvod alebo typ požiadavky." }, { status: 403 });
      }
      if (typeof typed.expectedUpdatedAt !== "string" || !typed.expectedUpdatedAt.trim() ||
          !typed.changes || typeof typed.changes !== "object" || Array.isArray(typed.changes)) {
        return Response.json({ error: "Chýbajú editované údaje alebo verzia záznamu." }, { status: 400 });
      }
      const data = typed.changes as Record<string, unknown>;
      if (Object.keys(data).length !== 2 || !Object.keys(data).every(key => ["name", "excerpt"].includes(key)) ||
          typeof data.name !== "string" || typeof data.excerpt !== "string") {
        return Response.json({ error: "Upravovať možno iba názov a krátky popis." }, { status: 400 });
      }
      const name = data.name.trim();
      const excerpt = data.excerpt.trim();
      if (!name || name.length > 180 || excerpt.length > 700) {
        return Response.json({ error: "Názov musí mať 1–180 znakov a popis najviac 700 znakov." }, { status: 400 });
      }
      const db = (env as unknown as { DB?: D1Database }).DB;
      if (!db) return Response.json({ error: "Databáza nie je dostupná." }, { status: 503 });
      const breederBefore = await getManagedDirectoryProfileById(id, db);
      const updated = await db.prepare(`UPDATE directory_profiles
        SET name=?1,excerpt=?2,updated_at=?3,updated_by=?4
        WHERE id=?5 AND updated_at=?6 AND status IN ('draft','published')
        RETURNING id`)
        .bind(name, excerpt, new Date().toISOString(), user.email, id, typed.expectedUpdatedAt)
        .first<{ id: number }>();
      if (!updated) {
        return Response.json({ error: "Profil sa zmenil alebo je archivovaný. Obnov tabuľku." }, { status: 409 });
      }
      const profile = await getManagedDirectoryProfileById(id);
      // Match the existing domain PUT's targeted, failure-tolerant Notion sync.
      let notionFieldSync: "synced" | "unchanged" | "pending" | "disabled" | "unlinked" = "disabled";
      const notionEnv = env as unknown as { DB?: D1Database; NOTION_TARGETED_ADMIN_WRITEBACK_ENABLED?: string };
      if (notionEnv.NOTION_TARGETED_ADMIN_WRITEBACK_ENABLED === "true") {
        try {
          const result = await runNotionDirectorySyncSweep({
            database: db,
            bindings: env as Parameters<typeof runNotionDirectorySyncSweep>[0]["bindings"],
            targetProfileId: id,
            breederAdminFields: breederBefore && ["chovatelske-stanice", "treneri"].includes(breederBefore.category) && profile
              ? breederEditedFields(breederBefore, profile) : undefined,
          });
          notionFieldSync = !result.enabled || !result.schemaReady || result.failed ? "pending"
            : result.pushedToNotion || result.pulledFromNotion ? "synced"
            : result.unchanged ? "unchanged" : "unlinked";
        } catch {
          notionFieldSync = "pending";
        }
      }
      if (profile && breederBefore && notionEnv.DB && ["chovatelske-stanice", "treneri"].includes(profile.category)) {
        const edited = breederEditedFields(breederBefore, profile);
        if (edited.length) {
          const failed = ["pending", "disabled", "unlinked"].includes(notionFieldSync);
          await recordDirectoryNotionAlert(notionEnv.DB, id, failed ? "pending" : "resolved",
            failed ? "Rýchla úprava je uložená v Admine, ale prenos do Notionu nie je potvrdený." : "",
            "ADMIN_TO_NOTION");
        }
      }
      return Response.json({ profile, notionFieldSync }, { headers: { "cache-control": "no-store" } });
    }
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
      // Category filters are a separate structured channel from free-text
      // services and the canonical Services V3 catalog.
      let notionFieldSync: "synced" | "unchanged" | "pending" | "disabled" = "disabled";
      if (row.category === "chovatelske-stanice" && Object.keys(requested.updates).length) {
        const bindings = env as Parameters<typeof mirrorBreederCategoryFiltersToNotion>[0]["bindings"];
        const enabled = (env as unknown as { NOTION_TARGETED_ADMIN_WRITEBACK_ENABLED?: string }).NOTION_TARGETED_ADMIN_WRITEBACK_ENABLED === "true";
        if (enabled) {
          try {
            const changed = await mirrorBreederCategoryFiltersToNotion({
              database: db, bindings, profileId: id, fields: Object.keys(requested.updates),
            });
            notionFieldSync = changed ? "synced" : "unchanged";
          } catch (error) {
            console.error("DIRECTORY_NOTION_FACET_WRITEBACK_FAILED", id, error);
            notionFieldSync = "pending";
          }
        }
        if (notionFieldSync === "disabled" || notionFieldSync === "pending") {
          await recordDirectoryNotionAlert(db, id, "pending",
            "Výberové kategóriové filtre sú uložené v Admine, ale ich prenos do Notionu nie je potvrdený.",
            "ADMIN_TO_NOTION");
        } else {
          await recordDirectoryNotionAlert(db, id, "resolved", "", "ADMIN_TO_NOTION");
        }
      }
      return Response.json({ profile: await getManagedDirectoryProfileById(id), notionFieldSync });
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
