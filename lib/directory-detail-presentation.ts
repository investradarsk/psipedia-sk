import { directoryQualificationSections } from "./directory-public-copy.ts";
import type { DirectoryCategorySlug, PublicDirectoryProfile } from "@/lib/directory";
import type { ImageDisplayConfig } from "@/lib/image-display";
import { readDirectoryPublicContacts } from "./directory-profile-metadata.ts";
import { detailFields, relationFields, directoryPublicEditorFieldLabels, directoryPublicFactLabels, isDirectoryPublicMetadataField, readDirectoryPublicMetadataValue, readDirectoryPublicMetadataSource } from "./directory-public-facts";
import { publicLocationValue } from "./public-location.ts";
import type { PublicRelatedBreed } from "@/lib/content-relations";

export type DirectoryDetailFact = { label: string; value: string };
export type DirectoryDetailPhone = { value: string; href: string | null };
export type DirectoryDetailEmail = { value: string; href: string | null };
export type DirectoryDetailHealth = {
  variant: "veterinari";
  eyebrow: string;
  title: string;
  facts: DirectoryDetailFact[];
};

export type DirectoryDetailPresentation = {
  id: number;
  slug: string;
  name: string;
  category: DirectoryCategorySlug;
  additionalCategories?: DirectoryCategorySlug[];
  excerpt: string;
  services: string[];
  qualifications: string[];
  sources?: string[];
  city: string;
  district: string;
  region: string;
  address: string;
  priceNote: string;
  openingHours: string | null;
  imageUrl: string | null;
  imageAlt: string | null;
  galleryUrls?: string[];
  detailImageDisplay?: ImageDisplayConfig | null;
  verified: boolean;
  featured: boolean;
  description: string | null;
  descriptionParagraphs: string[];
  coverage: string | null;
  facts: DirectoryDetailFact[];
  health: DirectoryDetailHealth | null;
  phone: DirectoryDetailPhone | null;
  emails: DirectoryDetailEmail[];
  websiteUrl: string | null;
  websiteText: string | null;
  facebookUrl: string | null;
  facebookText: string | null;
  instagramUrl: string | null;
  instagramText: string | null;
  navigationUrl: string | null;
  updatedAt: string;
};

export type DirectoryQuickFact = {
  label: string;
  value?: string;
  links?: Array<{ label: string; href: string }>;
  dateTime?: string;
};

const unavailableValue = /^(?:neoveren[eé]|nezisten[eé]|neuveden[eé]|n\/a|nie je uveden[eé])$/i;
/** One editable public-fact registry: canonical D1 keys only, never retired alias keys.
 * Notion may mirror a key only when its property is an existing rich_text field.
 */
export const DIRECTORY_LEGACY_PUBLIC_EDITABLE_KEYS: readonly string[] = [
  ...new Set([...Object.values(detailFields).flat(), ...relationFields,
    "Ordinačné hodiny", "Pokrytie"]),
].filter(isDirectoryPublicMetadataField);

export function directoryLegacyEditableFactKeys(
  profile: Pick<PublicDirectoryProfile, "category" | "importData">,
): string[] {
  return directoryPublicEditorFieldLabels(profile.category).filter(
    key => DIRECTORY_LEGACY_PUBLIC_EDITABLE_KEYS.includes(key),
  );
}

function importedValue(profile: Pick<PublicDirectoryProfile, "importData">, field: string) {
  return readDirectoryPublicMetadataValue(profile.importData, field) || null;
}

export function usefulDirectoryDetailValue(value: string | null | undefined) {
  const clean = value?.trim() || null;
  return clean && !unavailableValue.test(clean) ? clean : null;
}

export function publicDirectoryDetailUrl(value: string | null | undefined) {
  const clean = usefulDirectoryDetailValue(value);
  if (!clean) return null;
  const candidate = /^https?:\/\//i.test(clean)
    ? clean
    : /^[\w.-]+\.[a-z]{2,}(?:\/|$)/i.test(clean)
      ? `https://${clean}`
      : null;
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** The exact first legacy opening-hours field read by the public detail.
 * A different field in Admin may be blank even while public hours are visible. */
export function directoryLegacyOpeningHoursSource(
  profile: Pick<PublicDirectoryProfile, "importData">,
): { sourceKey: string; value: string } | null {
  // The shared resolver owns precedence AND the old alias names.
  const fact = readDirectoryPublicMetadataSource(profile.importData, "Ordinačné hodiny");
  const value = usefulDirectoryDetailValue(fact?.value);
  return value && fact ? { sourceKey: fact.sourceKey, value } : null;
}

/** Exact legacy D1 fields that can surface as public Directory facts.
 * Reused by the public renderer and Admin provenance preview. */
export function directoryLegacyPublicFactSources(
  profile: Pick<PublicDirectoryProfile, "category" | "importData">,
): Array<DirectoryDetailFact & { sourceKey: string }> {
  const legacyFactLabels = profile.category === "fyzioterapia"
    ? []
    : directoryPublicFactLabels(profile.category);
  const factLabels = legacyFactLabels.filter(label =>
    !["Organizácia", "Zastrešujúca organizácia", "Zameranie"].includes(label));
  const facts = factLabels.flatMap(label => {
    const resolved = readDirectoryPublicMetadataSource(profile.importData, label);
    const value = usefulDirectoryDetailValue(resolved?.value);
    return value && resolved ? [{ label, value, sourceKey: resolved.sourceKey }] : [];
  });
  for (const label of ["Organizácia", "Zameranie"] as const) {
    const resolved = readDirectoryPublicMetadataSource(profile.importData, label);
    const value = usefulDirectoryDetailValue(resolved?.value);
    if (value && resolved) facts.push({ label, value, sourceKey: resolved.sourceKey });
  }
  return facts;
}

export function formatDirectoryUpdatedAt(value: string | null | undefined) {
  const timestamp = value?.trim() ?? "";
  if (!timestamp) return null;
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return null;
  const formatted = new Intl.DateTimeFormat("sk-SK", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    timeZone: "Europe/Bratislava",
  }).format(date);
  return `Aktualizované ${formatted}`;
}

export function getDirectoryQuickFacts(
  presentation: DirectoryDetailPresentation,
  profileType: string,
  relatedBreeds: Array<Pick<PublicRelatedBreed, "name" | "href">> = [],
): DirectoryQuickFact[] {
  const facts: DirectoryQuickFact[] = [];
  const addText = (label: string, value: string | null | undefined) => {
    const clean = usefulDirectoryDetailValue(value);
    if (clean) facts.push({ label, value: clean });
  };
  const addLinks = (label: string, links: Array<{ label: string; href: string }>) => {
    const visible = links.filter((link) => Boolean(link.label.trim() && link.href.trim()));
    if (visible.length) facts.push({ label, links: visible });
  };

  addText("Typ profilu", profileType);
  addText("Mesto / obec", presentation.city);
  addText("Okres", presentation.district);
  addText("Kraj", presentation.region);
  addLinks(
    "Plemená",
    relatedBreeds.map((breed) => ({ label: breed.name, href: breed.href })),
  );
  addText("Služby", presentation.services.join(", "));
  addText("Zameranie / kvalifikácie", presentation.qualifications.join(", "));
  if (presentation.websiteUrl)
    addLinks("Web", [{ label: "Oficiálny web", href: presentation.websiteUrl }]);
  else addText("Web", presentation.websiteText);
  if (presentation.facebookUrl)
    addLinks("Facebook", [{ label: "Facebook", href: presentation.facebookUrl }]);
  else addText("Facebook", presentation.facebookText);
  if (presentation.instagramUrl)
    addLinks("Instagram", [{ label: "Instagram", href: presentation.instagramUrl }]);
  else addText("Instagram", presentation.instagramText);
  if (presentation.phone?.href)
    addLinks("Telefón", [{ label: presentation.phone.value, href: presentation.phone.href }]);
  else addText("Telefón", presentation.phone?.value);
  // Quick facts support either linked or plain text. Mixed/invalid email
  // lists must be visible instead of silently losing their raw values.
  if (presentation.emails.some(email => !email.href))
    addText("E-mail", presentation.emails.map(email => email.value).join("; "));
  else addLinks(
    "E-mail",
    presentation.emails.filter((email): email is DirectoryDetailEmail & { href: string } => Boolean(email.href))
      .map(email => ({ label: email.value, href: email.href })),
  );
  const updatedLabel = formatDirectoryUpdatedAt(presentation.updatedAt);
  if (updatedLabel)
    facts.push({
      label: "Posledná aktualizácia",
      value: updatedLabel,
      dateTime: presentation.updatedAt,
    });

  return facts;
}

function splitDescription(value: string | null) {
  return value
    ? value
        .split(/\n{2,}/)
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

export function getDirectoryDetailPresentation(
  profile: PublicDirectoryProfile,
): DirectoryDetailPresentation {
  const publicAddress =
    profile.address.trim() ||
    (profile.formattedServiceAddress ? profile.formattedServiceAddress.replace(/\n/g, ", ") : "");
  const publicContacts = readDirectoryPublicContacts(profile.importData, profile.websiteUrl ?? "");
  const phoneValue = usefulDirectoryDetailValue(publicContacts.phone);
  const rawEmail = usefulDirectoryDetailValue(publicContacts.email);
  // Public profiles show every nonempty editorial contact as ordinary text.
  // Only valid URLs/emails become clickable; this rule is shared by all ten
  // directory categories, not only breeder profiles.
  const emails = (rawEmail
    ?.split(/[;,\n]|\s+\/\s+/)
    .map((item) => item.trim())
    .filter(Boolean) ?? []);
  const websiteUrl = publicDirectoryDetailUrl(publicContacts.website);
  const facebookUrl = publicDirectoryDetailUrl(publicContacts.facebook);
  const instagramUrl = publicDirectoryDetailUrl(publicContacts.instagram);
  const websiteText = usefulDirectoryDetailValue(publicContacts.website);
  const facebookText = usefulDirectoryDetailValue(publicContacts.facebook);
  const instagramText = usefulDirectoryDetailValue(publicContacts.instagram);
  // Textová/redakčná adresa sama osebe nie je dôkazom exact GEO polohy.
  // Navigáciu poskytuje PublicLocationMap iba vtedy, keď existuje aktuálny
  // verejný RESOLVED bod (Google Place alebo dôveryhodné súradnice).
  const navigationUrl = null;
  // Public detail and Admin provenance use the same canonical-first resolver.
  // Explicitly cleared values must not reactivate historical imported aliases.
  const facts = directoryLegacyPublicFactSources(profile).map(({ label, value }) => ({ label, value }));
  // Public organization/focus fields must not turn a veterinary profile into
  // a false "equipment and care" panel when no veterinary facts are present.
  const veterinaryFacts = facts.filter(fact =>
    (detailFields.veterinari ?? []).includes(fact.label));
  const health = profile.category === "veterinari" && veterinaryFacts.length > 0
    ? {
        variant: "veterinari" as const,
        eyebrow: "Zdravie a starostlivosť",
        title: "Veterinárna starostlivosť a vybavenie",
        facts: veterinaryFacts,
      }
    : null;
  const coverage = profile.category === "chovatelske-stanice"
    ? null // Local breeder homes do not advertise a service coverage area.
    : usefulDirectoryDetailValue(importedValue(profile, "Pokrytie"));
  // Do not turn a short-only profile into a duplicate long description.
  const description = profile.description?.trim() || null;

  return {
    id: profile.id,
    slug: profile.slug,
    name: profile.name,
    category: profile.category,
    additionalCategories: profile.additionalCategories ?? [],
    excerpt: profile.excerpt,
    services: profile.services,
    ...directoryQualificationSections(profile.qualifications),
    sources: [
      ...new Set([
        ...(profile.sources ?? []),
        ...directoryQualificationSections(profile.qualifications).sources,
      ]),
    ],
    city: publicLocationValue(profile.city, "city"),
    district: publicLocationValue(profile.district, "district"),
    region: publicLocationValue(profile.region, "region"),
    address: publicAddress,
    priceNote: profile.priceNote,
    openingHours: directoryLegacyOpeningHoursSource(profile)?.value ?? null,
    imageUrl: profile.imageUrl,
    imageAlt: usefulDirectoryDetailValue(importedValue(profile, "Alt text obrázka")),
    galleryUrls: profile.galleryUrls ?? [],
    detailImageDisplay: profile.detailImageDisplay,
    verified: profile.verified,
    featured: profile.featured,
    description,
    descriptionParagraphs: splitDescription(description),
    coverage,
    facts,
    health,
    phone: phoneValue
      ? { value: phoneValue, href: /\d{3,}/.test(phoneValue.replace(/\D/g, ""))
        ? `tel:${phoneValue.replace(/[^+\d]/g, "")}` : null }
      : null,
    emails: emails.map((value) => ({ value,
      href: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? `mailto:${value}` : null })),
    websiteUrl,
    websiteText,
    facebookUrl,
    facebookText,
    instagramUrl,
    instagramText,
    navigationUrl,
    updatedAt: profile.updatedAt,
  };
}
