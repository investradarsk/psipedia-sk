/** Pure Google Places address preview. Never confirms a Place, changes GEO, or persists data. */
import {
  addressFields, googlePlaceConfirmationState, planInternalAddressPatch, validateInternalAddress,
  type AddressConflict, type AddressField, type AddressPatch, type AddressValidation,
  type InternalAddress, type InternalAddressSnapshot,
} from "@/lib/admin-address-contract";
import { adaptGoogleAddressProposal } from "@/lib/admin-address-adapters";
import { directoryAddressTextSemanticallyEqual, normalizeSlovakPostalCode } from "@/lib/directory-service-address";
import type { GooglePlaceCandidate, GooglePlaceStructuredAddress } from "@/lib/google-place-matching";

export type GoogleAddressPreviewIntent = "MISSING_ONLY" | "ADMIN_RECONFIRM";
export type GoogleAddressOrganizationBinding = {
  organizationId: number;
  locationId: number;
  role: "SITE" | "LEGAL_SEAT" | "SERVICE_AREA" | "UNSPECIFIED";
};
export type GoogleAddressPreviewInput = {
  snapshot: InternalAddressSnapshot;
  candidate: GooglePlaceCandidate | Partial<GooglePlaceStructuredAddress>;
  intent?: GoogleAddressPreviewIntent;
  expectedRevision?: string | null;
  /** The authoritative, server-fetched organization/location association, never Google data. */
  organization?: GoogleAddressOrganizationBinding;
};
export type GoogleAddressPreviewConflictCode =
  | AddressConflict["code"]
  | "INVALID_GOOGLE_CANDIDATE" | "INVALID_TARGET" | "ORGANIZATION_ROLE_REVIEW"
  | "ONLINE_EVENT" | "MIXED_ADDRESS_REVIEW" | "GOOGLE_ANCHOR_CHANGE"
  | "INCOMPLETE_ADDRESS" | "GOOGLE_PLACE_SELECTION_REQUIRED";
export type GoogleAddressPreviewConflict = {
  code: GoogleAddressPreviewConflictCode;
  fields: AddressField[];
  reason: string;
};
export type GoogleAddressFieldDiff = {
  field: AddressField;
  before: InternalAddress[AddressField];
  after: InternalAddress[AddressField];
};
export type GoogleAddressPreviewResult = {
  target: InternalAddressSnapshot["target"];
  intent: GoogleAddressPreviewIntent;
  currentAddress: InternalAddress;
  proposedAddress: InternalAddress;
  changes: GoogleAddressFieldDiff[];
  unchangedFields: AddressField[];
  missingGoogleComponents: (keyof GooglePlaceStructuredAddress)[];
  validation: AddressValidation;
  googleConfirmation: ReturnType<typeof googlePlaceConfirmationState>;
  candidatePlaceId: string | null;
  conflicts: GoogleAddressPreviewConflict[];
  reviewReasons: string[];
  requiresReview: boolean;
  requiresExplicitGoogleConfirmation: boolean;
  readyForAuthorization: boolean;
};

const googleComponentFields = [
  "region", "district", "locality", "sublocality", "postalCode", "street",
  "houseNumber", "countryCode",
] as const satisfies readonly (keyof GooglePlaceStructuredAddress)[];
const knownComponents = new Set<string>(googleComponentFields);

const conflictReasons: Record<AddressConflict["code"], string> = {
  INVALID_PATCH: "Google návrh obsahuje neplatné polia alebo typy.",
  INVALID_ADDRESS: "Navrhovaná kombinácia adresných polí nie je platná.",
  GOOGLE_PLACE_LOCKED: "Existujúce Google miesto (aktuálne aj neaktuálne) chráni adresu.",
  MANUAL_GEO_LOCKED: "Manuálny GEO override vyžaduje osobitný postup.",
  PRIVATE_LOCATION_LOCKED: "Neverejná poloha sa nesmie automaticky zmeniť.",
  CONFIRMED_ADDRESS_LOCKED: "Potvrdená prevádzka sa nesmie automaticky prepísať.",
  EXISTING_VALUE: "Návrh by prepísal existujúci údaj; missing-only to nepovoľuje.",
  REVISION_CONFLICT: "Adresný snapshot má inú revíziu; načítaj ho znova.",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function present(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
function equivalent(field: AddressField, left: InternalAddress[AddressField], right: InternalAddress[AddressField]) {
  if (left === right) return true;
  if (field === "postalCode") {
    return normalizeSlovakPostalCode(left) === normalizeSlovakPostalCode(right);
  }
  return directoryAddressTextSemanticallyEqual(left, right);
}
function readCandidate(value: unknown):
  | { components: Partial<GooglePlaceStructuredAddress>; formatted: string | undefined; placeId: string | null }
  | null {
  if (!isRecord(value)) return null;
  const isPlace = Object.hasOwn(value, "id") || Object.hasOwn(value, "address") || Object.hasOwn(value, "formattedAddress");
  let components: Record<string, unknown>;
  let formatted: string | undefined;
  let placeId: string | null = null;
  if (isPlace) {
    if (!present(value.id) || !present(value.formattedAddress) || !isRecord(value.address)
      || typeof value.latitude !== "number" || !Number.isFinite(value.latitude)
      || typeof value.longitude !== "number" || !Number.isFinite(value.longitude)
      || value.latitude < -90 || value.latitude > 90 || value.longitude < -180 || value.longitude > 180) return null;
    placeId = value.id.trim();
    formatted = value.formattedAddress;
    components = value.address;
  } else {
    components = value;
    if (Object.keys(components).some((key) => !knownComponents.has(key))) return null;
  }
  if (Object.entries(components).some(([key, v]) =>
    !knownComponents.has(key) || (v !== undefined && v !== null && typeof v !== "string"))) return null;
  if (!googleComponentFields.some((field) => present(components[field]))) return null;
  return { components: components as Partial<GooglePlaceStructuredAddress>, formatted, placeId };
}

/** This is a diagnostic and *not* an authorization token for a write or a Google confirmation. */
export function previewGoogleAddressChange(input: GoogleAddressPreviewInput): GoogleAddressPreviewResult {
  const snapshot = input?.snapshot;
  if (!snapshot || !isRecord(snapshot.address) || !isRecord(snapshot.geo) || !isRecord(snapshot.target)) {
    throw new TypeError("Valid server-side address snapshot required.");
  }
  const intent = input.intent ?? "MISSING_ONLY";
  const currentAddress = { ...snapshot.address };
  const googleConfirmation = googlePlaceConfirmationState(snapshot.geo);
  const conflicts: GoogleAddressPreviewConflict[] = [];
  const add = (code: GoogleAddressPreviewConflictCode, reason: string, fields: AddressField[] = []) => {
    if (!conflicts.some((item) => item.code === code && item.reason === reason)) {
      conflicts.push({ code, fields, reason });
    }
  };
  const selected = readCandidate(input.candidate);
  if (!selected) add("INVALID_GOOGLE_CANDIDATE", "Chýbajú štruktúrované Google údaje alebo majú neplatný typ.");

  if (!["DIRECTORY_PROFILE", "MANAGED_EVENT", "ORGANIZATION_LOCATION"].includes(snapshot.target.type)
    || !Number.isSafeInteger(snapshot.target.id) || snapshot.target.id <= 0
    || (intent !== "MISSING_ONLY" && intent !== "ADMIN_RECONFIRM")) {
    add("INVALID_TARGET", "Neplatný cieľ alebo typ požadovanej operácie.");
  }
  if (snapshot.target.type === "MANAGED_EVENT" && snapshot.address.mode === "ONLINE") {
    add("ONLINE_EVENT", "Online podujatie nemôže dostať fyzickú Google adresu.");
  }
  if (snapshot.target.type === "ORGANIZATION_LOCATION") {
    const org = input.organization;
    if (!org || !Number.isSafeInteger(org.organizationId) || !Number.isSafeInteger(org.locationId)
      || org.organizationId <= 0 || org.locationId <= 0
      || org.organizationId !== snapshot.target.organizationId || org.locationId !== snapshot.target.id
      || !["SITE", "LEGAL_SEAT", "SERVICE_AREA", "UNSPECIFIED"].includes(org.role)) {
      add("INVALID_TARGET", "Chýba záväzné prepojenie existujúcej lokality s organizáciou.");
    } else if (org.role !== "SITE") {
      add("ORGANIZATION_ROLE_REVIEW", "Rola lokality " + org.role + " sa nesmie automaticky zmeniť na verejnú prevádzku.");
    }
  }

  const components = selected?.components ?? {};
  const missingGoogleComponents = googleComponentFields.filter((field) => !present(components[field]));
  const adapted = selected ? adaptGoogleAddressProposal(components, selected.formatted) : null;
  const patch: AddressPatch = adapted ? { ...adapted.fields } : {};
  // Google does not supply this enum: derive only when the current field is genuinely absent.
  if (!currentAddress.addressFormat && !patch.addressFormat && selected) {
    if (present(components.street)) patch.addressFormat = "STREET";
    else if (present(components.houseNumber) && !currentAddress.street) patch.addressFormat = "MUNICIPALITY_NUMBER";
  }
  const rawProposal: InternalAddress = { ...currentAddress, ...patch };
  const validation = validateInternalAddress(rawProposal);
  const changes: GoogleAddressFieldDiff[] = [];
  for (const field of addressFields) {
    if (!Object.hasOwn(patch, field)) continue;
    const before = currentAddress[field];
    const after = validation.issues.some((issue) => issue.field === field)
      ? rawProposal[field] : validation.address[field];
    if (!equivalent(field, before, after)) changes.push({ field, before, after });
  }
  const unchangedFields = addressFields.filter((field) => !changes.some((change) => change.field === field));
  const plan = planInternalAddressPatch(snapshot, patch, {
    missingOnly: intent === "MISSING_ONLY",
    expectedRevision: input.expectedRevision,
  });
  for (const conflict of plan.conflicts) add(conflict.code, conflictReasons[conflict.code],
    conflict.fields.filter((field): field is AddressField => (addressFields as readonly string[]).includes(field)));
  if (validation.issues.length) {
    add("INVALID_ADDRESS", "Over slovenskú hierarchiu, PSČ, formát a typy navrhovaných údajov.",
      [...new Set(validation.issues.map((issue) => issue.field))]);
  }

  // Do not create a deceptively plausible new locality with old street/house/postcode.
  const replaced = new Set(changes.map((change) => change.field));
  const localityChanged = ["region", "district", "city"].some((field) => replaced.has(field as AddressField));
  const retainedPhysical = (["postalCode", "street", "houseNumber"] as const).filter((field) =>
    localityChanged && present(currentAddress[field]) && !present(components[field]));
  const oldNumberWithNewStreet = replaced.has("street") && present(currentAddress.houseNumber) && !present(components.houseNumber);
  if (retainedPhysical.length || oldNumberWithNewStreet) {
    add("MIXED_ADDRESS_REVIEW", "Nové Google údaje by sa spojili so starými údajmi iného miesta.",
      [...retainedPhysical, ...(oldNumberWithNewStreet ? ["street", "houseNumber"] as AddressField[] : [])]);
  }
  if (snapshot.geo.googlePlaceId?.trim() && selected?.placeId
    && snapshot.geo.googlePlaceId.trim() !== selected.placeId) {
    add("GOOGLE_ANCHOR_CHANGE", "Zmenu existujúceho Google Place ID musí posúdiť samostatný autorizačný postup.");
  }
  if (validation.completeness !== "COMPLETE") {
    add("INCOMPLETE_ADDRESS", "Výsledná adresa nie je úplná a validovaná; vyžaduje kontrolu.");
  }
  if (selected && !selected.placeId) {
    add("GOOGLE_PLACE_SELECTION_REQUIRED", "Štruktúrované komponenty bez Place ID nestačia na potvrdenie Google miesta.");
  }
  // A no-op is harmless but is not an automatic confirmation. Only intentional re-confirm may proceed.
  const requiresReview = conflicts.length > 0;
  const readyForAuthorization = Boolean(selected?.placeId) && plan.allowed && !requiresReview
    && (changes.length > 0 || intent === "ADMIN_RECONFIRM");
  return {
    target: { ...snapshot.target }, intent, currentAddress,
    proposedAddress: { ...rawProposal },
    changes, unchangedFields, missingGoogleComponents,
    validation, googleConfirmation, candidatePlaceId: selected?.placeId ?? null,
    conflicts, reviewReasons: conflicts.map((conflict) => conflict.reason),
    requiresReview, requiresExplicitGoogleConfirmation: Boolean(selected?.placeId),
    readyForAuthorization,
  };
}
