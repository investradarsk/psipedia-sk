import Link from "next/link";
import { EventCard } from "@/components/event-card";
import { SearchIcon } from "@/components/icons";
import { PublicFilterDisclosure } from "@/components/public-filter-disclosure";
import {
  eventDateStatus,
  eventTimeFilterParam,
  eventTypePortalHref,
  slovakRegions,
  type DogEvent,
  type EventTimeFilter,
  type EventType,
  type SlovakRegion,
} from "@/lib/events";
import styles from "./events-public.module.css";

const MONTH_NAMES = ["január", "február", "marec", "apríl", "máj", "jún", "júl", "august", "september", "október", "november", "december"];

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("sk")
    .trim();
}

function monthKeysForEvent(event: Pick<DogEvent, "startDate" | "endDate">) {
  const start = event.startDate.slice(0, 7);
  const end = (event.endDate || event.startDate).slice(0, 7);
  let year = Number(start.slice(0, 4));
  let month = Number(start.slice(5, 7));
  const endYear = Number(end.slice(0, 4));
  const endMonth = Number(end.slice(5, 7));
  const keys: string[] = [];

  for (let guard = 0; guard < 120 && (year < endYear || (year === endYear && month <= endMonth)); guard += 1) {
    keys.push(String(year) + "-" + String(month).padStart(2, "0"));
    month += 1;
    if (month === 13) {
      month = 1;
      year += 1;
    }
  }
  return keys;
}

function monthLabel(key: string) {
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7));
  return (MONTH_NAMES[month - 1] || key) + " " + year;
}

function compareEvents(left: DogEvent, right: DogEvent, today: string) {
  const leftStatus = eventDateStatus(left, today);
  const rightStatus = eventDateStatus(right, today);
  const rank = (event: DogEvent, status: ReturnType<typeof eventDateStatus>) => {
    if (status === "current") return event.cancelled ? 2 : 0;
    if (status === "upcoming") return event.cancelled ? 2 : 1;
    return event.cancelled ? 4 : 3;
  };
  const rankDifference = rank(left, leftStatus) - rank(right, rightStatus);
  if (rankDifference) return rankDifference;

  if (leftStatus === "past" && rightStatus === "past") {
    const leftEnd = left.endDate || left.startDate;
    const rightEnd = right.endDate || right.startDate;
    return rightEnd.localeCompare(leftEnd) || right.startTime.localeCompare(left.startTime) || right.id - left.id;
  }

  return left.startDate.localeCompare(right.startDate)
    || left.startTime.localeCompare(right.startTime)
    || left.id - right.id;
}

export function EventCalendar({
  events,
  today,
  initialType = "Všetky",
  initialTime = "upcoming",
  initialQuery = "",
  initialRegion = "",
  initialMonth = "",
}: {
  events: DogEvent[];
  today: string;
  initialType?: EventType | "Všetky";
  initialTime?: EventTimeFilter;
  initialQuery?: string;
  initialRegion?: "" | SlovakRegion;
  initialMonth?: string;
}) {
  const query = initialQuery.trim().slice(0, 120);
  const region = initialRegion;
  const month = initialMonth;
  const typePathname = initialType === "Všetky" ? "/podujatia" : eventTypePortalHref(initialType) ?? "/podujatia";
  const months = new Set<string>();
  events.forEach((event) => monthKeysForEvent(event).forEach((value) => months.add(value)));
  if (month) months.add(month);
  const monthOptions = [...months].sort();
  const needle = normalizeSearch(query);

  const filtered = events.filter((event) => {
    const dateStatus = eventDateStatus(event, today);
    const haystack = normalizeSearch([
      event.title,
      event.excerpt,
      event.eventType,
      event.venue,
      event.address,
      event.city,
      event.region,
      event.organizer,
    ].filter(Boolean).join(" "));
    const queryMatches = !needle || haystack.includes(needle);
    const timeMatches = initialTime === "all"
      || (initialTime === "upcoming" && dateStatus !== "past")
      || (initialTime === "current" && dateStatus === "current")
      || (initialTime === "past" && dateStatus === "past");
    const monthMatches = !month
      || (event.startDate.slice(0, 7) <= month && (event.endDate || event.startDate).slice(0, 7) >= month);

    return queryMatches
      && (initialType === "Všetky" || event.eventType === initialType)
      && (!region || event.region === region)
      && monthMatches
      && timeMatches;
  }).sort((left, right) => compareEvents(left, right, today));

  const activeSecondaryCount = Number(Boolean(region)) + Number(Boolean(month));
  const hasActiveFilters = Boolean(query || region || month || initialTime !== "upcoming");

  function timeHref(value: EventTimeFilter) {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (region) params.set("region", region);
    if (month) params.set("mesiac", month);
    const timeParam = eventTimeFilterParam(value);
    if (timeParam) params.set("termin", timeParam);
    const serialized = params.toString();
    return serialized ? `${typePathname}?${serialized}` : typePathname;
  }

  return (
    <div className={styles.calendar}>
      <form
        className={styles.toolbar}
        method="get"
        action={typePathname}
        data-event-filters
        data-public-search-form="events"
      >
        {eventTimeFilterParam(initialTime) ? (
          <input type="hidden" name="termin" value={eventTimeFilterParam(initialTime)} />
        ) : null}

        <label className={styles.searchControl}>
          <span>Hľadať</span>
          <span className={styles.searchInput}>
            <SearchIcon size={20} />
            <input
              name="q"
              defaultValue={query}
              maxLength={120}
              placeholder="Názov, mesto, miesto alebo organizátor"
            />
          </span>
        </label>

        <button className={styles.searchSubmit} type="submit">Hľadať</button>

        <PublicFilterDisclosure
          activeCount={activeSecondaryCount}
          buttonClassName={styles.filterToggle}
          contentClassName={styles.secondaryFilters}
          openContentClassName={styles.secondaryFiltersOpen}
        >
          <label className={styles.filterControl}>
            <span>Kraj</span>
            <select name="region" defaultValue={region}>
              <option value="">Všetky kraje</option>
              {slovakRegions.map((item) => <option value={item} key={item}>{item}</option>)}
            </select>
          </label>
          <label className={styles.filterControl}>
            <span>Mesiac</span>
            <select name="mesiac" defaultValue={month}>
              <option value="">Všetky mesiace</option>
              {monthOptions.map((value) => <option value={value} key={value}>{monthLabel(value)}</option>)}
            </select>
          </label>
          <Link className={styles.resetFilters} href={typePathname}>Zrušiť filtre</Link>
        </PublicFilterDisclosure>
      </form>

      <div className={styles.resultBar}>
        <div className={styles.timeBar} role="group" aria-label="Obdobie podujatia">
          {([
            ["upcoming", "Najbližšie"],
            ["current", "Prebiehajúce"],
            ["past", "Ukončené"],
            ["all", "Všetky"],
          ] as const).map(([value, label]) => (
            <Link
              href={timeHref(value)}
              className={initialTime === value ? styles.activeTimeChip : styles.timeChip}
              aria-current={initialTime === value ? "page" : undefined}
              key={value}
            >
              {label}
            </Link>
          ))}
        </div>
        <div className={styles.resultCount} aria-live="polite">
          <strong>{filtered.length}</strong>
          <span>{filtered.length === 1 ? "podujatie" : "podujatí"}</span>
        </div>
      </div>

      {filtered.length ? (
        <div className={styles.eventList} data-event-list>
          {filtered.map((event) => <EventCard event={event} today={today} key={event.id} />)}
        </div>
      ) : (
        <div className={styles.emptyState}>
          <h2>{events.length ? "Nenašli sme zhodu" : "Prvé podujatia pripravujeme"}</h2>
          <p>{events.length ? "Upravte vyhľadávanie alebo filtre, prípadne sa vráťte k celému zoznamu." : "Kalendár je pripravený. Nové termíny sa tu objavia hneď po publikovaní v redakcii."}</p>
          {events.length > 0 && hasActiveFilters ? <Link href={typePathname}>Zobraziť celý zoznam</Link> : null}
        </div>
      )}
    </div>
  );
}
