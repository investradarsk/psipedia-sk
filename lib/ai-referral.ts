export const AI_REFERRAL_HOSTNAMES = {
  chatgpt: ["chatgpt.com", "chat.openai.com"],
  claude: ["claude.ai"],
  gemini: ["gemini.google.com"],
  microsoft_copilot: ["copilot.microsoft.com"],
  perplexity: ["perplexity.ai"],
} as const;

export type AiReferralSource = keyof typeof AI_REFERRAL_HOSTNAMES;

function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/\.+$/, "");
}

function matchesHostname(hostname: string, expectedHostname: string): boolean {
  return hostname === expectedHostname || hostname.endsWith(`.${expectedHostname}`);
}

export function classifyAiReferralHostname(hostname: string | null | undefined): AiReferralSource | null {
  if (!hostname) return null;

  const normalized = normalizeHostname(hostname);
  if (!normalized) return null;

  for (const [source, hostnames] of Object.entries(AI_REFERRAL_HOSTNAMES) as Array<
    [AiReferralSource, readonly string[]]
  >) {
    if (hostnames.some((expectedHostname) => matchesHostname(normalized, expectedHostname))) {
      return source;
    }
  }

  return null;
}

export function classifyAiReferralReferrer(referrer: string | null | undefined): AiReferralSource | null {
  if (!referrer?.trim()) return null;

  try {
    const url = new URL(referrer);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return classifyAiReferralHostname(url.hostname);
  } catch {
    return null;
  }
}
