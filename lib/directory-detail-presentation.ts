import { directoryQualificationSections } from "./directory-public-copy.ts";
import type { DirectoryCategorySlug, PublicDirectoryProfile } from "@/lib/directory";
import type { ImageDisplayConfig } from "@/lib/image-display";
import { readDirectoryPublicContacts } from "./directory-profile-metadata.ts";
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
const relationFields = [
  "Plemeno",
  "Plemená",
  "FCI skupina",
  "Organizácia",
  "Zastrešujúca organizácia",
] as const;

const detailFields: Partial<Record<DirectoryCategorySlug, string[]>> = {
  veterinari: ["Špecializácie", "Pohotovosť", "Hospitalizácia", "RTG", "USG", "Laboratórium"],
  treneri: [
    "Individuálny výcvik",
    "Skupinový výcvik",
    "Výcvik šteniat",
    "Behaviorálne poradenstvo",
  ],
  "kynologicke-kluby": [
    "Typ klubu",
    "Zameranie",
    "Organizácia",
    "Výcvik šteniat",
    "Individuálny výcvik",
    "Skupinový výcvik",
    "Športová kynológia",
    "Obrany",
    "Stopy",
    "Agility",
    "Rally obedience",
    "Retriever / poľovnícka kynológia",
  ],
  "chovatelske-kluby": [
    "Plemeno",
    "Plemená",
    "FCI skupina",
    "Organizácia",
    "Zastrešujúca organizácia",
  ],
  "chovatelske-stanice": [
    "Plemeno",
    "Plemená",
    "FCI skupina",
    "Chovateľ",
    "Klub",
    "Aktívny chov",
    "Aktuálne vrhy",
    "Plánované vrhy",
  ],
  "hotely-a-opatrovanie": ["Hotel", "Opatrovanie", "Denná starostlivosť", "Vyzdvihnutie psa"],
  vencenie: [
    "Individuálne venčenie",
    "Skupinové venčenie",
    "Venčenie s tréningom",
    "Šteňatá",
    "Veľké psy",
    "Seniori / špeciálne potreby",
    "Vyzdvihnutie psa",
    "GPS / foto report",
    "Typ poskytovateľa",
  ],
  "dalsie-sluzby": [
    "Typ služby",
    "Pokrytie",
    "Výjazd ku klientovi",
    "Celoslovenská dostupnosť",
    "Orientačná cena",
  ],
};

function importedValue(profile: PublicDirectoryProfile, ...keys: string[]) {
  for (const key of keys) {
    const value = profile.importData?.[key];
    if (value !== null && value !== undefined && String(value).trim()) return String(value).trim();
  }
  return null;
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
  if (presentation.facebookUrl)
    addLinks("Facebook", [{ label: "Facebook", href: presentation.facebookUrl }]);
  if (presentation.instagramUrl)
    addLinks("Instagram", [{ label: "Instagram", href: presentation.instagramUrl }]);
  if (presentation.phone?.href)
    addLinks("Telefón", [{ label: presentation.phone.value, href: presentation.phone.href }]);
  addLinks(
    "E-mail",
    presentation.emails.filter((email): email is DirectoryDetailEmail & { href: string } => Boolean(email.href))
    .map((email) => ({ label: email.value, href: email.href })),
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
  // Preserve arbitrary editorial strings on public profiles. Only genuinely
  // usable values become mailto/tel/web links; invalid text is never lost.
  const breederText = profile.category === "chovatelske-stanice";
  const emails = (rawEmail
    ?.split(/[;,\n]|\s+\/\s+/)
    .map((item) => item.trim())
    .filter(Boolean) ?? [])
    .filter((value) => breederText || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
  const websiteUrl = publicDirectoryDetailUrl(publicContacts.website);
  const facebookUrl = publicDirectoryDetailUrl(publicContacts.facebook);
  const instagramUrl = publicDirectoryDetailUrl(publicContacts.instagram);
  const websiteText = breederText ? usefulDirectoryDetailValue(publicContacts.website) : websiteUrl;
  const facebookText = breederText ? usefulDirectoryDetailValue(publicContacts.facebook) : facebookUrl;
  const instagramText = breederText ? usefulDirectoryDetailValue(publicContacts.instagram) : instagramUrl;
  // Textová/redakčná adresa sama osebe nie je dôkazom exact GEO polohy.
  // Navigáciu poskytuje PublicLocationMap iba vtedy, keď existuje aktuálny
  // verejný RESOLVED bod (Google Place alebo dôveryhodné súradnice).
  const navigationUrl = null;
  // Physiotherapy therapy/patient flags are retired in favor of Services V3 and prose.
  const legacyFactLabels = profile.category === "fyzioterapia"
    ? []
    : [...new Set([...(detailFields[profile.category] ?? []), ...relationFields])];
  // Show both Admin-managed public facts consistently in every directory category.
  // "Zastrešujúca organizácia" is a legacy alias, not a second public fact.
  const factLabels = legacyFactLabels.filter(label =>
    !["Organizácia", "Zastrešujúca organizácia", "Zameranie"].includes(label));
  const facts = [
    ...factLabels.flatMap((label) => {
      const value = usefulDirectoryDetailValue(importedValue(profile, label));
      return value ? [{ label, value }] : [];
    }),
    ...(["Organizácia", "Zameranie"] as const).flatMap(label => {
      const value = usefulDirectoryDetailValue(label === "Organizácia"
        ? importedValue(profile, "Organizácia", "Zastrešujúca organizácia")
        : importedValue(profile, label));
      return value ? [{ label, value }] : [];
    }),
  ];
  const health = profile.category === "veterinari" && facts.length > 0
    ? {
        variant: "veterinari" as const,
        eyebrow: "Zdravie a starostlivosť",
        title: "Veterinárna starostlivosť a vybavenie",
        facts,
      }
    : null;
  const coverage = usefulDirectoryDetailValue(
    importedValue(profile, "Pokrytie", "Oblasť pôsobenia", "Lokalita / pokrytie"),
  );
  // Do not turn a short-only profile into a duplicate long description.
  const description = profile.description?.trim() || null;

  return {
    id: profile.id,
    slug: profile.slug,
    name: profile.name,
    category: profile.category,
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
    openingHours: usefulDirectoryDetailValue(
      importedValue(
        profile,
        "Ordinačné hodiny",
        "Otváracie hodiny",
        "Otváracia doba",
        "Ordinačná doba",
        "Pracovná doba",
      ),
    ),
    imageUrl: profile.imageUrl,
    imageAlt: usefulDirectoryDetailValue(importedValue(profile, "Alt text obrázka")),
    galleryUrls: profile.category === "chovatelske-stanice" ? (profile.galleryUrls ?? []) : [],
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
