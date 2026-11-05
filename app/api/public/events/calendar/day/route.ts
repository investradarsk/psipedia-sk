import { getPublicEventDayPreview } from "@/lib/event-store";
import { parseEventListing } from "@/lib/event-listing";
import { calendarMonthDays, resolveCalendarMonth } from "@/lib/event-calendar-view";
import { bratislavaDateKey, eventMonthFilterFromParam, eventTypes, type EventType } from "@/lib/events";

/** A selected date does not need to reload the list or repeat month aggregate queries. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const rawType = url.searchParams.get("typ") ?? "Všetky";
  if (rawType !== "Všetky" && !(eventTypes as readonly string[]).includes(rawType)) {
    return Response.json({ error: "Neznámy typ podujatia." }, { status: 400 });
  }
  const raw = Object.fromEntries(url.searchParams.entries());
  const month = resolveCalendarMonth(
    eventMonthFilterFromParam(raw.kalendar),
    eventMonthFilterFromParam(raw.mesiac),
    bratislavaDateKey(),
  );
  const day = raw.den ?? "";
  if (!calendarMonthDays(month).some((item) => item.inMonth && item.date === day)) {
    return Response.json({ error: "Neplatný dátum." }, { status: 400 });
  }
  try {
    const calendarEvents = await getPublicEventDayPreview(
      parseEventListing(raw, rawType as EventType | "Všetky"),
      day,
    );
    return Response.json({ calendarEvents }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return Response.json({ error: "Podujatia sa nepodarilo načítať. Skúste to znova." },
      { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
