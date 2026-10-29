import { getPublishedEventListing, getPublicEventCalendar } from "@/lib/event-store";
import { parseEventListing } from "@/lib/event-listing";
import { calendarMonthDays, resolveCalendarMonth } from "@/lib/event-calendar-view";
import { bratislavaDateKey, eventMonthFilterFromParam, eventTypes, type EventType } from "@/lib/events";

/** Small public JSON response for interactive calendar controls; no page/hero rebuild. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const rawType = url.searchParams.get("typ") ?? "Všetky";
  if (rawType !== "Všetky" && !(eventTypes as readonly string[]).includes(rawType)) {
    return Response.json({ error: "Neznámy typ podujatia." }, { status: 400 });
  }
  const type = rawType as EventType | "Všetky";
  const raw = Object.fromEntries(url.searchParams.entries());
  const today = bratislavaDateKey();
  const filters = parseEventListing(raw, type);
  const month = resolveCalendarMonth(
    eventMonthFilterFromParam(raw.kalendar),
    eventMonthFilterFromParam(raw.mesiac),
    today,
  );
  const requestedDay = raw.den ?? "";
  const day = calendarMonthDays(month).some((item) => item.inMonth && item.date === requestedDay)
    ? requestedDay : "";
  try {
    const [listing, calendar] = await Promise.all([
      getPublishedEventListing(filters),
      getPublicEventCalendar(filters, month, day),
    ]);
    return Response.json({
      events: listing.events,
      listing: { total: listing.total, page: listing.page, pages: listing.pages },
      calendarEvents: calendar.events,
      calendarSummaries: calendar.summaries,
      month,
      day,
      type,
      time: filters.time,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return Response.json({ error: "Podujatia sa nepodarilo načítať. Skúste to znova." },
      { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
