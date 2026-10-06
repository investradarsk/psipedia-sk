import type { DirectoryCategorySlug, PublicDirectoryProfile } from "@/lib/directory";
import { readDirectoryPublicContacts } from "./directory-profile-metadata.ts";
import type { PublicRelatedBreed } from "@/lib/content-relations";

export type DirectoryDetailFact = { label: string; value: string };
export type DirectoryDetailPhone = { value: string; href: string };
export type DirectoryDetailEmail = { value: string; href: string };
export type DirectoryDetailHealth = {
  variant: "veterinari" | "fyzioterapia";
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
  city: string;
  district: string;
  region: string;
  address: string;
  priceNote: string;
  imageUrl: string | null;
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
  facebookUrl: string | null;
  instagramUrl: string | null;
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
const relationFields = ["Plemeno", "Plemená", "FCI skupina", "Organizácia", "Zastrešujúca organizácia"] as const;

const detailFields: Partial<Record<DirectoryCategorySlug, string[]>> = {
  veterinari: ["Špecializácie", "Pohotovosť", "Hospitalizácia", "RTG", "USG", "Laboratórium"],
  treneri: ["Individuálny výcvik", "Skupinový výcvik", "Výcvik šteniat", "Behaviorálne poradenstvo", "Online konzultácie"],
  "kynologicke-kluby": ["Typ klubu", "Zameranie", "Organizácia", "Výcvik šteniat", "Individuálny výcvik", "Skupinový výcvik", "Športová kynológia", "Obrany", "Stopy", "Agility", "Rally obedience", "Retriever / poľovnícka kynológia"],
  "chovatelske-kluby": ["Plemeno", "Plemená", "FCI skupina", "Organizácia", "Zastrešujúca organizácia"],
  "chovatelske-stanice": ["Plemeno", "Plemená", "FCI skupina", "Chovateľ", "Klub", "Aktívny chov", "Aktuálne vrhy", "Plánované vrhy"],
  "hotely-a-opatrovanie": ["Hotel", "Opatrovanie", "Denná starostlivosť", "Vyzdvihnutie psa", "Online objednanie"],
  vencenie: ["Individuálne venčenie", "Skupinové venčenie", "Venčenie s tréningom", "Šteňatá", "Veľké psy", "Seniori / špeciálne potreby", "Vyzdvihnutie psa", "GPS / foto report", "Typ poskytovateľa"],
  fyzioterapia: ["Hydroterapia", "Laserterapia", "Magnetoterapia", "Elektroterapia", "Manuálne techniky", "Dogfitness / prevencia", "Pooperačná rehabilitácia", "Ortopedickí pacienti", "Neurologickí pacienti", "Športové / pracovné psy", "Mobilná služba", "Odborník / certifikácia"],
  "dalsie-sluzby": ["Typ služby", "Pokrytie", "Výjazd ku klientovi", "Celoslovenská dostupnosť", "Orientačná cena"],
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
  const candidate = /^https?:\/\//i.test(clean) ? clean : /^[\w.-]+\.[a-z]{2,}(?:\/|$)/i.test(clean) ? `https://${clean}` : null;
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
  addLinks("Plemená", relatedBreeds.map((breed) => ({ label: breed.name, href: breed.href })));
  addText("Služby", presentation.services.join(", "));
  addText("Zameranie / kvalifikácie", presentation.qualifications.join(", "));
  if (presentation.websiteUrl) addLinks("Web", [{ label: "Oficiálny web", href: presentation.websiteUrl }]);
  if (presentation.facebookUrl) addLinks("Facebook", [{ label: "Facebook", href: presentation.facebookUrl }]);
  if (presentation.instagramUrl) addLinks("Instagram", [{ label: "Instagram", href: presentation.instagramUrl }]);
  if (presentation.phone) addLinks("Telefón", [{ label: presentation.phone.value, href: presentation.phone.href }]);
  addLinks("E-mail", presentation.emails.map((email) => ({ label: email.value, href: email.href })));
  const updatedLabel = formatDirectoryUpdatedAt(presentation.updatedAt);
  if (updatedLabel) facts.push({ label: "Posledná aktualizácia", value: updatedLabel, dateTime: presentation.updatedAt });

  return facts;
}

function splitDescription(value: string | null) {
  return value ? value.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean) : [];
}

export function getDirectoryDetailPresentation(profile: PublicDirectoryProfile): DirectoryDetailPresentation {
  const publicAddress = profile.address.trim()
    || (profile.formattedServiceAddress ? profile.formattedServiceAddress.replace(/\n/g, ", ") : "");
  const publicContacts = readDirectoryPublicContacts(profile.importData, profile.websiteUrl ?? "");
  const phoneValue = usefulDirectoryDetailValue(publicContacts.phone);
  const rawEmail = usefulDirectoryDetailValue(publicContacts.email);
  const emails = rawEmail?.split(/[;,]/).map((item) => item.trim()).filter((item) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item)) ?? [];
  const websiteUrl = publicDirectoryDetailUrl(publicContacts.website);
  const facebookUrl = publicDirectoryDetailUrl(publicContacts.facebook);
  const instagramUrl = publicDirectoryDetailUrl(publicContacts.instagram);
  // Textová/redakčná adresa sama osebe nie je dôkazom exact GEO polohy.
  // Navigáciu poskytuje PublicLocationMap iba vtedy, keď existuje aktuálny
  // verejný RESOLVED bod (Google Place alebo dôveryhodné súradnice).
  const navigationUrl = null;
  const factLabels = [...new Set([...(detailFields[profile.category] ?? []), ...relationFields])];
  const facts = factLabels.flatMap((label) => {
    const value = usefulDirectoryDetailValue(importedValue(profile, label));
    return value ? [{ label, value }] : [];
  });
  const health = profile.category === "veterinari" && facts.length > 0
    ? {
        variant: "veterinari" as const,
        eyebrow: "Zdravie a starostlivosť",
        title: "Veterinárna starostlivosť a vybavenie",
        facts,
      }
    : profile.category === "fyzioterapia" && facts.length > 0
      ? {
          variant: "fyzioterapia" as const,
          eyebrow: "Zdravie a starostlivosť",
          title: "Terapie a rehabilitácia",
          facts,
        }
      : null;
  const coverage = usefulDirectoryDetailValue(importedValue(profile, "Pokrytie", "Oblasť pôsobenia", "Lokalita / pokrytie"));
  const description = profile.description || profile.excerpt || null;

  return {
    id: profile.id,
    slug: profile.slug,
    name: profile.name,
    category: profile.category,
    excerpt: profile.excerpt,
    services: profile.services,
    qualifications: profile.qualifications,
    city: profile.city,
    district: profile.district,
    region: profile.region,
    address: publicAddress,
    priceNote: profile.priceNote,
    imageUrl: profile.imageUrl,
    verified: profile.verified,
    featured: profile.featured,
    description,
    descriptionParagraphs: splitDescription(description),
    coverage,
    facts,
    health,
    phone: phoneValue ? { value: phoneValue, href: `tel:${phoneValue.replace(/[^+\d]/g, "")}` } : null,
    emails: emails.map((value) => ({ value, href: `mailto:${value}` })),
    websiteUrl,
    facebookUrl,
    instagramUrl,
    navigationUrl,
    updatedAt: profile.updatedAt,
  };
}
