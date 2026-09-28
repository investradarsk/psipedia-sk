import { env } from "cloudflare:workers";

type PartnerPublicBindings = {
  TURNSTILE_SITE_KEY?: string;
};

export function getPartnerTurnstileSiteKey() {
  return (env as unknown as PartnerPublicBindings).TURNSTILE_SITE_KEY?.trim() ?? "";
}
