import { cache } from "react";
import { getPartnerSession } from "@/lib/partner-auth";

/**
 * One verified partner identity lookup per React server request. Never keep
 * tokens or identities in module-global caches, Worker Cache API or client
 * storage: expired/revoked sessions must be checked on the next request.
 */
export const getPublicPartnerSession = cache(async (token: string) =>
  getPartnerSession({ token }),
);
