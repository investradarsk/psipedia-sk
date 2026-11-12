import { acknowledgeAdminPublication } from "@/lib/admin-record-lifecycle";
import { DirectoryPublicationConflictError, publishDirectoryDraftByCas } from "@/lib/admin-directory-publication";
import { env } from "cloudflare:workers";
import { DIRECTORY_FILTER_CONTRACT_VERSION, mergeDirectoryFilterValues, serviceFilterCategories, type ServiceFilterCategory } from "@/lib/directory-filter-contract";
import { getAdminApiUser, unauthorizedAdminResponse, requireAdminMutation } from "@/lib/admin-auth";
import { archiveManagedDirectoryProfile, getManagedDirectoryProfileById, isDirectoryProfileConflict, restoreManagedDirectoryProfile, setManagedDirectoryProfileReviewed, updateManagedDirectoryProfile, type ManagedDirectoryProfileInput } from "@/lib/directory-store";
import { verifyDirectoryAddressSelection, verifyDirectoryNumberlessAddressSelection, verifyDirectoryNumberlessLocality } from "@/lib/directory-address-provider";
import { breederEditedFields, mirrorBreederCategoryFiltersToNotion, mirrorTrainerTrustFieldsToNotion, mirrorPilotDirectoryMetadataFieldsToNotion, mirrorDirectoryMainImageToNotion, preserveLiveBreederFields, runNotionDirectorySyncSweep, savePilotDirectoryMetadataField, PILOT_DIRECTORY_METADATA_FIELDS, type PilotDirectoryMetadataField } from "@/lib/notion-directory-sync";
import { changedTrainerTrustAdminFields, preserveUneditedTrainerTrust, TRAINER_TRUST_FIELDS, type TrainerTrustField } from "@/lib/notion-trainer-trust-fields";
import { recordDirectoryNotionAlert } from "@/lib/directory-notion-sync-alerts";
import { parseDirectoryMainImageAction, directoryMainImageMatches } from "@/lib/directory-main-image-action";
import { cleanupUnreferencedNotionUpload } from "@/lib/notion-sync-shared";
import { BREEDER_NOTION_EDITORIAL_FIELDS, type BreederEditorialField } from "@/lib/notion-breeder-field-events";
import { isDirectoryEventPilotCategory, isDirectoryFieldEventCategory } from "@/lib/notion-directory-field-event-scope";
import { reconcileDirectorySubmittedTextFields } from "@/lib/directory-editor-text-change-contract";
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
      trainerTrustEditedPaths?: unknown;
      clearMainImage?: unknown;
      mainImageAction?: unknown;
      pilotMetadataFields?: unknown;
      explicitlyClearedContacts?: unknown;
      breederOriginalText?: unknown;
    };
    const {
      numberlessLocalityConfirmed: rawNumberlessLocalityConfirmed,
      breederEditedPaths: rawBreederEditedPaths,
      trainerServicesEdited: rawTrainerServicesEdited,
      trainerTrustEditedPaths: rawTrainerTrustEditedPaths,
      clearMainImage: rawClearMainImage,
      mainImageAction: rawMainImageAction,
      pilotMetadataFields: rawPilotMetadataFields,
      explicitlyClearedContacts: rawExplicitlyClearedContacts,
      breederOriginalText: rawBreederOriginalText,
      ...submittedBody
    } = rawBody;
    // A stale full-form payload must never silently undo a newer Notion edit
    // to a field the editor did not touch.
    let editedPaths: BreederEditorialField[] | null =
      isDirectoryFieldEventCategory(before.category) && Array.isArray(rawBreederEditedPaths)
        ? rawBreederEditedPaths.filter(
            (path): path is BreederEditorialField =>
              typeof path === "string" && Object.hasOwn(BREEDER_NOTION_EDITORIAL_FIELDS, path) &&
              !(path === "services" && isDirectoryEventPilotCategory(before.category)),
          )
        : null;
    if (editedPaths) {
      const recovered = reconcileDirectorySubmittedTextFields({
        current: { excerpt: before.excerpt, description: before.description },
        submitted: submittedBody,
        original: rawBreederOriginalText,
        editedPaths,
      });
      // A changed Lexical field can be missing from the client's dirty list
      // when its last editor update is still being committed on blur. Accept
      // it only if its form baseline matches current D1. No stale overwrite.
      if (recovered.conflicts.length) {
        return Response.json({
          error: "Text profilu sa medzičasom zmenil. Obnov stránku a zopakuj úpravu: " +
            recovered.conflicts.join(", "),
        }, { status: 409 });
      }
      editedPaths = recovered.editedPaths as BreederEditorialField[];
    }
    // An explicit empty contact field is a deletion, not an omitted field in
    // an old editor. Only whitelisted, expressly edited contacts qualify.
    const contactAliases = {
      websiteUrl: ["Web", "Webstránka"],
      publicPhone: ["Telefón", "Telefon", "phone"],
      publicEmail: ["E-mail", "Email", "email"],
      facebookUrl: ["Facebook"],
      instagramUrl: ["Instagram"],
    } as const;
    type ClearableContact = keyof typeof contactAliases;
    const explicitlyClearedContacts: ClearableContact[] =
      Array.isArray(rawExplicitlyClearedContacts) && editedPaths
        ? [...new Set(rawExplicitlyClearedContacts.filter(
            (field): field is ClearableContact => {
              if (typeof field !== "string" || !Object.hasOwn(contactAliases, field) ||
                  !editedPaths.includes(field as BreederEditorialField)) return false;
              const value = (submittedBody as Record<string, unknown>)[field];
              return value === null || (typeof value === "string" && !value.trim());
            },
          ))] : [];
    // A long-open trainer form may carry obsolete checkbox values from before
    // a Notion webhook. Only explicit checkbox edits may change these flags.
    const trainerTrustEditedPaths: TrainerTrustField[] =
      serviceFilterCategories.includes(before.category as ServiceFilterCategory) && Array.isArray(rawTrainerTrustEditedPaths)
        ? rawTrainerTrustEditedPaths.filter(
            (field): field is TrainerTrustField =>
              typeof field === "string" && TRAINER_TRUST_FIELDS.includes(field as TrainerTrustField),
          ) : [];
    const trust = serviceFilterCategories.includes(before.category as ServiceFilterCategory)
      ? preserveUneditedTrainerTrust(before, submittedBody, trainerTrustEditedPaths) : {};
    // The retired internal e-mail is no longer editable. Keep historical D1
    // data until the archival migration, regardless of a stale client payload.
    // Native editor media actions are explicit. A stale whole-form image field
    // may not overwrite a photo changed since the form was opened.
    const mainImageAction = parseDirectoryMainImageAction(
      rawMainImageAction, submittedBody.imageUrl, submittedBody.imageKey,
    );
    if (mainImageAction?.kind === "replace" && rawClearMainImage === true)
      return Response.json({ error: "Fotografiu nemožno súčasne odstrániť a nahradiť." }, { status: 400 });
    const requestedMedia = mainImageAction?.kind === "replace" || mainImageAction?.kind === "remove"
      ? { imageUrl: mainImageAction.imageUrl, imageKey: mainImageAction.imageKey }
      : rawClearMainImage === true && mainImageAction === null
        ? { imageUrl: null, imageKey: null }
        : null;
    if (mainImageAction?.kind === "replace") {
      const bucket = (env as unknown as UploadBindings).BUCKET;
      if (!bucket || !await bucket.head(mainImageAction.imageKey))
        return Response.json({ error: "Nová fotografia nie je dostupná v úložisku. Nahraj ju znova." }, { status: 409 });
    }
    const mediaOverride = requestedMedia ?? (mainImageAction?.kind === "keep"
      ? { imageUrl: before.imageUrl, imageKey: before.imageKey }
      : {});
    const safeSubmittedBody = {
      ...submittedBody, ...trust, internalEmail: before.internalEmail,
      ...mediaOverride,
      // A replacement may already have a user-selected crop in the editor.
      // Only clearing the image must clear its display configuration.
      ...(requestedMedia?.imageUrl === null
        ? { thumbnailImageDisplay: null, detailImageDisplay: null } : {}),
    };
    const fieldPreserved = editedPaths
      ? preserveLiveBreederFields(before, safeSubmittedBody, editedPaths)
      : safeSubmittedBody;
    // Each optional contact is independent. Bad legacy links must not make
    // a different field unsavable, and an explicit empty URL is a valid clear.
    const safeOptionalFields = { ...fieldPreserved };
    // Preserve explicit clears even if a stale whole-form baseline carried
    // old contact aliases. This is a narrow authenticated field-level override.
    for (const field of explicitlyClearedContacts) {
      if (field === "websiteUrl") safeOptionalFields.websiteUrl = null;
      else (safeOptionalFields as Record<string, unknown>)[field] = "";
    }
    const optionalWarnings: string[] = [];
    for (const key of ["websiteUrl", "facebookUrl", "instagramUrl"] as const) {
      const text = safeOptionalFields[key];
      if (typeof text !== "string" || !text.trim()) continue;
      let valid = false;
      try {
        const url = new URL(text.trim());
        valid = url.protocol === "https:" || url.protocol === "http:";
      } catch { /* Only a warning: preserve other edited fields. */ }
      if (valid) continue;
      if (key === "websiteUrl") safeOptionalFields.websiteUrl = null;
      else if (key === "facebookUrl") safeOptionalFields.facebookUrl = "";
      else safeOptionalFields.instagramUrl = "";
      optionalWarnings.push("Neplatný nepovinný odkaz bol vynechaný: " + key);
    }
    if (typeof safeOptionalFields.publicEmail === "string" &&
        safeOptionalFields.publicEmail.trim() &&
        (safeOptionalFields.publicEmail.length > 254 ||
         !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(safeOptionalFields.publicEmail.trim()))) {
      safeOptionalFields.publicEmail = "";
      optionalWarnings.push("Neplatný nepovinný e-mail bol vynechaný");
    }
    // Trainer Notion prose is stored separately from Services V3; a stale
    // editor cannot change the canonical service choices. Pilot categories
    // likewise retain the Services V3-only editing contract.
    if (before.category === "treneri" && rawTrainerServicesEdited === true &&
        typeof submittedBody.trainerServicesText !== "string") {
      return Response.json({ error: "Neplatný textový opis služieb." }, { status: 400 });
    }
    const body: ManagedDirectoryProfileInput = before.category === "treneri"
      ? { ...safeOptionalFields, services: before.services,
          trainerServicesText: rawTrainerServicesEdited === true
            ? submittedBody.trainerServicesText : undefined }
      : isDirectoryEventPilotCategory(before.category)
        ? { ...safeOptionalFields, services: before.services }
        : safeOptionalFields;
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

    // Verify clear requests against BOTH representations of public contacts:
    // website_url and legacy aliases in source_data_json. A stale alias must
    // never resurrect an explicitly deleted website on a public profile.
    const contactClearWarnings: string[] = [];
    if (explicitlyClearedContacts.length) {
      const aliasNames = [...new Set(explicitlyClearedContacts.flatMap(
        field => [...contactAliases[field]],
      ))];
      const paths = aliasNames.map(name => '$."' + name + '"');
      const setParts = [
        ...(explicitlyClearedContacts.includes("websiteUrl") ? ["website_url = NULL"] : []),
        "source_data_json = json_remove(COALESCE(source_data_json, '{}'), " +
          paths.map(() => "?").join(", ") + ")",
        "updated_at = ?", "updated_by = ?",
      ];
      try {
        const saved = await db.prepare(
          "UPDATE directory_profiles SET " + setParts.join(", ") +
          " WHERE id = ? AND category = ? AND status <> 'archived' " +
          "AND updated_at = ? AND json_valid(COALESCE(source_data_json, '{}')) RETURNING id",
        ).bind(...paths, new Date().toISOString(), user.email,
          id, profile.category, profile.updatedAt).first<{ id: number }>();
        if (!saved) throw new Error("EXPLICIT_CONTACT_CLEAR_CONFLICT");
        const refreshed = await getManagedDirectoryProfileById(id, db);
        if (!refreshed || explicitlyClearedContacts.some(field =>
          (field === "websiteUrl" && Boolean(refreshed.websiteUrl)) ||
          contactAliases[field].some(name => Boolean(refreshed.importData?.[name]))
        )) throw new Error("EXPLICIT_CONTACT_CLEAR_NOT_PERSISTED");
        profile = refreshed;
      } catch (error) {
        console.error("DIRECTORY_EXPLICIT_CONTACT_CLEAR_FAILED", id,
          error instanceof Error ? error.message : "UNKNOWN");
        contactClearWarnings.push("Vymazanie nepovinného kontaktu sa nepotvrdilo. Ostatné zmeny zostali uložené.");
      }
    }
    const changedTrainerTrustFields = serviceFilterCategories.includes(before.category as ServiceFilterCategory)
      ? changedTrainerTrustAdminFields(before, profile).filter(field => trainerTrustEditedPaths.includes(field))
      : [];
    // Confirm the exact media URL and key committed by D1, independently
    // of the profile's other editorial fields. A failed or raced image update
    // must never return a misleading 200/"Uložené" response.
    if (requestedMedia) {
      if (!directoryMainImageMatches(profile, requestedMedia)) {
        const saved = await db.prepare(
          "UPDATE directory_profiles SET image_url=?, image_key=?, " +
          "thumbnail_display_json=?, detail_display_json=?, updated_at=?, updated_by=? " +
          "WHERE id=? AND category=? AND status <> 'archived' AND updated_at=? RETURNING id",
        ).bind(requestedMedia.imageUrl, requestedMedia.imageKey,
          requestedMedia.imageUrl ? JSON.stringify(payload.thumbnailImageDisplay ?? null) : null,
          requestedMedia.imageUrl ? JSON.stringify(payload.detailImageDisplay ?? null) : null,
          new Date().toISOString(), user.email, id, profile.category, profile.updatedAt)
          .first<{ id: number }>();
        if (!saved)
          return Response.json({ error: "Zmena hlavnej fotografie nebola potvrdená. Obnov profil a skús to znova." }, { status: 409 });
      }
      const verifiedMedia = await getManagedDirectoryProfileById(id, db);
      if (!verifiedMedia || !directoryMainImageMatches(verifiedMedia, requestedMedia))
        return Response.json({ error: "Fotografia sa v databáze nepotvrdila. Zmeny ostatných polí mohli byť uložené." }, { status: 409 });
      profile = verifiedMedia;
    }
    const mainImageChanged = before.imageUrl !== profile.imageUrl ||
      before.imageKey !== profile.imageKey;
    if (verified) {
      await applyVerifiedDirectoryAddressGeo({ profileId: id, verified, actorRef: user.email });
    }
    // Pilot metadata stays separate from profile normalization and V3 relations.
    const metadataWarnings: string[] = [...optionalWarnings, ...contactClearWarnings];
    const changedPilotMetadata: Partial<Record<PilotDirectoryMetadataField, string>> = {};
    if ((isDirectoryEventPilotCategory(profile.category) || serviceFilterCategories.includes(profile.category as ServiceFilterCategory)) && rawPilotMetadataFields &&
        typeof rawPilotMetadataFields === "object" && !Array.isArray(rawPilotMetadataFields)) {
      const submitted = rawPilotMetadataFields as Record<string, unknown>;
      for (const field of PILOT_DIRECTORY_METADATA_FIELDS) {
        if (!Object.hasOwn(submitted, field) || typeof submitted[field] !== "string") continue;

        // The field key being present is an explicit Admin edit. An empty string
        // clears this one metadata field, not the rest of the profile.
        const value = (submitted[field] as string).trim();
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
            // The Admin editor sends its explicit dirty field IDs. Use those
            // rather than re-inferring a change from legacy contact aliases:
            // the canonical D1 value was already committed above.
            breederAdminFields: isDirectoryFieldEventCategory(before.category)
              ? (editedPaths ?? breederEditedFields(before, profile)) : undefined,
          });
          notionFieldSync = !result.enabled || !result.schemaReady || result.failed ? "pending"
            : result.pushedToNotion || result.pulledFromNotion ? "synced"
            : result.unchanged ? "unchanged" : "unlinked";
        } catch {
          notionFieldSync = "pending";
        }
      }
    }
    if (mainImageChanged && notionEnv.NOTION_TARGETED_ADMIN_WRITEBACK_ENABLED !== "true") {
      notionFieldSync = "pending";
      metadataWarnings.push("Fotografia je uložená v Admine, ale okamžitý prenos do Notionu je vypnutý.");
    }
    if (mainImageChanged && notionEnv.NOTION_TARGETED_ADMIN_WRITEBACK_ENABLED === "true") {
      if (!notionEnv.DB) {
        notionFieldSync = "pending";
        metadataWarnings.push("Fotografia je uložená, ale prenos jej URL do Notionu čaká.");
      } else {
        try {
          await mirrorDirectoryMainImageToNotion({
            database: notionEnv.DB,
            bindings: env as Parameters<typeof mirrorDirectoryMainImageToNotion>[0]["bindings"],
            profileId: id,
          });
          if (notionFieldSync !== "pending") notionFieldSync = "synced";
        } catch (error) {
          console.error("DIRECTORY_IMAGE_NOTION_WRITEBACK_FAILED", id, error);
          notionFieldSync = "pending";
          metadataWarnings.push("Fotografia je uložená, ale URL sa nepodarilo potvrdiť v Notione.");
        }
      }
    }
    if (serviceFilterCategories.includes(profile.category as ServiceFilterCategory) && changedTrainerTrustFields.length) {
      if (notionEnv.NOTION_TARGETED_ADMIN_WRITEBACK_ENABLED === "true" && notionEnv.DB) {
        try {
          const mirrored = await mirrorTrainerTrustFieldsToNotion({
            database: notionEnv.DB,
            bindings: env as Parameters<typeof mirrorTrainerTrustFieldsToNotion>[0]["bindings"],
            profileId: id, fields: changedTrainerTrustFields,
          });
          if (mirrored && notionFieldSync !== "pending" && notionFieldSync !== "unlinked") notionFieldSync = "synced";
        } catch (error) {
          console.error("TRAINER_TRUST_NOTION_WRITEBACK_FAILED", id, error);
          metadataWarnings.push("Prenos overenia alebo odporúčania do Notionu sa nepodaril");
          notionFieldSync = "pending";
        }
      } else {
        metadataWarnings.push("Notion writeback je vypnutý; overenie a odporúčanie čakajú na prenos");
        notionFieldSync = "pending";
      }
    }
    if (Object.keys(changedPilotMetadata).length > 0) {
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
    if (notionEnv.DB && (isDirectoryFieldEventCategory(before.category) || changedTrainerTrustFields.length || mainImageChanged)) {
      const edited = breederEditedFields(before, profile);
      if (edited.length || changedTrainerTrustFields.length || Object.keys(changedPilotMetadata).length || mainImageChanged) {
        const failed = ["pending", "disabled", "unlinked"].includes(notionFieldSync);
        await recordDirectoryNotionAlert(notionEnv.DB, id, failed ? "pending" : "resolved",
          failed ? "Zmena profilu je uložená v Admine, ale prenos do Notionu nie je potvrdený." : "",
          "ADMIN_TO_NOTION");
      }
    }
    if (mainImageChanged && before.imageKey && before.imageKey !== profile.imageKey) {
      // Never delete a shared object: another Directory profile may use it.
      await cleanupUnreferencedNotionUpload(db,
        (env as unknown as UploadBindings).BUCKET, before.imageKey);
    }
    await acknowledgeAdminPublication((env as unknown as {DB?:D1Database}).DB,"directory",id,profile.status);
    // Trainer / breeder field-event writeback does not carry publication state.
    // An owner-triggered publish must also run a separate id-only status mirror;
    // never let a stale Notion concept silently override the canonical decision.
    if (before.status !== "published" && profile.status === "published" &&
        notionEnv.NOTION_TARGETED_ADMIN_WRITEBACK_ENABLED === "true") {
      try {
        const statusSync = await runNotionDirectorySyncSweep({
          database: db,
          bindings: env as Parameters<typeof runNotionDirectorySyncSweep>[0]["bindings"],
          targetProfileId: id,
          // Intentionally NO breederAdminFields: run the structural publication branch.
        });
        notionFieldSync = !statusSync.enabled || !statusSync.schemaReady || statusSync.failed
          ? "pending" : statusSync.pushedToNotion || statusSync.unchanged ? "synced" : "pending";
        if (notionFieldSync === "pending") {
          metadataWarnings.push("Publikované v Admine; stav v Notione ešte nie je potvrdený.");
        }
      } catch (error) {
        console.error("DIRECTORY_PUBLICATION_NOTION_WRITEBACK_FAILED", id, error);
        notionFieldSync = "pending";
        metadataWarnings.push("Publikovanie je uložené v Admine, ale prenos stavu do Notionu nie je potvrdený.");
      }
    }
    // Re-read persisted D1 after all metadata and provider side-effects; a stale
    // intermediate projection must never be reported as the final lifecycle.
    const saved = await getManagedDirectoryProfileById(id, db);
    if (!saved) return Response.json({ error: "Záznam po uložení neexistuje." }, { status: 409 });
    // Validate the actual D1 result, never a successful HTTP call or a stale
    // form echo. In particular, an unpersisted Perex must never say "Uložené".
    const cleanText = (value: unknown) => typeof value === "string"
      ? value.replace(/\r\n?/g, "\n").trim() : "";
    const mismatchedText = (["excerpt", "description"] as const).filter(field =>
      editedPaths?.includes(field) &&
      cleanText(saved[field]) !== cleanText(payload[field]),
    );
    if (mismatchedText.length) {
      console.warn("DIRECTORY_TEXT_D1_SAVE_NOT_CONFIRMED", id, mismatchedText);
      return Response.json({
        error: "Text profilu sa po uložení v databáze nepotvrdil (" +
          mismatchedText.join(", ") + "). Obnov profil a skontroluj hodnotu.",
      }, { status: 409, headers: { "cache-control": "no-store" } });
    }
    return Response.json({ profile: saved, notionFieldSync, metadataWarnings },
      { headers: { "cache-control": "no-store" } });
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
    if (body.action === "publish-confirmed-draft") {
      // A signed-in owner has already requested publication and a full-form
      // save returned an unconfirmed draft. Never retry the whole stale form.
      // This narrow CAS changes ONLY the publication columns, provided that
      // canonical identity and the latest D1 revision still match.
      if (request.headers.get("origin") !== new URL(request.url).origin ||
          !request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
        return Response.json({ error: "Neplatný pôvod alebo typ požiadavky." }, { status: 403 });
      }
      const fields = body as { action: string; expectedUpdatedAt?: unknown;
        expectedSlug?: unknown; expectedCategory?: unknown };
      if (Object.keys(fields).length !== 4 ||
          typeof fields.expectedUpdatedAt !== "string" ||
          typeof fields.expectedSlug !== "string" ||
          typeof fields.expectedCategory !== "string") {
        return Response.json({ error: "Chýba overená verzia alebo identita profilu." }, { status: 400 });
      }
      const db = (env as unknown as { DB?: D1Database }).DB;
      if (!db) return Response.json({ error: "Databáza nie je dostupná." }, { status: 503 });
      try {
        await publishDirectoryDraftByCas({
          db, id, actor: user.email,
          expectedUpdatedAt: fields.expectedUpdatedAt,
          expectedSlug: fields.expectedSlug,
          expectedCategory: fields.expectedCategory,
        });
      } catch (error) {
        if (error instanceof DirectoryPublicationConflictError) {
          return Response.json({ error: error.message }, { status: 409 });
        }
        throw error;
      }
      // The explicit Admin owner action may clear a prior inbound unpublish
      // guard only after the canonical status transition is confirmed.
      await acknowledgeAdminPublication(db, "directory", id, "published");
      let notionFieldSync: "synced" | "pending" | "disabled" = "disabled";
      const enabled = (env as unknown as {
        NOTION_TARGETED_ADMIN_WRITEBACK_ENABLED?: string
      }).NOTION_TARGETED_ADMIN_WRITEBACK_ENABLED === "true";
      if (enabled) {
        try {
          const result = await runNotionDirectorySyncSweep({
            database: db,
            bindings: env as Parameters<typeof runNotionDirectorySyncSweep>[0]["bindings"],
            targetProfileId: id,
          });
          notionFieldSync = !result.enabled || !result.schemaReady || result.failed
            ? "pending" : result.pushedToNotion || result.unchanged ? "synced" : "pending";
        } catch (error) {
          console.error("DIRECTORY_PUBLICATION_TARGETED_SYNC_FAILED", id, error);
          notionFieldSync = "pending";
        }
      }
      const profile = await getManagedDirectoryProfileById(id, db);
      if (!profile || profile.status !== "published" ||
          profile.slug !== fields.expectedSlug ||
          profile.category !== fields.expectedCategory) {
        return Response.json({ error: "Zmena publikovania sa v databáze nepotvrdila. Obnov profil." },
          { status: 409 });
      }
      return Response.json({ profile, notionFieldSync }, { headers: { "cache-control": "no-store" } });
    }
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
            // Inline edits must have the same immediate per-field writeback for
            // *all ten* Directory categories as the full editor PUT.
            breederAdminFields: breederBefore && isDirectoryFieldEventCategory(breederBefore.category) && profile
              ? breederEditedFields(breederBefore, profile) : undefined,
          });
          notionFieldSync = !result.enabled || !result.schemaReady || result.failed ? "pending"
            : result.pushedToNotion || result.pulledFromNotion ? "synced"
            : result.unchanged ? "unchanged" : "unlinked";
        } catch {
          notionFieldSync = "pending";
        }
      }
      if (profile && breederBefore && notionEnv.DB && isDirectoryFieldEventCategory(profile.category)) {
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
      if (isDirectoryFieldEventCategory(row.category) && Object.keys(requested.updates).length) {
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
