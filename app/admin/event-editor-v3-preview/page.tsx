import { notFound } from "next/navigation";
import { AdminEventEditor } from "@/components/admin-event-editor";
import type { DogEvent } from "@/lib/events";

// Isolated development fixture only. No database, Notion or production writes.
// The published variant exercises the canonical event PUT/unpublish actions.
const publishedFixture: DogEvent = {
  id: 99990,
  title: "Existujúce podujatie E2E",
  slug: "existujuce-podujatie-e2e",
  excerpt: "Testovacie podujatie iba pre izolovaný prehliadač.",
  eventType: "Výstava",
  status: "published",
  startDate: "2026-11-12",
  startTime: "09:00",
  endDate: null,
  endTime: null,
  venue: "Testovacia hala",
  city: "Nitra",
  region: "Nitriansky kraj",
  address: "Testovacia 1",
  organizer: "Testovací klub",
  description: "Pôvodný popis",
  practicalInfo: "Vstup voľný",
  websiteUrl: null,
  registrationUrl: null,
  imageUrl: null,
  imageKey: null,
  cancelled: false,
  createdAt: "2026-10-01T12:00:00.000Z",
  updatedAt: "2026-10-01T12:00:00.000Z",
  publishedAt: "2026-10-01T12:00:00.000Z",
  createdBy: "e2e-fixture",
  updatedBy: "e2e-fixture",
  seo: {},
};

// A real-world legacy case deliberately uses unsupported source spellings.
// The Lexical adapter must not change these fields on unrelated saves.
const legacyFixture: DogEvent = {
  ...publishedFixture,
  description: "* Starý zoznam\n3. Netradičné číslovanie",
  practicalInfo: "[Kontakt](mailto:klub@example.org)",
};

export default async function EventEditorV3PreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ fixture?: string }>;
}) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { fixture } = await searchParams;
  return (
    <main style={{ maxWidth: 1440, margin: "0 auto", padding: "0.5rem" }}>
      <AdminEventEditor event={fixture === "published" ? publishedFixture : fixture === "legacy" ? legacyFixture : undefined} />
    </main>
  );
}
