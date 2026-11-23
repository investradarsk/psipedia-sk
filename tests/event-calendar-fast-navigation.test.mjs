import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const client = readFileSync(new URL("../components/event-calendar.tsx", import.meta.url), "utf8");
const calendarRoute = readFileSync(
  new URL("../app/api/public/events/calendar/route.ts", import.meta.url),
  "utf8",
);
const dayRoute = readFileSync(
  new URL("../app/api/public/events/calendar/day/route.ts", import.meta.url),
  "utf8",
);
const store = readFileSync(new URL("../lib/event-store.ts", import.meta.url), "utf8");
const backLink = readFileSync(
  new URL("../components/events-return-link.tsx", import.meta.url),
  "utf8",
);

test("selecting a day preserves the month and listing and fetches only its 12 bounded previews", () => {
  const dayBranch = client.slice(
    client.indexOf("if (sameMonth && !pending && !loadError)"),
    client.indexOf("    const calendarOnly = sameListing && !pending && !loadError && !next.day;"),
  );
  assert.match(dayBranch, /setData\(\(current\) => \(\{ \.\.\.current, calendarEvents:/);
  assert.match(dayBranch, /dayEndpoint\.pathname \+= "\/day"/);
  assert.match(dayBranch, /if \(\s*!next\.day \|\|/);
  assert.match(dayBranch, /cacheRef\.current\.get\(key\)/);
  assert.doesNotMatch(dayBranch, /setPending\(true\)/);
  assert.match(client, /requestRef\.current\?\.abort\(\)/);
  assert.match(dayRoute, /getPublicEventDayPreview\(/);
  assert.match(dayRoute, /calendarMonthDays\(month\)\.some/);
  assert.match(dayRoute, /Cache-Control": "private, no-store"/);
  assert.match(store, /export async function getPublicEventDayPreview/);
  assert.match(store, /ORDER BY \$\{sql\.order\} LIMIT 12/);
});

test("month-only requests preserve the current filtered listing and avoid refetching counts", () => {
  assert.match(client, /const calendarOnly = sameListing && !pending && !loadError && !next\.day;/);
  assert.match(client, /endpoint\.searchParams\.set\("calendarOnly", "1"\)/);
  assert.match(
    client,
    /\{\s*\.\.\.data,\s*calendarEvents: received\.calendarEvents,\s*calendarSummaries: received\.calendarSummaries,?\s*\}/,
  );
  assert.match(calendarRoute, /if \(raw\.calendarOnly === "1"\)/);
  assert.ok(
    calendarRoute.indexOf('if (raw.calendarOnly === "1")') <
      calendarRoute.indexOf("getPublishedEventListing(filters)"),
  );
  assert.match(store, /const \[rows, dayEvents\] = await Promise\.all\(/);
  assert.match(client, /window\.history\.pushState/);
  assert.match(client, /window\.addEventListener\("popstate", restore\)/);
});

test("calendar responses are cancellable, short-lived and bounded in browser cache", () => {
  assert.match(client, /new AbortController\(\)/);
  assert.match(client, /signal: controller\.signal/);
  assert.match(client, /cacheRef\.current\.size > 24/);
  assert.match(client, /120_000/);
  assert.match(client, /setPendingDay\(true\)/);
  assert.match(client, /aria-busy=\{pending \|\| pendingDay\}/);
});

test("browser back uses latest state and detail return remembers the selected day", () => {
  assert.match(client, /const navigateRef = useRef\(navigate\)/);
  assert.match(client, /navigateRef\.current = navigate/);
  assert.match(client, /void navigateRef\.current\(/);
  assert.match(client, /rememberEventsListing\(window\.location\.pathname/);
  assert.match(backLink, /export function rememberEventsListing\(href: string\)/);
});

test("failed day preview does not hide the main event listing", () => {
  assert.match(client, /setDayLoadError\("Podujatia sa nepodarilo načítať/);
  assert.match(client, /dayLoadError \|\| loadError/);
});

test("calendar-only navigation preserves the listing page and restores it from history", () => {
  assert.match(client, /page: initialFilters\.page/);
  assert.match(
    client,
    /const nextPage = parseEventListing\(\{\s*strana: target\.searchParams\.get\("strana"\) \?\? undefined,?\s*\}\)\.page/,
  );
  assert.match(client, /view\.page === nextPage/);
  assert.match(client, /setView\(\{ \.\.\.next, page: nextPage \}\)/);
  assert.match(client, /else if \(view\.page > 1\) params\.set\("strana", String\(view\.page\)\)/);
  assert.match(client, /if \(state\.page > 1\) params\.set\("strana", String\(state\.page\)\)/);
});

test("calendar retries failed data instead of reusing an earlier month or skipping the same day", async () => {
  const { default: ts } = await import("typescript");
  const source = ts.createSourceFile("event-calendar.tsx", client, ts.ScriptTarget.ESNext, true);
  let navigate;
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === "navigate") {
      navigate = node.getText(source);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(navigate);
  const run = new Function("env", `with (env) { ${ts.transpile(navigate)}; return navigate; }`);
  const view = {
    month: "2026-11",
    filterMonth: "",
    page: 2,
    time: "all",
    type: "Všetky",
    day: "2026-11-23",
  };
  for (const [loadError, dayLoadError, path] of [
    ["Failed month", "", "/api/public/events/calendar"],
    ["", "Failed day", "/api/public/events/calendar/day"],
  ]) {
    const requests = [];
    const noop = () => {};
    const data = {
      events: [],
      listing: { page: 2 },
      calendarEvents: [],
      calendarSummaries: loadError ? [] : [{ date: view.day, count: 1 }],
    };
    const navigate = run({
      view,
      data,
      loadError,
      dayLoadError,
      pending: false,
      pendingDay: false,
      cacheRef: { current: new Map() },
      requestRef: { current: null },
      window: { location: new URL("https://psipedia.sk/podujatia") },
      rememberEventsListing: noop,
      parseEventListing: ({ strana }) => ({ page: Number(strana) }),
      setView: noop,
      setLoadError: noop,
      setDayLoadError: noop,
      setPendingDay: noop,
      setPendingCalendarOnly: noop,
      setPending: noop,
      setData: noop,
      remember: noop,
      fetch: async (url) => {
        requests.push(new URL(url));
        return { ok: true, json: async () => data };
      },
    });
    await navigate(`/podujatia?strana=2&den=${view.day}`, view, false);
    assert.deepEqual(
      requests.map((url) => url.pathname),
      [path],
    );
    assert.equal(requests[0].searchParams.get("strana"), "2");
  }
});
