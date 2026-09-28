export const AUTOMATION_SOURCE_HTTP_USER_AGENT = "PsipediaDataResearch/1.0 (+https://psipedia.sk)";
export const AUTOMATION_SOURCE_MAX_REDIRECT_HOPS = 3;

export function automationSourceRequestTimeoutMs(value: number | null | undefined) {
  const timeout = Number(value);
  if (!Number.isFinite(timeout)) return 8000;
  return Math.max(1000, Math.min(30_000, Math.floor(timeout)));
}
