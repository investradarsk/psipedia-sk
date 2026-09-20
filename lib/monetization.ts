export const AD_LABEL = "Reklama" as const;
export const SPONSORED_LABEL = "Sponzorované" as const;

export const AD_PLACEMENTS = {
  HOME_AFTER_HERO: { id: "home_after_hero", label: "Domov – po hero", public: false },
  HOME_BOTTOM: { id: "home_bottom", label: "Domov – spodný slot", public: true },
  ARTICLE_INLINE_1: { id: "article_inline_1", label: "Článok – inline 1", public: false },
  ARTICLE_END: { id: "article_end", label: "Článok – koniec", public: true },
  DIRECTORY_LIST: { id: "directory_list", label: "Adresár – zoznam", public: false },
  EVENTS_LIST: { id: "events_list", label: "Podujatia – zoznam", public: false },
  HELP_LIST: { id: "help_list", label: "Pomoc psom – zoznam", public: false },
  GLOBAL_BOTTOM: { id: "global_bottom", label: "Globálny spodný slot", public: false },
} as const;

export type AdPlacementId = (typeof AD_PLACEMENTS)[keyof typeof AD_PLACEMENTS]["id"];
export type MonetizationStatus = "draft" | "active" | "paused" | "archived";
export type MonetizationEventType = "impression" | "click";
export const PROMOTABLE_ENTITY_TYPES = ["directory", "event", "help", "organization", "breed", "adoption"] as const;
export type PromotableEntityType = (typeof PROMOTABLE_ENTITY_TYPES)[number];
export type ConsentChoice = "necessary" | "analytics" | "advertising";

export type CampaignWindow = {
  status: MonetizationStatus;
  startAt?: string | null;
  endAt?: string | null;
};

export type PromotionWindow = CampaignWindow & {
  entityPublic: boolean;
  label?: string | null;
};

export function isPromotableEntityType(value: string): value is PromotableEntityType {
  return (PROMOTABLE_ENTITY_TYPES as readonly string[]).includes(value);
}

export function isKnownPlacement(value: string): value is AdPlacementId {
  return Object.values(AD_PLACEMENTS).some((placement) => placement.id === value);
}

export function isSafeDestinationUrl(value: string) {
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:")
      && !url.username
      && !url.password;
  } catch {
    return false;
  }
}

export function assertSafeDestinationUrl(value: string) {
  if (!isSafeDestinationUrl(value)) throw new Error("Cieľová URL musí používať http alebo https.");
  return new URL(value).toString();
}

export function isSafeCreativeAsset(value?: string | null) {
  if (!value || value.includes("\\") || value.includes("?") || value.includes("#")) return false;
  if (!(value.startsWith("/media/") || value.startsWith("/images/"))) return false;
  return !value.split("/").some((segment) => segment === ".." || segment === ".");
}

export function isCampaignActive(campaign: CampaignWindow, now = new Date()) {
  if (campaign.status !== "active") return false;
  const timestamp = now.getTime();
  if (campaign.startAt && Date.parse(campaign.startAt) > timestamp) return false;
  if (campaign.endAt && Date.parse(campaign.endAt) <= timestamp) return false;
  return true;
}

export function isPromotionVisible(promotion: PromotionWindow, now = new Date()) {
  return promotion.entityPublic
    && (promotion.label ?? SPONSORED_LABEL) === SPONSORED_LABEL
    && isCampaignActive(promotion, now);
}

export function normalizePriority(value: unknown) {
  const number = typeof value === "number" ? value : Number.parseInt(String(value ?? "0"), 10);
  if (!Number.isFinite(number)) return 0;
  return Math.max(-100, Math.min(100, Math.trunc(number)));
}

export function normalizeDateTime(value: unknown) {
  if (!value) return null;
  const timestamp = Date.parse(String(value));
  if (!Number.isFinite(timestamp)) throw new Error("Dátum alebo čas nie je platný.");
  return new Date(timestamp).toISOString();
}

export function assertValidWindow(startAt: string | null, endAt: string | null) {
  if (startAt && endAt && Date.parse(endAt) <= Date.parse(startAt)) {
    throw new Error("Koniec kampane musí byť neskôr ako začiatok.");
  }
}

export function isValidGooglePublisherClientId(value: string) {
  return /^ca-pub-\d{10,30}$/.test(value.trim());
}

export function canLoadProgrammaticAds(
  config: { enabled: boolean; clientId: string },
  consent: ConsentChoice | null,
) {
  return config.enabled
    && isValidGooglePublisherClientId(config.clientId)
    && consent === "advertising";
}

export function validateMonetizationEventInput(value: unknown) {
  if (!value || typeof value !== "object") throw new Error("Neplatná tracking udalosť.");
  const data = value as Record<string, unknown>;
  const eventType = data.eventType;
  const campaignId = typeof data.campaignId === "string" ? data.campaignId.trim() : "";
  const placementId = typeof data.placementId === "string" ? data.placementId.trim() : "";
  const eventKey = typeof data.eventKey === "string" ? data.eventKey.trim() : "";
  if (eventType !== "impression" && eventType !== "click") throw new Error("Neplatný typ tracking udalosti.");
  if (!campaignId || campaignId.length > 80) throw new Error("Neplatná kampaň.");
  if (!isKnownPlacement(placementId)) throw new Error("Neplatný placement.");
  if (!/^[a-zA-Z0-9_-]{16,100}$/.test(eventKey)) throw new Error("Neplatný tracking kľúč.");
  return { eventType, campaignId, placementId, eventKey } as const;
}
