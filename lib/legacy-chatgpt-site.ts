import { SITE_URL } from "../config/public-site.ts";

export const LEGACY_CHATGPT_SITE_HOST = "psipedia-sk.martin-zabrans18967.chatgpt.site";

export function legacyChatgptSiteRedirectUrl(requestUrl: URL): URL | null {
  if (requestUrl.hostname !== LEGACY_CHATGPT_SITE_HOST) return null;
  return new URL(`${requestUrl.pathname}${requestUrl.search}`, SITE_URL);
}
