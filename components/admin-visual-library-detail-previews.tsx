import { DirectoryServicesList } from "@/components/directory-services-list";
import { ProfileReviewSection } from "@/components/profile-review-section";
import { EventListingResults } from "@/components/event-listing-results";
import { parseEventListing } from "@/lib/event-listing";
import type { PublicProfileReviewData } from "@/lib/profile-review-read";
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

const emptyReviews: PublicProfileReviewData = {
  resourceId: "ukazka-bez-zapisov",
  summary: {
    count: 0, average: null,
    distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    dimensions: [],
  },
  reviews: [],
  pagination: { page: 1, pageSize: 10, total: 0, totalPages: 0 },
};

const populatedReviews: PublicProfileReviewData = {
  resourceId: "ukazka-recenzie",
  summary: {
    count: 2, average: 4.5,
    distribution: { 1: 0, 2: 0, 3: 0, 4: 1, 5: 1 },
    dimensions: [{ key: "care", label: "Starostlivosť", average: 4.5 }],
  },
  reviews: [
    {
      id: "ukazka-recenzia-1",
      displayName: "Ukážkový zákazník",
      overallRating: 5,
      body: "Fiktívna recenzia používaná iba na kontrolu grafického rozloženia.",
      serviceMonth: "2026-10",
      serviceTypeLabel: "Veterinárna starostlivosť",
      publishedAt: "2026-11-01T12:00:00Z",
      dimensions: [{ key: "care", label: "Starostlivosť", value: 5 }],
      providerReply: {
        body: "Ukážková odpoveď prevádzkovateľa.",
        publishedAt: "2026-11-02T12:00:00Z",
      },
      helpfulCount: 1,
    },
    {
      id: "ukazka-recenzia-2",
      displayName: "Anonymná ukážka",
      overallRating: 4,
      body: "Ďalší výhradne ukážkový komentár.",
      serviceMonth: null,
      serviceTypeLabel: null,
      publishedAt: "2026-10-30T12:00:00Z",
      dimensions: [],
      providerReply: null,
      helpfulCount: 0,
    },
  ],
  pagination: { page: 1, pageSize: 10, total: 2, totalPages: 1 },
};

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
  | "profile-reviews-empty"
  | "profile-reviews-populated"
  | "profile-reviews-error"
  | "event-listing-filtered"
  | "event-listing-empty";

export function AdminDetailComponentPreview({ id }: { id: AdminDetailPreviewId }) {
  switch (id) {
    case "directory-services-short":
      return <DirectoryServicesList services={services.slice(0, 6)} />;
    case "directory-services-expanded":
      return <DirectoryServicesList services={services} />;
    case "profile-reviews-empty":
      return <ProfileReviewSection data={emptyReviews} baseHref="/adresar/veterinari/ukazka" />;
    case "profile-reviews-populated":
      return <ProfileReviewSection data={populatedReviews} baseHref="/adresar/veterinari/ukazka" />;
    case "profile-reviews-error":
      return <ProfileReviewSection readError data={null} baseHref="/adresar/veterinari/ukazka" />;
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
