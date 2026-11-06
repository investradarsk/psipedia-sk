/**
 * Keep a public lost/found report reference when the user opens the generic
 * contact page, but never let arbitrary query text define a mail subject.
 */
export function contactRelaySubject(value: string | string[] | undefined): string | null {
  const topic = (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
  if (!/^Hlásenie [1-9]\d{0,11}: (?:STRATENÝ PES|NÁJDENÝ PES)$/.test(topic)) {
    return null;
  }
  return `${topic} – Psipedia.sk`;
}
