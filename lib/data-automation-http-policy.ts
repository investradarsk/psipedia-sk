export const AUTOMATION_SOURCE_HTTP_USER_AGENT = "PsipediaDataResearch/1.0 (+https://psipedia.sk)";
// RFC 9309 §2.3.1.2 recommends following at least five consecutive robots.txt redirects.
// The controlled source connector shares the same bounded transport policy for parity.
export const AUTOMATION_SOURCE_MAX_REDIRECT_HOPS = 5;
export const AUTOMATION_SOURCE_MAX_BYTES = 1_000_000;

export function automationSourceRequestTimeoutMs(value: number | null | undefined) {
  const timeout = Number(value);
  if (!Number.isFinite(timeout)) return 8000;
  return Math.max(1000, Math.min(30_000, Math.floor(timeout)));
}
