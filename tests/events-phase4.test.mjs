import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { eventTypePortalHref, selectRelatedEvents } from "../lib/events.ts";

function event(overrides) {
  return {
    id: 1,
    slug: "podujatie",
    eventType: "Výstava",
    startDate: "2026-09-20",
    startTime: "09:00",
    endDate: null,
    endTime: null,
    cancelled: false,
    ...overrides,
  };
}

test("Phase 4 event detail reuses the shared detail primitives and does not duplicate JSON-LD", () => {
  const detail = readFileSync(new URL("../components/event-detail.tsx", import.meta.url), "utf8");
  assert.match(detail, /PageContainer/);
  assert.match(detail, /<Breadcrumbs>/);
  assert.match(detail, /<MediaFrame className="event-detail-visual"/);
  assert.match(detail, /cardShellClassName/);
  assert.match(detail, /eventDateStatus\(event\)/);
  assert.doesNotMatch(detail, /application\/ld\+json|eventDateTimeIso/);
});

test("Phase 4 summary exposes real event fields and optional CTAs never render empty", () => {
  const detail = readFileSync(new URL("../components/event-detail.tsx", import.meta.url), "utf8");
  for (const label of ["Termín", "Čas", "Miesto", "Organizátor", "Registrácia", "Oficiálna stránka"]) {
    assert.match(detail, new RegExp(label));
  }
  assert.match(detail, /event\.registrationUrl && <a/);
  assert.match(detail, /event\.websiteUrl && <a/);
  assert.match(detail, /locationLines\.length > 0/);
  assert.match(detail, /event\.organizer &&/);
  assert.match(detail, /event\.description &&/);
  assert.match(detail, /event\.practicalInfo &&/);
  assert.doesNotMatch(detail, /Program|Poplatky|Podmienky účasti/);
});

test("event type links only target existing public type routes", () => {
  assert.equal(eventTypePortalHref("Výstava"), "/podujatia/vystavy");
  assert.equal(eventTypePortalHref("Preteky"), "/podujatia/preteky");
  assert.equal(eventTypePortalHref("Seminár"), "/podujatia/seminare");
  assert.equal(eventTypePortalHref("Tréning"), null);
  assert.equal(eventTypePortalHref("Stretnutie"), null);
  assert.equal(eventTypePortalHref("Iné"), null);
});

test("related events prefer active same-type events while past details prefer the nearest active events", () => {
  const today = "2026-09-09";
  const current = event({ id: 10, slug: "current", startDate: "2026-09-10", eventType: "Výstava" });
  const candidates = [
    event({ id: 2, slug: "old-show", startDate: "2026-09-01", eventType: "Výstava" }),
    event({ id: 3, slug: "race", startDate: "2026-09-11", eventType: "Preteky" }),
    event({ id: 4, slug: "show-later", startDate: "2026-09-20", eventType: "Výstava" }),
    event({ id: 5, slug: "show-sooner", startDate: "2026-09-15", eventType: "Výstava" }),
    event({ id: 6, slug: "cancelled", startDate: "2026-09-12", eventType: "Výstava", cancelled: true }),
  ];

  assert.deepEqual(
    selectRelatedEvents(current, candidates, 3, today).map((item) => item.slug),
    ["show-sooner", "show-later", "race"],
  );

  const past = event({ id: 20, slug: "past", startDate: "2026-09-01", eventType: "Výstava" });
  assert.deepEqual(
    selectRelatedEvents(past, candidates, 2, today).map((item) => item.slug),
    ["race", "show-sooner"],
  );
});

test("route keeps canonical metadata, Event schema and truthful BreadcrumbList while passing nearby events", () => {
  const page = readFileSync(new URL("../app/[section]/[slug]/page.tsx", import.meta.url), "utf8");
  assert.match(page, /buildContentMetadata/);
  assert.match(page, /resolvedCanonical\(event\.seo,eventHref\(event\)\)|resolvedCanonical\(event\.seo, eventHref\(event\)\)/);
  assert.match(page, /"@type": "Event"/);
  assert.match(page, /"@type": "BreadcrumbList"/);
  assert.match(page, /position: 1, name: "Domov"/);
  assert.match(page, /position: 2, name: "Podujatia"/);
  assert.match(page, /position: 3, name: event\.title/);
  assert.match(page, /eventDateTimeIso\(event\.startDate, event\.startTime\)/);
  assert.match(page, /getUpcomingEvents\(8\)/);
  assert.match(page, /selectRelatedEvents\(event,/);
  assert.match(page, /<EventDetail event=\{event\} related=\{related\}/);
});

test("existing admin already manages every field needed by the Phase 4 layout", () => {
  const editor = readFileSync(new URL("../components/admin-event-editor.tsx", import.meta.url), "utf8");
  for (const field of [
    "event-type", "event-start-date", "event-start-time", "event-end-date", "event-end-time",
    "event-region", "event-city", "event-venue", "event-address", "event-organizer",
    "event-description", "event-practical", "event-web", "event-registration",
  ]) {
    assert.match(editor, new RegExp(`id=\\"${field}\\"`));
  }
  assert.match(editor, /AdminSeoFields/);
});

test("Phase 4 event layout uses shared spacing, radius and border tokens with mobile fallbacks", () => {
  const css = readFileSync(new URL("../app/design-system.css", import.meta.url), "utf8");
  assert.match(css, /\.event-detail-summary[\s\S]*grid-template-columns:\s*repeat\(4/);
  assert.match(css, /\.event-detail-summary > \.card-shell/);
  assert.match(css, /var\(--ps-space-section\)/);
  assert.match(css, /var\(--ps-space-block\)/);
  assert.match(css, /var\(--ps-border-soft\)/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*\.event-detail-summary[\s\S]*grid-template-columns:\s*1fr/);
});
