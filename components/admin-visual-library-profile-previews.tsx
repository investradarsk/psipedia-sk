import { BreedCard } from "@/components/breed-card";
import { DirectoryCard } from "@/components/directory-card";
import { EventCard } from "@/components/event-card";
import { HelpCard } from "@/components/help-card";
import { RelatedBreedList } from "@/components/related-entity-list";
import type { BreedAtlasCard } from "@/lib/breed-store";
import type { PublicDirectoryProfile } from "@/lib/directory";
import type { PublicEventCard } from "@/lib/events";
import type { PublicHelpCard } from "@/lib/help";

/**
 * Admin-only visual fixtures: never read or alter production records.
 * Every example uses the exact public component with plainly fictional
 * names, and inert parent previews block actions/navigation.
 */
const breedExample: BreedAtlasCard = {
  slug: "ukazka-plemena",
  name: "Ukážkové plemeno",
  image: "",
  fciGroup: 8,
  fciSection: "Retrievery",
  fciSectionNumber: "1",
  origin: "Veľká Británia",
  group: "Retrievery",
  accent: "forest",
  height: "54–57 cm",
  weight: "25–36 kg",
  intro: "Ukážka karty s údajmi o plemene. Nejde o skutočný profil.",
  energy: 5,
  trainability: 4,
  family: 5,
  officialFciName: "Ukážkové plemeno",
  searchText: "ukážkový profil",
  editorialComplete: true,
};

const directoryExample: PublicDirectoryProfile = {
  id: 0,
  slug: "ukazkove-pracovisko",
  name: "Ukážkové veterinárne pracovisko",
  category: "veterinari",
  excerpt: "Ukážka profilu v adresári",
  description: "Ilustračná karta, ktorá nepredstavuje reálnu prevádzku.",
  services: ["Preventívna starostlivosť", "Vyšetrenie"],
  qualifications: [],
  city: "Nitra",
  district: "Nitra",
  region: "Nitriansky kraj",
  address: "",
  postalCode: "",
  street: "",
  houseNumber: "",
  addressFormat: "",
  serviceAddressConfirmation: "LEGACY_UNCONFIRMED",
  priceNote: "",
  websiteUrl: null,
  imageUrl: null,
  verified: false,
  featured: false,
  updatedAt: "2026-11-01T12:00:00Z",
  importData: null,
};

const eventExample: PublicEventCard = {
  id: 0,
  slug: "ukazkove-podujatie",
  title: "Ukážkové kynologické podujatie",
  eventType: "Výstava",
  startDate: "2027-06-14",
  startTime: "10:00",
  endDate: null,
  endTime: "16:00",
  venue: "Ukážkové výstavisko",
  city: "Nitra",
  region: "Nitriansky kraj",
  cancelled: false,
  imageUrl: null,
};

const helpExample: PublicHelpCard = {
  id: 0,
  slug: "ukazkovy-pripad",
  title: "Ukážka pomoci psovi",
  category: "zbierky",
  excerpt: "Ilustračná karta na porovnanie grafiky. Nie je to skutočná zbierka ani výzva.",
  organization: "Ukážková organizácia",
  dogName: "Ukážkový pes",
  breed: "",
  ageNote: "",
  city: "Nitra",
  region: "Nitriansky kraj",
  reportedDate: "2026-11-01",
  goalAmount: 1000,
  raisedAmount: 650,
  imageUrl: null,
  urgent: false,
  verified: false,
  resolved: false,
  updatedAt: "2026-11-01T12:00:00Z",
};

export type AdminProfilePreviewId =
  | "breed-card"
  | "directory-card"
  | "event-list"
  | "event-grid"
  | "help-card"
  | "help-resolved"
  | "related-breed-list";

export function AdminProfileComponentPreview({ id }: { id: AdminProfilePreviewId }) {
  switch (id) {
    case "breed-card":
      return <BreedCard breed={breedExample} />;
    case "directory-card":
      return <DirectoryCard profile={directoryExample} />;
    case "event-list":
      return <EventCard event={eventExample} today="2027-06-01" />;
    case "event-grid":
      return <EventCard event={eventExample} today="2027-06-01" variant="grid" />;
    case "help-card":
      return <HelpCard item={helpExample} />;
    case "help-resolved":
      return <HelpCard item={{
        ...helpExample,
        slug: "ukazkovy-vyrieseny-pripad",
        title: "Ukážka ukončenej pomoci",
        urgent: false,
        resolved: true,
      }} />;
    case "related-breed-list":
      return <RelatedBreedList label="Ukážka súvisiacich plemien" breeds={[
        { id: 0, slug: "ukazka-a", href: "/plemena/ukazka-a", name: "Ukážkové plemeno A", imageUrl: null, fciGroup: 8 },
        { id: -1, slug: "ukazka-b", href: "/plemena/ukazka-b", name: "Ukážkové plemeno B", imageUrl: null, fciGroup: 1 },
      ]} />;
  }
}
