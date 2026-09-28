import { env } from "cloudflare:workers";
import {
  verifyAutomationAddressReviewSelection,
  type DirectoryAddressReviewCandidate,
} from "./directory-address-provider.ts";
import { GeocoderProviderError, type GeocoderProvider } from "./geo-provider.ts";
import {
  buildManagedDirectoryProfileUpdateStatement,
  getManagedDirectoryProfileById,
} from "./directory-store.ts";
import { withVerifiedDirectoryAddress } from "./directory-address-save.ts";
import {
  buildResolveAutomationAddressReviewStatement,
  getAutomationAddressReviewCase,
  markAutomationAddressReviewStale,
  type StoredAutomationAddressReviewCandidate,
} from "./data-automation-address-review-store.ts";
import {
  applyGeocoderResolution,
  buildDirectoryGeoInvalidationForAddressReviewStatement,
  getGeoPointForTarget,
  reconcileGeoAfterSourceMutation,
  setGeoVisibility,
} from "./geo-store.ts";

type RuntimeBindings = { DB?: D1Database };

export class AutomationAddressReviewError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "AutomationAddressReviewError";
    this.status = status;
  }
}

function database(input?: D1Database) {
  if (input?.prepare) return input;
  const bound = (env as unknown as RuntimeBindings).DB;
  if (bound?.prepare) return bound;
  throw new AutomationAddressReviewError(503, "Databáza adresnej kontroly nie je dostupná.");
}

const SNAPSHOT_FIELDS = [
  "region",
  "district",
  "city",
  "address",
  "postalCode",
  "street",
  "houseNumber",
  "addressFormat",
  "serviceAddressConfirmation",
  "online",
] as const;

function profileAddressSnapshot(profile: {
  region: string;
  district: string;
  city: string;
  address: string;
  postalCode: string;
  street: string;
  houseNumber: string;
  addressFormat: string;
  serviceAddressConfirmation: string;
  online: boolean;
}) {
  return {
    region: profile.region,
    district: profile.district,
    city: profile.city,
    address: profile.address,
    postalCode: profile.postalCode,
    street: profile.street,
    houseNumber: profile.houseNumber,
    addressFormat: profile.addressFormat,
    serviceAddressConfirmation: profile.serviceAddressConfirmation,
    online: profile.online,
  };
}

function sameAddressSnapshot(
  before: Record<string, unknown>,
  current: ReturnType<typeof profileAddressSnapshot>,
) {
  return SNAPSHOT_FIELDS.every((field) => String(before[field] ?? "") === String(current[field] ?? ""));
}

function formattedVerifiedAddress(verified: {
  addressFormat: "STREET" | "MUNICIPALITY_NUMBER";
  street: string;
  houseNumber: string;
  city: string;
  postalCode: string;
}) {
  const firstLine = verified.addressFormat === "STREET"
    ? [verified.street, verified.houseNumber].filter(Boolean).join(" ")
    : [verified.city, verified.houseNumber].filter(Boolean).join(" ");
  return [firstLine, [verified.postalCode, verified.city].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
}

function selectedCandidate(
  candidates: StoredAutomationAddressReviewCandidate[],
  candidateHash: string,
): StoredAutomationAddressReviewCandidate | null {
  return candidates.find((candidate) => candidate.candidateHash === candidateHash) ?? null;
}

export async function resolveAutomationAddressReview(input: {
  id: number;
  candidateHash: string;
  actorRef: string;
  database?: D1Database;
  provider?: GeocoderProvider;
  now?: Date;
}) {
  const db = database(input.database);
  const review = await getAutomationAddressReviewCase(input.id, db);
  if (!review) throw new AutomationAddressReviewError(404, "Kontrola adresy sa nenašla.");
  if (review.status !== "OPEN") {
    throw new AutomationAddressReviewError(409, "Táto kontrola adresy už nie je otvorená.");
  }
  const candidate = selectedCandidate(review.candidates, input.candidateHash);
  if (!candidate) {
    throw new AutomationAddressReviewError(400, "Vybraná adresa už nie je medzi uloženými kandidátmi.");
  }

  const before = await getManagedDirectoryProfileById(review.canonicalEntityId, db);
  if (!before) {
    await markAutomationAddressReviewStale(review.id, db, input.now ?? new Date());
    throw new AutomationAddressReviewError(409, "Profil už neexistuje. Kontrola bola označená ako neaktuálna.");
  }
  if (!sameAddressSnapshot(review.canonicalBefore, profileAddressSnapshot(before))) {
    await markAutomationAddressReviewStale(review.id, db, input.now ?? new Date());
    throw new AutomationAddressReviewError(409, "Adresa profilu sa medzitým zmenila. Obnov kontrolu.");
  }
  if (before.online) {
    throw new AutomationAddressReviewError(409, "Online profil bez fyzickej prevádzky nemožno týmto spôsobom potvrdiť.");
  }

  const geoPoint = await getGeoPointForTarget("DIRECTORY_PROFILE", review.canonicalEntityId, db);
  if (geoPoint?.manualOverride) {
    throw new AutomationAddressReviewError(
      409,
      "Profil má manuálne nastavenú polohu. Najprv skontroluj mapové nastavenie.",
    );
  }

  let verified;
  try {
    verified = await verifyAutomationAddressReviewSelection({
      candidate: candidate as DirectoryAddressReviewCandidate,
      provider: input.provider,
    });
  } catch (error) {
    if (error instanceof GeocoderProviderError) {
      throw new AutomationAddressReviewError(
        503,
        "Adresu sa teraz nepodarilo znovu overiť. Skús to neskôr.",
      );
    }
    if (error instanceof Error && error.message === "automation_address_review_revalidation_changed") {
      await markAutomationAddressReviewStale(review.id, db, input.now ?? new Date());
      throw new AutomationAddressReviewError(
        409,
        "Ponúknutá adresa už providerom nie je potvrdená v rovnakej podobe. Obnov kontrolu.",
      );
    }
    throw new AutomationAddressReviewError(
      503,
      "Adresu sa teraz nepodarilo znovu overiť. Skús to neskôr.",
    );
  }

  const now = (input.now ?? new Date()).toISOString();
  const payload = withVerifiedDirectoryAddress({ ...before }, verified);
  payload.address = formattedVerifiedAddress(verified);

  const canonicalStatement = buildManagedDirectoryProfileUpdateStatement(
    db,
    review.canonicalEntityId,
    payload,
    input.actorRef,
    before,
    now,
    {
      expectedUpdatedAt: before.updatedAt,
      automationAddressReview: { id: review.id, fingerprint: review.fingerprint },
    },
  );
  const geoInvalidationStatement = buildDirectoryGeoInvalidationForAddressReviewStatement(
    review.canonicalEntityId,
    db,
    now,
  );
  const resolveStatement = buildResolveAutomationAddressReviewStatement({
    database: db,
    id: review.id,
    fingerprint: review.fingerprint,
    actorRef: input.actorRef,
    candidateHash: candidate.candidateHash,
    verifiedProvider: verified.providerResult.provider,
    canonicalUpdatedAt: now,
    now,
  });

  const batch = await db.batch([
    canonicalStatement,
    geoInvalidationStatement,
    resolveStatement,
  ]);
  const updated = (batch[0].results ?? []).length > 0;
  const resolved = Number(batch[2].meta?.changes ?? 0) > 0;
  if (!updated || !resolved) {
    await markAutomationAddressReviewStale(review.id, db, new Date(now));
    throw new AutomationAddressReviewError(
      409,
      "Adresa alebo kontrola sa medzitým zmenila. Obnov stránku a skontroluj aktuálny stav.",
    );
  }

  try {
    const reconciled = await reconcileGeoAfterSourceMutation({
      targetType: "DIRECTORY_PROFILE",
      targetId: review.canonicalEntityId,
      actorRef: input.actorRef,
      actorType: "ADMIN",
    }, db);
    let point = reconciled.point;
    if (!point) throw new Error("automation_address_review_geo_missing");
    if (point.manualOverride) {
      throw new Error("automation_address_review_manual_geo_after_apply");
    }
    if (point.publicVisibility !== "EXACT_PUBLIC" || point.publicPrecision !== "EXACT") {
      point = await setGeoVisibility({
        targetType: "DIRECTORY_PROFILE",
        targetId: review.canonicalEntityId,
        visibility: "EXACT_PUBLIC",
        precision: "EXACT",
        actorRef: input.actorRef,
        actorType: "ADMIN",
        reason: "AUTOMATION_ADDRESS_REVIEW_VERIFIED",
      }, db);
    }
    if (point.manualOverride) throw new Error("automation_address_review_manual_geo_after_apply");
    await applyGeocoderResolution({
      targetType: "DIRECTORY_PROFILE",
      targetId: review.canonicalEntityId,
      result: verified.providerResult,
      method: "GEOCODER",
    }, db);
  } catch (error) {
    console.error(JSON.stringify({
      event: "automation_address_review_geo_apply",
      reviewId: review.id,
      canonicalEntityId: review.canonicalEntityId,
      result: "deferred_safe_no_old_coordinates",
      error: error instanceof Error ? error.message : "unknown",
    }));
  }

  return {
    review: await getAutomationAddressReviewCase(review.id, db),
    canonicalEntityId: review.canonicalEntityId,
  };
}
