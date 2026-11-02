import { DirectoryServicesList } from "@/components/directory-services-list";
import { EventListingResults } from "@/components/event-listing-results";
import { parseEventListing } from "@/lib/event-listing";
import type { PublicEventCard } from "@/lib/events";

/**
 * Read-only admin gallery fixtures; rendering uses the actual public React
 * components, never real profile records. Parent gallery must keep these inert.
 * Do not use this module as a public mock API or load real D1 data here.
 */
const services = [
  "Preventívna prehliadka", "Očkovanie psov", "Čipovanie",
  "Interná medicína", "Odber krvi", "Ultrazvuk",
  "Röntgen", "Dermatológia", "Poradenstvo vo výžive",
  "Dentálna starostlivosť", "Fyzioterapia", "Kontrola hmotnosti",
];

const sampleEvent: PublicEventCard = {
  id: 0,
  slug: "ukazkove-podujatie",
  title: "Ukážkové kynologické podujatie",
  eventType: "Seminár",
  startDate: "2027-06-14",
  startTime: "10:00",
  endDate: null,
  endTime: "16:00",
  venue: "Ukážkové centrum",
  city: "Nitra",
  region: "Nitriansky kraj",
  cancelled: false,
  imageUrl: null,
};

export type AdminDetailPreviewId =
  | "directory-services-short"
  | "directory-services-expanded"
  | "event-listing-filtered"
  | "event-listing-empty";

export function AdminDetailComponentPreview({ id }: { id: AdminDetailPreviewId }) {
  switch (id) {
    case "directory-services-short":
      return <DirectoryServicesList services={services.slice(0, 6)} />;
    case "directory-services-expanded":
      return <DirectoryServicesList services={services} />;
    case "event-listing-filtered":
      return <EventListingResults
        events={[sampleEvent]}
        filters={parseEventListing({ region: "Nitriansky kraj", mesto: "Nitra" })}
        listing={{ total: 1, page: 1, pages: 1 }}
        today="2027-06-01"
        pathname="/podujatia"
        title="Ukážka filtrovaných podujatí"
        calendarMonth="2027-06"
        day=""
      />;
    case "event-listing-empty":
      return <EventListingResults
        events={[]}
        filters={parseEventListing({ q: "ukážkové hľadanie" })}
        listing={{ total: 0, page: 1, pages: 0 }}
        today="2027-06-01"
        pathname="/podujatia"
        title="Ukážka prázdneho zoznamu"
        calendarMonth="2027-06"
        day=""
      />;
  }
}
