import { eventDateTimeIso, eventHref, eventPortalCategory, type DogEvent } from "./events.ts";
import { absoluteUrl, buildWebPageJsonLd, SITE_URL } from "./seo.ts";

export function buildEventJsonLd(event: DogEvent, canonicalInput = eventHref(event)) {
  const canonical = absoluteUrl(canonicalInput);
  const eventCategory = eventPortalCategory(event.eventType);
  const eventEntityId = `${canonical}#event`;
  const breadcrumbId = `${canonical}#breadcrumb`;
  const location = event.region === "Online"
    ? { "@type": "VirtualLocation", url: event.websiteUrl || canonical }
    : {
        "@type": "Place",
        name: event.venue || event.city,
        address: {
          "@type": "PostalAddress",
          streetAddress: event.address || undefined,
          addressLocality: event.city || undefined,
          addressRegion: event.region || undefined,
          addressCountry: "SK",
        },
      };
  const breadcrumbItems = [
    { "@type": "ListItem", position: 1, name: "Domov", item: SITE_URL },
    { "@type": "ListItem", position: 2, name: "Podujatia", item: `${SITE_URL}/podujatia` },
    ...(eventCategory ? [{ "@type": "ListItem", position: 3, name: eventCategory.label, item: absoluteUrl(eventCategory.href) }] : []),
    { "@type": "ListItem", position: eventCategory ? 4 : 3, name: event.title, item: canonical },
  ];

  // Organizer is visible on-page, but the canonical data model stores only a label.
  // Do not invent a foreign Person/Organization entity or ticket/offer semantics.
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Event",
        "@id": eventEntityId,
        name: event.title,
        description: event.description || event.excerpt,
        startDate: eventDateTimeIso(event.startDate, event.startTime),
        endDate: event.endDate ? eventDateTimeIso(event.endDate, event.endTime) : undefined,
        eventStatus: event.cancelled ? "https://schema.org/EventCancelled" : "https://schema.org/EventScheduled",
        eventAttendanceMode: event.region === "Online"
          ? "https://schema.org/OnlineEventAttendanceMode"
          : "https://schema.org/OfflineEventAttendanceMode",
        location,
        mainEntityOfPage: { "@id": canonical },
        image: event.imageUrl ? [absoluteUrl(event.imageUrl)] : undefined,
        url: canonical,
      },
      buildWebPageJsonLd({
        canonical,
        name: event.title,
        description: event.description || event.excerpt,
        mainEntityId: eventEntityId,
        breadcrumbId,
        datePublished: event.publishedAt || event.createdAt,
        dateModified: event.updatedAt,
      }),
      { "@type": "BreadcrumbList", "@id": breadcrumbId, itemListElement: breadcrumbItems },
    ],
  };
}
