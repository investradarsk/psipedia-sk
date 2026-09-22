const KNOWN_PLACEHOLDER_PATTERNS = [
  /^test(?:test|ing)?$/i,
  /^asdf/i,
  /^qwerty/i,
  /^lorem(?:ipsum)?$/i,
  /^xxx+$/i,
];

export function isSuspiciousPlaceholderText(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return false;
  if (KNOWN_PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(text))) return true;

  const compact = text.toLocaleLowerCase("sk-SK").replace(/[^a-z0-9]/g, "");
  if (compact.length >= 8 && new Set(compact).size <= 3) return true;
  return false;
}

export function isSuspiciousNumericText(value: unknown) {
  const text = String(value ?? "").trim();
  return /^\d{5,}$/.test(text);
}

export function publicRecordIntegrityIssues(input: {
  name?: unknown;
  title?: unknown;
  slug?: unknown;
}) {
  const issues: string[] = [];
  const label = String(input.name ?? input.title ?? "").trim();
  const slug = String(input.slug ?? "").trim();

  if (!label) issues.push("missing_public_name");
  if (!slug) issues.push("missing_public_slug");
  else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) issues.push("invalid_public_slug");
  if (isSuspiciousPlaceholderText(label)) issues.push("suspicious_public_name");

  return issues;
}


export function cleanPublicOrganizationCopy(value: string) {
  return value
    .split(/\n\s*\n/u)
    .map((paragraph) => paragraph
      .split(/(?<=[.!?])\s+/u)
      .filter((sentence) => {
        const publicCopyLower = sentence.toLocaleLowerCase("sk");
        const mentionsLegacyRecord = /(starší|pôvodný)/u.test(publicCopyLower)
          && /(profil|riadok|záznam)/u.test(publicCopyLower);
        const mentionsMergeHistory = /(zlúčen|spojen|nepublikoval dvakrát|publikoval dvakrát|duplicit)/u.test(publicCopyLower);
        return !(mentionsLegacyRecord && mentionsMergeHistory);
      })
      .join(" ")
      .trim())
    .filter(Boolean)
    .join("\n\n");
}
