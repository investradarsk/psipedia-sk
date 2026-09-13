import type { HelpCase } from "@/lib/help";

const unavailableValue = /^(?:neoveren[eé]|nezisten[eé]|neuveden[eé]|nezn[aá]me|n\/a|nie je uveden[eé]|inform[aá]cia nie je k dispoz[ií]cii)$/i;
const negativeValue = /^(?:nie|nie je|nie sú|neposkytuje|neponúka)$/i;

const knownLabels = [
  "Prijímanie alebo záchrana psov",
  "Prijímanie a záchrana psov",
  "Dobrovoľnícka pomoc",
  "Materiálna pomoc",
  "Finančná pomoc",
  "Dočasná opatera",
  "Oblasť pôsobenia",
  "Posledná kontrola",
  "Typ organizácie",
  "Verejná adresa",
  "Prijímanie psov",
  "Dobrovoľníctvo",
  "Webstránka",
  "Instagram",
  "Facebook",
  "Telefón",
  "Telefon",
  "Mobil",
  "E-mail",
  "Email",
  "Adopcie",
  "Pokrytie",
  "Adresa",
  "Zdroj 1",
  "Zdroj 2",
  "Zdroj",
  "Web",
  "Popis",
] as const;

const labelAlternation = [...knownLabels]
  .sort((left, right) => right.length - left.length)
  .map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  .join("|");
const labelledValuePattern = new RegExp(`(?:^|\\s)(${labelAlternation}):\\s*`, "giu");

export type HelpPresentationField = { label: string; value: string };
export type HelpContact = { label: string; value: string; href: string | null; external?: boolean };

export function usefulHelpValue(value: string | null | undefined) {
  const clean = value?.trim().replace(/^[-–—]\s*/, "") || null;
  if (!clean || unavailableValue.test(clean)) return null;
  return clean;
}

function normalizedLabel(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

export function parseHelpLabelledText(value: string | null | undefined) {
  const text = value?.trim() ?? "";
  if (!text) return { fields: [] as HelpPresentationField[], remainder: "" };

  const matches = [...text.matchAll(labelledValuePattern)];
  if (!matches.length) return { fields: [] as HelpPresentationField[], remainder: text };

  const fields: HelpPresentationField[] = [];
  const prefix = text.slice(0, matches[0].index ?? 0).trim();
  for (const [index, match] of matches.entries()) {
    const start = (match.index ?? 0) + match[0].length;
    const end = index + 1 < matches.length ? (matches[index + 1].index ?? text.length) : text.length;
    const rawValue = text.slice(start, end).trim().replace(/[|;·]+$/, "").trim();
    const clean = usefulHelpValue(rawValue);
    if (clean) fields.push({ label: match[1].trim(), value: clean });
  }
  return { fields, remainder: prefix };
}

function fieldValue(fields: HelpPresentationField[], ...labels: string[]) {
  const targets = new Set(labels.map(normalizedLabel));
  return fields.find((field) => targets.has(normalizedLabel(field.label)))?.value ?? null;
}

function publicUrl(value: string | null | undefined) {
  const clean = usefulHelpValue(value);
  if (!clean) return null;
  const candidate = /^https?:\/\//i.test(clean) ? clean : /^[\w.-]+\.[a-z]{2,}(?:\/|$)/i.test(clean) ? `https://${clean}` : null;
  if (!candidate) return null;
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function contactFromField(label: string, value: string | null): HelpContact | null {
  const clean = usefulHelpValue(value);
  if (!clean) return null;
  const normalized = normalizedLabel(label);
  if (["telefon", "mobil"].includes(normalized)) {
    const hrefNumber = clean.replace(/[^+\d]/g, "");
    return hrefNumber.length >= 9 ? { label: "Telefón", value: clean, href: `tel:${hrefNumber}` } : null;
  }
  if (["e-mail", "email"].includes(normalized)) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean) ? { label: "E-mail", value: clean, href: `mailto:${clean}` } : null;
  }
  if (["web", "webstranka", "facebook", "instagram", "zdroj", "zdroj 1", "zdroj 2"].includes(normalized)) {
    const href = publicUrl(clean);
    if (!href) return null;
    const displayLabel = normalized.startsWith("zdroj") ? label : normalized === "webstranka" ? "Web" : label;
    return { label: displayLabel, value: clean, href, external: true };
  }
  if (["adresa", "verejna adresa"].includes(normalized)) return { label: "Adresa", value: clean, href: null };
  return null;
}

export function getHelpPresentation(item: HelpCase) {
  const description = parseHelpLabelledText(item.description);
  const contact = parseHelpLabelledText(item.contactNote);
  const fields = [...description.fields, ...contact.fields];
  const descriptionText = usefulHelpValue(fieldValue(fields, "Popis")) ?? usefulHelpValue(description.remainder) ?? usefulHelpValue(item.description);
  const contactRemainder = usefulHelpValue(contact.remainder);

  const contactLabels = ["Telefón", "Telefon", "Mobil", "E-mail", "Email", "Web", "Webstránka", "Facebook", "Instagram", "Adresa", "Verejná adresa"];
  const contacts = contactLabels.flatMap((label) => {
    const value = fieldValue(fields, label);
    const parsed = contactFromField(label, value);
    return parsed ? [parsed] : [];
  });
  const deduplicatedContacts = contacts.filter((candidate, index) => contacts.findIndex((other) => other.label === candidate.label && other.value === candidate.value) === index);

  const helpOptions = [
    ["Adopcie", fieldValue(fields, "Adopcie")],
    ["Dočasná opatera", fieldValue(fields, "Dočasná opatera")],
    ["Dobrovoľníctvo", fieldValue(fields, "Dobrovoľníctvo", "Dobrovoľnícka pomoc")],
    ["Materiálna pomoc", fieldValue(fields, "Materiálna pomoc")],
    ["Finančná pomoc", fieldValue(fields, "Finančná pomoc")],
    ["Prijímanie / záchrana psov", fieldValue(fields, "Prijímanie alebo záchrana psov", "Prijímanie a záchrana psov", "Prijímanie psov")],
  ] as const;

  const sourceValues = [fieldValue(fields, "Zdroj"), fieldValue(fields, "Zdroj 1"), fieldValue(fields, "Zdroj 2")]
    .map((value) => usefulHelpValue(value))
    .filter((value): value is string => Boolean(value));

  return {
    description: descriptionText,
    contactNote: contactRemainder,
    organizationType: usefulHelpValue(fieldValue(fields, "Typ organizácie")),
    coverage: usefulHelpValue(fieldValue(fields, "Oblasť pôsobenia", "Pokrytie")),
    helpOptions: helpOptions.flatMap(([label, value]) => {
      const clean = usefulHelpValue(value);
      return clean && !negativeValue.test(clean) ? [{ label, value: clean }] : [];
    }),
    contacts: deduplicatedContacts,
    sources: [...new Set(sourceValues)].map((value, index) => {
      const href = publicUrl(value);
      return { label: sourceValues.length > 1 ? `Zdroj ${index + 1}` : "Zdroj", value, href };
    }),
    lastChecked: usefulHelpValue(fieldValue(fields, "Posledná kontrola")),
  };
}

export function sameLooseText(left: string | null | undefined, right: string | null | undefined) {
  const normalize = (value: string | null | undefined) => (value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return Boolean(normalize(left)) && normalize(left) === normalize(right);
}
