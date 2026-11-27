import { planDirectoryAdminReceipts, directoryFacetReceiptField } from "@/lib/notion-directory-admin-receipts";
import { acknowledgeAdminPublication } from "@/lib/admin-record-lifecycle";
import { DirectoryPublicationConflictError, publishDirectoryDraftByCas } from "@/lib/admin-directory-publication";
import { env } from "cloudflare:workers";
import { readDirectory0170EditorialFields } from "@/lib/directory-0170-editorial-read";
import { planDirectoryStep3PresentationSqlMirror } from "@/lib/directory-sql-step3-live-mirror";
import { planDirectory0170FilterSqlMirror } from "@/lib/directory-0170-editorial-sql-mirror";
import { validateDirectoryFullProfileSave } from "@/lib/directory-full-profile-save";
import { DIRECTORY_FILTER_CONTRACT_VERSION, getDirectoryFilterDefinition, normalizeDirectoryFilterValue, serviceFilterCategories, type ServiceFilterCategory } from "@/lib/directory-filter-contract";
import { getAdminApiUser, unauthorizedAdminResponse, requireAdminMutation } from "@/lib/admin-auth";
import { archiveManagedDirectoryProfile, getManagedDirectoryProfileById, isDirectoryProfileConflict, restoreManagedDirectoryProfile, setManagedDirectoryProfileReviewed, updateManagedDirectoryProfile, type ManagedDirectoryProfileInput } from "@/lib/directory-store";
import { verifyDirectoryAddressSelection, verifyDirectoryNumberlessAddressSelection, verifyDirectoryNumberlessLocality } from "@/lib/directory-address-provider";
import { breederEditedFields, mirrorBreederCategoryFiltersToNotion, mirrorTrainerTrustFieldsToNotion, mirrorPilotDirectoryMetadataFieldsToNotion, mirrorDirectoryMainImageToNotion, preserveLiveBreederFields, runNotionDirectorySyncSweep, completeDirectoryReviewedOwnerUnlock, mirrorDirectoryAdditionalCategoriesToNotion, savePilotDirectoryMetadataField, PILOT_DIRECTORY_METADATA_FIELDS, type PilotDirectoryMetadataField } from "@/lib/notion-directory-sync";
import { changedTrainerTrustAdminFields, preserveUneditedTrainerTrust, TRAINER_TRUST_FIELDS, type TrainerTrustField } from "@/lib/notion-trainer-trust-fields";
import { recordDirectoryNotionAlert } from "@/lib/directory-notion-sync-alerts";
import { syncDirectoryReviewedWithNotion, type DirectoryReviewSyncResult } from "@/lib/directory-notion-reviewed-sync";
import { parseDirectoryMainImageAction, directoryMainImageMatches } from "@/lib/directory-main-image-action";
import { cleanupUnreferencedNotionUpload } from "@/lib/notion-sync-shared";
import { BREEDER_NOTION_EDITORIAL_FIELDS, DIRECTORY_CONTACT_EDITORIAL_PATHS, type BreederEditorialField } from "@/lib/notion-breeder-field-events";
import { isDirectoryEventPilotCategory, isDirectoryFieldEventCategory } from "@/lib/notion-directory-field-event-scope";
import { reconcileDirectorySubmittedTextFields } from "@/lib/directory-editor-text-change-contract";
import { normalizeAdditionalDirectoryCategories } from "@/lib/directory-multi-category";
import { directoryEditedFieldMismatches } from "@/lib/directory-editor-field-verification";
import { readDirectoryPublicContacts } from "@/lib/directory-profile-metadata";
import { isDirectoryPublicMetadataField, readDirectoryPublicMetadataValue } from "@/lib/directory-public-facts";
import { directoryLegacyEditableFactKeys } from "@/lib/directory-detail-presentation";
import { directoryContactValueMismatches, preserveUntouchedDirectoryContacts, scopeAdminContactSave } from "@/lib/directory-contact-save-contract";
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
  // SQL is already the authoritative source; the old JSON comparison route is retired.
  if (new URL(_request.url).searchParams.get("sqlParity") === "1") {
    return Response.json({ error: "Historická JSON kontrola bola po prechode na SQL odstránená." }, { status: 410 });
  }
  const profile = await getManagedDirectoryProfileById(id);
  if (!profile) return Response.json({ error: "Profil sa nenašiel." }, { status: 404 });
  const db=(env as unknown as {DB?:D1Database}).DB;
  if (!db) return Response.json({error:"Databáza nie je dostupná."},{status:503});
  try {
    // The owner sees confirmed SQL facts/filters, but every SQL field still
    // missing on a historical profile comes from its existing JSON.
    // A failed canonical read must not offer a stale editable form as current.
    const importData=await readDirectory0170EditorialFields(db,{
      profileId:id,category:profile.category,
      source:profile.importData,audience:"admin",
    });
    return Response.json({profile:{...profile,importData}},
      {headers:{"cache-control":"no-store"}});
  } catch {
    return Response.json({
      error:"Kontrola SQL údajov profilu zlyhala. Obnov stránku, údaje zostali nezmenené.",
    },{status:503,headers:{"cache-control":"no-store"}});
  }
}

export async function PUT(request: Request, { params }: Props) {
  const auth = await requireAdminMutation(request, { strictProvenance: true });
  if (auth.response || !auth.user) return auth.response ?? unauthorizedAdminResponse();
  const user = auth.user;
  const id = await numericId(params); if (!id) return Response.json({ error: "Neplatné ID profilu." }, { status: 400 });
  try {
    const projected = await getManagedDirectoryProfileById(id);
    if (!projected) return Response.json({ error: "Profil sa nenašiel." }, { status: 404 });
    // SQL is the only public-field baseline. A malformed historical JSON
    // payload must not veto an otherwise valid Admin save.
    const db = (env as unknown as { DB?: D1Database }).DB;
    if (!db) return Response.json({ error: "Databáza nie je dostupná." }, { status: 503 });
    const before = projected;
    const rawBody = await request.json() as ManagedDirectoryProfileInput & {
      numberlessLocalityConfirmed?: unknown;
      breederEditedPaths?: unknown;
      trainerServicesEdited?: unknown;
      trainerTrustEditedPaths?: unknown;
      clearMainImage?: unknown;
      mainImageAction?: unknown;
      pilotMetadataFields?: unknown;
      pilotMetadataOriginalValues?: unknown;
      explicitlyClearedContacts?: unknown;
      contactEditedFields?: unknown;
      contactOriginalValues?: unknown;
      breederOriginalText?: unknown;
      confirmContactSync?: unknown;
      fullProfileSave?: unknown;
      expectedUpdatedAt?: unknown;
      reviewOnSave?: unknown;
    };
    const {
      numberlessLocalityConfirmed: rawNumberlessLocalityConfirmed,
      breederEditedPaths: rawBreederEditedPaths,
      trainerServicesEdited: rawTrainerServicesEdited,
      trainerTrustEditedPaths: rawTrainerTrustEditedPaths,
      clearMainImage: rawClearMainImage,
      mainImageAction: rawMainImageAction,
      pilotMetadataFields: rawPilotMetadataFields,
      pilotMetadataOriginalValues: rawPilotMetadataOriginalValues,
      explicitlyClearedContacts: rawExplicitlyClearedContacts,
      contactEditedFields: rawContactEditedFields,
      contactOriginalValues: rawContactOriginalValues,
      breederOriginalText: rawBreederOriginalText,
      confirmContactSync: rawConfirmContactSync,
      fullProfileSave: rawFullProfileSave,
      expectedUpdatedAt: rawExpectedUpdatedAt,
      reviewOnSave: rawReviewOnSave,
      ...submittedBody
    } = rawBody;
    const fullProfileSave = rawFullProfileSave === true;
    const reviewOnSave = rawReviewOnSave === true && fullProfileSave &&
      (env as unknown as {NOTION_PROFILE_AUTHORITY_MODE?:string}).NOTION_PROFILE_AUTHORITY_MODE==="validated-text";
    // Full visible form is authoritative, but never overwrite a newer D1 revision.
    // Missing fields from an old/partially hydrated editor are NOT clears.
    if (fullProfileSave) {
      const validation = validateDirectoryFullProfileSave({
        expectedUpdatedAt: rawExpectedUpdatedAt,
        currentUpdatedAt: before.updatedAt,
        submitted: submittedBody as Record<string, unknown>,
      });
      if (validation !== "valid") return Response.json({
        error: validation === "stale"
          ? "Profil sa od otvorenia zmenil. Obnov stránku a potom ulož svoj aktuálny formulár."
          : "Formulár neobsahuje všetky polia. Obnov stránku; nič sa neuložilo.",
      }, { status: 409, headers: { "cache-control": "no-store" } });
    }
    const metadataOriginalValues =
      rawPilotMetadataOriginalValues && typeof rawPilotMetadataOriginalValues === "object" &&
      !Array.isArray(rawPilotMetadataOriginalValues)
        ? rawPilotMetadataOriginalValues as Record<string, unknown> : null;
    if (rawPilotMetadataFields !== undefined) {
      if (!rawPilotMetadataFields || typeof rawPilotMetadataFields !== "object" ||
          Array.isArray(rawPilotMetadataFields)) {
        return Response.json({ error: "Neplatné verejné metadáta profilu." }, { status: 400 });
      }
      const edits = rawPilotMetadataFields as Record<string, unknown>;
      const keys = Object.keys(edits);
      // The same public registry drives the editor and the public renderer.
      // A legacy field outside this category is not a safe free-text edit.
      const editable = new Set([
        "Ordinačné hodiny", "Zdroj dát", "Zdroj obrázka", "Alt text obrázka",
        "Organizácia", "Zameranie",
        ...directoryLegacyEditableFactKeys(before),
      ]);
      if (keys.length > 50 || keys.some(key => !editable.has(key) ||
          !isDirectoryPublicMetadataField(key) ||
          typeof edits[key] !== "string" || (edits[key] as string).length > 2000)) {
        return Response.json({ error: "Nepodporované alebo príliš dlhé verejné pole profilu." }, { status: 400 });
      }
      // A stale form must present a per-field D1 baseline before any mutation.
      if (!metadataOriginalValues || keys.some(key =>
          typeof metadataOriginalValues[key] !== "string")) {
        return Response.json({
          error: "Chýba pôvodná hodnota upravovaného poľa. Obnov profil a zopakuj úpravu.",
        }, { status: 409, headers: { "cache-control": "no-store" } });
      }
      if (keys.some(key => {
        const latest = readDirectoryPublicMetadataValue(before.importData, key);
        const original = (metadataOriginalValues[key] as string).trim();
        return latest !== original && latest !== (edits[key] as string).trim();
      })) {
        return Response.json({
          error: "Verejný údaj sa medzičasom zmenil v D1. Obnov profil, aby sa novšia hodnota neprepísala.",
        }, { status: 409, headers: { "cache-control": "no-store" } });
      }
    }
    // One canonical Admin Save is the current, complete form. Dirty-path
    // hints belong ONLY to backwards-compatible partial editors, not this
    // full-form action. All ordinary editorial fields are included when
    // mirroring the confirmed D1 result to Notion.
    let editedPaths: BreederEditorialField[] | null =
      fullProfileSave && isDirectoryFieldEventCategory(before.category)
        ? (Object.keys(BREEDER_NOTION_EDITORIAL_FIELDS) as BreederEditorialField[])
            .filter(path => path !== "services" || !isDirectoryEventPilotCategory(before.category))
        : isDirectoryFieldEventCategory(before.category) && Array.isArray(rawBreederEditedPaths)
        ? rawBreederEditedPaths.filter(
            (path): path is BreederEditorialField =>
              typeof path === "string" && Object.hasOwn(BREEDER_NOTION_EDITORIAL_FIELDS, path) &&
              !(path === "services" && isDirectoryEventPilotCategory(before.category)),
          )
        : null;
    if (editedPaths && !fullProfileSave) {
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
      const liveContacts = readDirectoryPublicContacts(before.importData, before.websiteUrl ?? "");
      const contactScope = fullProfileSave ? null : scopeAdminContactSave({
        editedPaths,
        interactedFields: rawContactEditedFields,
        originalValues: rawContactOriginalValues,
        submitted: submittedBody as Record<string, unknown>,
        currentValues: {
          websiteUrl: liveContacts.website, publicPhone: liveContacts.phone,
          publicEmail: liveContacts.email, facebookUrl: liveContacts.facebook,
          instagramUrl: liveContacts.instagram,
        },
      });
      if (contactScope?.incompatible) return Response.json({
        error: "Editor kontaktov je zastaraný. Obnov stránku pred ďalším uložením; nedotknuté kontakty zostali zachované.",
      }, { status: 409, headers: { "cache-control": "no-store" } });
      if (contactScope?.conflicts.length) return Response.json({
        error: "Kontakty sa medzičasom zmenili v databáze (" +
          contactScope.conflicts.join(", ") +
          "). Obnov profil a skontroluj hodnoty. Nič sa neprepísalo.",
      }, { status: 409, headers: { "cache-control": "no-store" } });
      if (contactScope) editedPaths = contactScope.editedPaths as BreederEditorialField[];
    }
    // A complete form is not proof that any individual contact was edited.
    // Hidden/partially hydrated or masked contact inputs must not clear D1,
    // nor authorize a remote write when saving an unrelated field.
    let fullContactPaths: readonly string[] = [];
    if (fullProfileSave) {
      const current = readDirectoryPublicContacts(before.importData, before.websiteUrl ?? "");
      const scoped = scopeAdminContactSave({
        editedPaths: DIRECTORY_CONTACT_EDITORIAL_PATHS,
        interactedFields: rawContactEditedFields,
        originalValues: rawContactOriginalValues,
        submitted: submittedBody as Record<string, unknown>,
        currentValues: {websiteUrl: current.website, publicPhone: current.phone,
          publicEmail: current.email, facebookUrl: current.facebook, instagramUrl: current.instagram},
      });
      if (scoped.incompatible || scoped.conflicts.length) return Response.json({
        error: "Kontakty sa nepodarilo bezpečne overiť. Obnov profil a zopakuj úpravu.",
      }, { status: 409, headers: { "cache-control": "no-store" } });
      fullContactPaths = scoped.editedPaths;
      if (editedPaths) editedPaths = [...new Set<BreederEditorialField>([
        ...editedPaths.filter(path => !(DIRECTORY_CONTACT_EDITORIAL_PATHS as readonly string[]).includes(path)),
        ...scoped.editedPaths as BreederEditorialField[],
      ])];
    }
    // An explicit owner save from the Contacts tab may re-confirm contact values
    // already present in D1 but missing in Notion. This never expands the
    // full-form D1 write or resynchronizes unrelated fields.
    const confirmContactSync = rawConfirmContactSync === true && editedPaths !== null &&
      submittedBody.category === before.category && before.status !== "archived";
    // An explicit empty contact field is a deletion, not an omitted field in
    // an old editor. Only whitelisted, expressly edited contacts qualify.
    const clearableContactKeys = new Set([
      "websiteUrl", "publicPhone", "publicEmail", "facebookUrl", "instagramUrl",
    ] as const);
    type ClearableContact = "websiteUrl" | "publicPhone" | "publicEmail" | "facebookUrl" | "instagramUrl";
    // The editor's dirty diff alone is never permission to clear D1. A
    // deletion additionally requires a real input-interaction receipt.
    const explicitlyClearedContacts: ClearableContact[] =
      !fullProfileSave && Array.isArray(rawExplicitlyClearedContacts) && editedPaths
        ? [...new Set(rawExplicitlyClearedContacts.filter(
            (field): field is ClearableContact => {
              if (typeof field !== "string" || !clearableContactKeys.has(field as ClearableContact) ||
                  !editedPaths.includes(field as BreederEditorialField)) return false;
              const interacted = Array.isArray(rawContactEditedFields) &&
                rawContactEditedFields.includes(field);
              if (!interacted) return false;
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
    const trust = fullProfileSave ? {} : serviceFilterCategories.includes(before.category as ServiceFilterCategory)
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
    const fieldPreserved = !fullProfileSave && editedPaths
      ? preserveLiveBreederFields(before, safeSubmittedBody, editedPaths)
      : safeSubmittedBody;
    // The current full-form text is authoritative, including empty strings.
    // Only backwards-compatible partial requests borrow untouched contacts
    // from D1. Public renderers decide whether a saved text is a valid link.
    const liveContactValues = readDirectoryPublicContacts(before.importData, before.websiteUrl ?? "");
    const safeOptionalFields = preserveUntouchedDirectoryContacts(
      { ...fieldPreserved },
      {
        websiteUrl: liveContactValues.website,
        publicPhone: liveContactValues.phone,
        publicEmail: liveContactValues.email,
        facebookUrl: liveContactValues.facebook,
        instagramUrl: liveContactValues.instagram,
      },
      fullProfileSave ? fullContactPaths : editedPaths ?? [],
    );
    // Full saves normalize all five contacts in the same D1 UPDATE, including
    // intentional empty values. Only legacy partial requests need the
    // separate explicit-clear recovery SQL below.
    for (const field of explicitlyClearedContacts) {
      if (field === "websiteUrl") safeOptionalFields.websiteUrl = null;
      else (safeOptionalFields as Record<string, unknown>)[field] = "";
    }
    // No contact-format warnings or destructive edits: text is stored as entered.
    const optionalWarnings: string[] = [];
    // Trainer Notion prose is stored separately from Services V3; a stale
    // editor cannot change the canonical service choices. Pilot categories
    // likewise retain the Services V3-only editing contract.
    if (before.category === "treneri" && rawTrainerServicesEdited === true &&
        typeof submittedBody.trainerServicesText !== "string") {
      return Response.json({ error: "Neplatný textový opis služieb." }, { status: 400 });
    }
    const body: ManagedDirectoryProfileInput = before.category === "treneri"
      ? { ...safeOptionalFields, services: before.services,
          trainerServicesText: fullProfileSave || rawTrainerServicesEdited === true
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
    // A Notion webhook may update D1 after we read the profile but before
    // the full-form UPDATE. Never overwrite that concurrent revision silently.
    let profile = await updateManagedDirectoryProfile(
      id, payload, user.email, before, db, {
        expectedUpdatedAt: before.updatedAt,
        reviewOnSave,
        unifiedEditFields: (env as unknown as { NOTION_UNIFIED_FIELD_SYNC_ENABLED?: string }).NOTION_UNIFIED_FIELD_SYNC_ENABLED === "true"
          ? (editedPaths ?? []) : undefined,
      },
    );
    if (!profile) return Response.json({
      error: "Profil sa medzitým zmenil v databáze. Obnov ho a zopakuj svoju úpravu.",
    }, { status: 409, headers: { "cache-control": "no-store" } });

    // Compare the submitted contact values to the SQL-backed reload, never
    // to historic source_data_json aliases or a stale form snapshot.
    const expectedContactValues = {
      websiteUrl: body.websiteUrl ?? "",
      publicPhone: body.publicPhone ?? "",
      publicEmail: body.publicEmail ?? "",
      facebookUrl: body.facebookUrl ?? "",
      instagramUrl: body.instagramUrl ?? "",
    };
    const postD1Contacts = readDirectoryPublicContacts(profile.importData, profile.websiteUrl ?? "");
    const contactLossBeforeNotion = directoryContactValueMismatches(expectedContactValues, {
      websiteUrl: postD1Contacts.website, publicPhone: postD1Contacts.phone,
      publicEmail: postD1Contacts.email, facebookUrl: postD1Contacts.facebook,
      instagramUrl: postD1Contacts.instagram,
    });
    if (contactLossBeforeNotion.length) {
      console.error("DIRECTORY_CONTACT_PRESERVATION_FAILED_BEFORE_NOTION", id, contactLossBeforeNotion);
      return Response.json({
        error: "Kontaktné údaje sa po uložení v D1 nezhodujú (" +
          contactLossBeforeNotion.join(", ") +
          "). Synchronizácia do Notionu bola zastavená. Obnov profil a skontroluj údaje.",
      }, { status: 409, headers: { "cache-control": "no-store" } });
    }
    const changedTrainerTrustFields = serviceFilterCategories.includes(before.category as ServiceFilterCategory)
      ? changedTrainerTrustAdminFields(before, profile).filter(field => trainerTrustEditedPaths.includes(field))
      : [];
    // Confirm the exact media URL and key committed by D1, independently
    // of the profile's other editorial fields. A failed or raced image update
    // must never return a misleading 200/"Uložené" response.
    if (requestedMedia) {
      if (!directoryMainImageMatches(profile, requestedMedia)) {
        const updatedAt = new Date(Math.max(Date.now(), Date.parse(profile.updatedAt) + 1)).toISOString();
        const identity = { kind: "id" as const, profileId: id, updatedAt, actor: user.email };
        const imageSettings = planDirectoryStep3PresentationSqlMirror({
          identity,
          thumbnailImageDisplay: requestedMedia.imageUrl ? payload.thumbnailImageDisplay ?? null : null,
          detailImageDisplay: requestedMedia.imageUrl ? payload.detailImageDisplay ?? null : null,
        });
        const [saved] = await db.batch([
          db.prepare(
            "UPDATE directory_profiles SET image_url=?, image_key=?, updated_at=?, updated_by=? " +
            "WHERE id=? AND category=? AND status <> 'archived' AND updated_at=?",
          ).bind(requestedMedia.imageUrl, requestedMedia.imageKey, updatedAt, user.email, id, profile.category, profile.updatedAt),
          ...imageSettings.map((item) => db.prepare(item.sql).bind(...item.bindings)),
        ]);
        if (saved.meta.changes !== 1)
          return Response.json({ error: "Zmena hlavnej fotografie nebola potvrdená. Obnov profil a skús to znova." }, { status: 409 });
      }
      const verifiedMedia = await getManagedDirectoryProfileById(id, db);
      if (!verifiedMedia || !directoryMainImageMatches(verifiedMedia, requestedMedia))
        return Response.json({ error: "Fotografia sa v databáze nepotvrdila. Zmeny ostatných polí mohli byť uložené." }, { status: 409 });
      profile = verifiedMedia;
    }
    const mainImageChanged = before.imageUrl !== profile.imageUrl ||
      before.imageKey !== profile.imageKey;
    const additionalCategoriesChanged =
      JSON.stringify(before.additionalCategories ?? []) !== JSON.stringify(profile.additionalCategories ?? []);
    if (submittedBody.additionalCategories !== undefined) {
      const expected = normalizeAdditionalDirectoryCategories(submittedBody.additionalCategories, profile.category);
      if (JSON.stringify(expected) !== JSON.stringify(profile.additionalCategories ?? []))
        return Response.json({ error: "Ďalšie kategórie sa nepotvrdili v D1. Obnov profil." }, { status: 409 });
    }
    if (verified) {
      await applyVerifiedDirectoryAddressGeo({ profileId: id, verified, actorRef: user.email });
    }
    // Pilot metadata stays separate from profile normalization and V3 relations.
    const metadataWarnings: string[] = [...optionalWarnings];
    const changedPilotMetadata: Partial<Record<PilotDirectoryMetadataField, string>> = {};
    if ((isDirectoryEventPilotCategory(profile.category) || serviceFilterCategories.includes(profile.category as ServiceFilterCategory)) && rawPilotMetadataFields &&
        typeof rawPilotMetadataFields === "object" && !Array.isArray(rawPilotMetadataFields)) {
      const submitted = rawPilotMetadataFields as Record<string, unknown>;
      for (const field of Object.keys(submitted)) {
        if (!isDirectoryPublicMetadataField(field) ||
            typeof submitted[field] !== "string") continue;

        // The field key being present is an explicit Admin edit. An empty string
        // clears this one metadata field, not the rest of the profile.
        const value = (submitted[field] as string).trim();
        try {
          profile = await savePilotDirectoryMetadataField({
            database: db, profileId: id, category: profile.category, field, value,
            adminReceiptActor: (env as unknown as { NOTION_UNIFIED_FIELD_SYNC_ENABLED?: string }).NOTION_UNIFIED_FIELD_SYNC_ENABLED === "true" ? user.email : undefined,
            expectedValue: typeof metadataOriginalValues?.[field] === "string"
              ? (metadataOriginalValues[field] as string).trim() : undefined,
          });
          // The original six pilot properties have Notion mappings.
          // Other public facts remain Admin/D1-owned until explicit schema
          // parity is established; do not invent missing Notion properties.
          if ((PILOT_DIRECTORY_METADATA_FIELDS as readonly string[]).includes(field)) {
            changedPilotMetadata[field as PilotDirectoryMetadataField] = value;
          }
        } catch (error) {
          console.error("DIRECTORY_PILOT_METADATA_ADMIN_SAVE_FAILED", id, field, error);
          metadataWarnings.push(field + ": zmena nebola uložená");
        }
      }
    }
    // Record whether an edited contact already differs immediately after the
    // canonical D1 save, before any Notion network round-trips. This separates
    // a D1 persistence issue from a later incoming webhook overwriting a value.
    // Log only field names, never the user's contact values.
    const editedContactPaths = (editedPaths ?? []).filter(
      (path): path is typeof DIRECTORY_CONTACT_EDITORIAL_PATHS[number] =>
        (DIRECTORY_CONTACT_EDITORIAL_PATHS as readonly string[]).includes(path),
    );
    const beforeNotionContactProfile = editedContactPaths.length
      ? await getManagedDirectoryProfileById(id, db) : null;
    const contactMismatchesBeforeNotion = beforeNotionContactProfile
      ? directoryEditedFieldMismatches({
          submitted: payload,
          persisted: beforeNotionContactProfile,
          editedPaths: editedContactPaths,
        }) : [];
    if (contactMismatchesBeforeNotion.length) {
      console.warn("DIRECTORY_CONTACT_D1_MISMATCH_BEFORE_NOTION", id, contactMismatchesBeforeNotion);
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
              ? [...new Set<BreederEditorialField>([
                  ...(editedPaths ?? breederEditedFields(before, profile)),
                  ...(confirmContactSync ? DIRECTORY_CONTACT_EDITORIAL_PATHS.filter(field =>
                    typeof body[field] === "string" && Boolean(body[field]?.trim())) : []),
                ])] : undefined,
          });
          notionFieldSync = !result.enabled || !result.schemaReady || result.failed ? "pending"
            : result.pushedToNotion || result.pulledFromNotion ? "synced"
            : result.unchanged ? "unchanged" : "unlinked";
        } catch {
          notionFieldSync = "pending";
        }
      }
    }
    if (confirmContactSync && ["pending", "disabled", "unlinked"].includes(notionFieldSync)) {
      metadataWarnings.push("Kontakty sú uložené v Admine, ale prenos do Notionu nie je potvrdený.");
    }
    if (additionalCategoriesChanged) {
      if (notionEnv.NOTION_TARGETED_ADMIN_WRITEBACK_ENABLED !== "true" || !notionEnv.DB) {
        notionFieldSync = "pending";
        metadataWarnings.push("Ďalšie kategórie sú v D1, ale Notion ich zatiaľ nepotvrdil.");
      } else {
        try {
          await mirrorDirectoryAdditionalCategoriesToNotion({
            database: notionEnv.DB,
            bindings: env as Parameters<typeof mirrorDirectoryAdditionalCategoriesToNotion>[0]["bindings"],
            profileId: id,
          });
          if (notionFieldSync !== "pending") notionFieldSync = "synced";
        } catch (error) {
          console.error("DIRECTORY_CATEGORIES_NOTION_WRITEBACK_FAILED", id,
            error instanceof Error ? error.message : "UNKNOWN");
          notionFieldSync = "pending";
          metadataWarnings.push("Ďalšie kategórie sú v D1, ale prenos do Notionu čaká.");
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
      if (edited.length || confirmContactSync || changedTrainerTrustFields.length || Object.keys(changedPilotMetadata).length || mainImageChanged) {
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
    // Metadata warning is not a save receipt. Verify every explicitly edited
    // public fact against the persisted D1 snapshot after Notion side-effects.
    const unconfirmedPublicFacts = rawPilotMetadataFields && typeof rawPilotMetadataFields === "object" &&
      !Array.isArray(rawPilotMetadataFields)
      ? Object.entries(rawPilotMetadataFields as Record<string, string>)
        .filter(([field, expected]) =>
          readDirectoryPublicMetadataValue(saved.importData, field) !== expected.trim())
        .map(([field]) => field)
      : [];
    if (unconfirmedPublicFacts.length) {
      return Response.json({
        error: "V D1 sa nepotvrdili verejné údaje (" + unconfirmedPublicFacts.join(", ") +
          "). Iné časti profilu už môžu byť uložené; obnov profil a skontroluj ich.",
      }, { status: 409, headers: { "cache-control": "no-store" } });
    }
    const finalContacts = readDirectoryPublicContacts(saved.importData, saved.websiteUrl ?? "");
    const contactLossAfterNotion = directoryContactValueMismatches(expectedContactValues, {
      websiteUrl: finalContacts.website, publicPhone: finalContacts.phone,
      publicEmail: finalContacts.email, facebookUrl: finalContacts.facebook,
      instagramUrl: finalContacts.instagram,
    });
    if (contactLossAfterNotion.length) {
      console.error("DIRECTORY_CONTACT_PRESERVATION_FAILED_AFTER_NOTION", id, contactLossAfterNotion);
      return Response.json({
        error: "Po uložení boli niektoré kontakty nečakane zmenené (" +
          contactLossAfterNotion.join(", ") +
          "). Obnov profil; údaje nie sú bezpečne potvrdené.",
      }, { status: 409, headers: { "cache-control": "no-store" } });
    }
    // Validate the actual D1 result, never a successful HTTP call or a stale
    // form echo. In particular, an unpersisted Perex must never say "Uložené".
    const cleanText = (value: unknown) => typeof value === "string"
      ? value.replace(/\r\n?/g, "\n").trim() : "";
    const mismatchedText = (["excerpt", "description"] as const).filter(field =>
      (fullProfileSave || editedPaths?.includes(field)) &&
      cleanText(saved[field]) !== cleanText(submittedBody[field]),
    );
    if (mismatchedText.length) {
      console.warn("DIRECTORY_TEXT_D1_SAVE_NOT_CONFIRMED", id, mismatchedText);
      return Response.json({
        error: "Text profilu sa po uložení v databáze nepotvrdil (" +
          mismatchedText.join(", ") + "). Obnov profil a skontroluj hodnotu.",
      }, { status: 409, headers: { "cache-control": "no-store" } });
    }
    // Salons and every other Directory category use the same contract:
    // a successful save must be backed by all expressly edited D1 fields,
    // not just Perex and Popis. Verify after Notion and metadata side-effects.
    // Every user-edited text field must be retained, including deliberately
    // malformed contact strings. Do not exempt fields from D1 verification.
    const unconfirmedEditorial = directoryEditedFieldMismatches({
      // Check against the user's actual form values, not a preservation-layer
      // payload that may have silently reverted the edited Perex/Popis.
      submitted: {
        ...payload,
        excerpt: submittedBody.excerpt,
        description: submittedBody.description,
      },
      persisted: saved, editedPaths: fullProfileSave
        ? (Object.keys(BREEDER_NOTION_EDITORIAL_FIELDS) as BreederEditorialField[])
        : editedPaths ?? [],
    });
    const unconfirmedTrust = (fullProfileSave ? [...TRAINER_TRUST_FIELDS] : trainerTrustEditedPaths).filter(field =>
      Boolean(saved[field]) !== Boolean(payload[field]),
    );
    if (unconfirmedEditorial.length || unconfirmedTrust.length) {
      const fields = [...unconfirmedEditorial, ...unconfirmedTrust];
      console.warn("DIRECTORY_FIELDS_D1_SAVE_NOT_CONFIRMED", id, fields, {
        contactMismatchesBeforeNotion,
        contactMismatchAfterNotion: unconfirmedEditorial.filter(
          path => (DIRECTORY_CONTACT_EDITORIAL_PATHS as readonly string[]).includes(path),
        ),
      });
      return Response.json({
        error: "Niektoré upravené polia sa v Admine neuložili (" +
          fields.join(", ") + "). Obnov profil a zopakuj konkrétnu úpravu.",
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
      const previousTime = Date.parse(typed.expectedUpdatedAt);
      const now = new Date(Math.max(Date.now(), Number.isFinite(previousTime) ? previousTime + 1 : 0)).toISOString();
      const statement = db.prepare(`UPDATE directory_profiles
        SET name=?1,excerpt=?2,updated_at=?3,updated_by=?4
        WHERE id=?5 AND updated_at=?6 AND status IN ('draft','published')
        RETURNING id`).bind(name, excerpt, now, user.email, id, typed.expectedUpdatedAt);
      const unified = (env as unknown as { NOTION_UNIFIED_FIELD_SYNC_ENABLED?: string }).NOTION_UNIFIED_FIELD_SYNC_ENABLED === "true";
      const receipt = unified ? planDirectoryAdminReceipts(db, {
        id, expectedRevision: typed.expectedUpdatedAt, nextRevision: now, editor: user.email,
        fields: ["name", "excerpt"],
      }) : { before: [], after: [] };
      const updated = receipt.before.length
        ? (await db.batch<{ id: number }>([...receipt.before, statement, ...receipt.after]))[receipt.before.length]?.results?.[0]
        : await statement.first<{ id: number }>();
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
      const row = await db.prepare("SELECT category,status,updated_at FROM directory_profiles WHERE id=?1 LIMIT 1")
        .bind(id).first<{ category: string; status: string; updated_at: string }>();
      if (!row) return Response.json({ error: "Profil sa nenašiel." }, { status: 404 });
      if (row.status === "archived") return Response.json({ error: "Archivovaný profil nie je možné upravovať." }, { status: 409 });
      if (row.category !== requested.category) {
        return Response.json({ error: "Kategória profilu sa zmenila. Obnovte stránku." }, { status: 409 });
      }
      // Validate only the explicitly changed filter IDs. No old JSON is read,
      // compared, or rewritten: SQL rows own the category filter choices.
      const requestedValues = requested.updates as Record<string, unknown>;
      const normalizedValues: Record<string, string | null> = {};
      for (const [filterId, value] of Object.entries(requestedValues)) {
        const definition = getDirectoryFilterDefinition(filterId);
        if (!definition || definition.category !== row.category) {
          return Response.json({ error: "Neplatný filter kategórie: " + filterId }, { status: 400 });
        }
        if (value === null) {
          normalizedValues[filterId] = null;
        } else {
          const normalized = normalizeDirectoryFilterValue(definition, value);
          if (normalized.status !== "known")
            return Response.json({ error: "Neplatná hodnota filtra: " + filterId }, { status: 400 });
          normalizedValues[filterId] = normalized.value;
        }
      }
      if (Object.keys(normalizedValues).length) {
        const previousTime = Date.parse(row.updated_at);
        const now = new Date(Math.max(Date.now(), Number.isFinite(previousTime) ? previousTime + 1 : 0)).toISOString();
        const canonical = db.prepare(`UPDATE directory_profiles
          SET updated_at=?1,updated_by=?2
          WHERE id=?3 AND category=?4 AND updated_at=?5 AND status<>'archived' RETURNING id`)
          .bind(now, user.email, id, row.category, row.updated_at);
        const mirror = planDirectory0170FilterSqlMirror({
          profileId: id, category: row.category as ServiceFilterCategory,
          values: normalizedValues,
          updatedAt: now, actor: user.email,
        });
        // The revision CAS and only the changed filter rows commit together.
        const receipt = (env as unknown as { NOTION_UNIFIED_FIELD_SYNC_ENABLED?: string }).NOTION_UNIFIED_FIELD_SYNC_ENABLED === "true"
          ? planDirectoryAdminReceipts(db, { id, expectedRevision: row.updated_at, nextRevision: now,
              editor: user.email, fields: [], structured: Object.keys(normalizedValues).map(field => directoryFacetReceiptField(row.category, field)) })
          : { before: [], after: [] };
        const results = await db.batch([
          ...receipt.before, canonical, ...mirror.map(item=>db.prepare(item.sql).bind(...item.bindings)),
          ...receipt.after,
        ]);
        if (!(results[receipt.before.length]?.results?.[0] as {id?:number}|undefined)?.id)
          return Response.json({ error: "Údaje profilu sa medzičasom zmenili. Obnovte stránku." }, { status: 409 });
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
      // Confirm only the just-saved SQL values; an explicit "unknown" remains
      // a real choice, while null means that single SQL row was deleted.
      const committed = await db.prepare(
        "SELECT category,status FROM directory_profiles WHERE id=?1 LIMIT 1",
      ).bind(id).first<{ category: string; status: string }>();
      const filterRows = await db.prepare(
        "SELECT filter_id,value_text FROM directory_profile_filter_values WHERE profile_id=? AND category=?",
      ).bind(id, requested.category).all<{ filter_id: string; value_text: string }>();
      const saved = new Map(filterRows.results.map(row => [row.filter_id,row.value_text]));
      const unconfirmed = Object.entries(normalizedValues).flatMap(([filterId, expected]) =>
        (saved.get(filterId) ?? null) === expected ? [] : [filterId],
      );
      if (!committed || committed.status === "archived" ||
          committed.category !== requested.category || unconfirmed.length) {
        console.warn("DIRECTORY_CATEGORY_FILTERS_D1_NOT_CONFIRMED", id, unconfirmed);
        return Response.json({
          error: "Kategóriové filtre sa v D1 nepotvrdili (" +
            (unconfirmed.join(", ") || "kategória") + "). Obnovte profil a skúste znova.",
        }, { status: 409, headers: { "cache-control": "no-store" } });
      }
      const confirmedProfile = await getManagedDirectoryProfileById(id, db);
      if (!confirmedProfile) return Response.json({
        error: "Profil po zápise kategóriových filtrov nie je dostupný.",
      }, { status: 409, headers: { "cache-control": "no-store" } });
      return Response.json({ profile: confirmedProfile, notionFieldSync },
        { headers: { "cache-control": "no-store" } });
    }
    if (body.action === "set-reviewed") {
      if (typeof body.reviewed !== "boolean") {
        return Response.json({ error: "Stav kontroly musí byť true alebo false." }, { status: 400 });
      }
      const database = (env as unknown as { DB?: D1Database }).DB;
      if (!database) {
        return Response.json({ error: "Databáza nie je dostupná." }, { status: 503 });
      }
      // A previously reviewed profile stays SQL-locked on uncheck. Only a
      // verified current D1 -> mapped Notion full export can clear pending.
      const profile = await setManagedDirectoryProfileReviewed(
        id, body.reviewed, user.email, new Date(), database,
      );
      if (!profile) {
        return Response.json({ error: "Profil sa nenašiel." }, { status: 404 });
      }

      let notionReviewSync: DirectoryReviewSyncResult | "pending" = "disabled";
      const state = !body.reviewed ? await database.prepare(
        "SELECT unlock_pending FROM directory_profile_review_state WHERE profile_id=?",
      ).bind(id).first<{ unlock_pending: number }>() : null;
      try {
        if (!body.reviewed && Number(state?.unlock_pending) === 1) {
          const unlock = await completeDirectoryReviewedOwnerUnlock({
            database,
            bindings: env as Parameters<typeof completeDirectoryReviewedOwnerUnlock>[0]["bindings"],
            profileId: id,
          });
          notionReviewSync = unlock === "unlocked" ? "pushed" : "pending";
        } else {
          // Checked profiles mirror ONLY the checkbox while editorial data
          // remains locked. Never let a Notion failure undo a D1 review.
          notionReviewSync = await syncDirectoryReviewedWithNotion({
            database,
            bindings: env as Parameters<typeof syncDirectoryReviewedWithNotion>[0]["bindings"],
            profileId: id,
          });
        }
      } catch (error) {
        notionReviewSync = "pending";
        console.warn("DIRECTORY_REVIEW_NOTION_WRITEBACK_PENDING", id,
          error instanceof Error ? error.message : String(error));
      }
      const confirmed = await getManagedDirectoryProfileById(id, database);
      return Response.json({ profile: confirmed ?? profile, notionReviewSync });
    }
    if (body.action !== "restore") return Response.json({ error: "Nepodporovaná lifecycle akcia." }, { status: 400 });
    const profile = await restoreManagedDirectoryProfile(id, user.email);
    return profile ? Response.json({ profile }) : Response.json({ error: "Profil sa nenašiel." }, { status: 404 });
  } catch (error) {
    if (error instanceof Error && error.message === "DIRECTORY_PARTNER_MANAGED_REVIEW_LOCK") {
      return Response.json({
        error: "Tento profil spravuje partner. Notion synchronizáciu možno odomknúť až po odobratí jeho prístupu.",
      }, { status: 409, headers: { "cache-control": "no-store" } });
    }
    return Response.json({ error: error instanceof Error ? error.message : "Profil sa nepodarilo obnoviť." }, { status: 400 });
  }
}
