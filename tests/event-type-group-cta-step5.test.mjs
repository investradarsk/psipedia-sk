import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("every event type has an actual canonical category URL", () => {
  const source = read("lib/events.ts");
  for (const [type, slug] of Object.entries({
    "Výstava": "vystavy",
    "Preteky": "preteky",
    "Seminár": "seminare",
    "Tréning": "treningy",
    "Stretnutie": "stretnutia",
    "Iné": "dalsie",
  })) {
    assert.ok(source.includes(`${type}: "${slug}"`), `Missing real category route: ${type}`);
  }
  assert.match(source, /export function eventTypePortalHref\(eventType: EventType\)/);
});

test("default grouped listing puts exactly one browse CTA after each visible type block", () => {
  const listing = read("components/event-listing-results.tsx");
  const css = read("components/events-public.module.css");
  assert.match(listing, /const groupedByType = eventTypeBatchGroupingEnabled\(f\)/);
  assert.match(listing, /events\.map\(\(event, index\) =>/);
  assert.match(listing, /groupedByType && \(index === 0 \|\| events\[index - 1\]\?\.eventType !== event\.eventType\)/);
  assert.match(listing, /groupedByType && \(index === events\.length - 1 \|\| events\[index \+ 1\]\?\.eventType !== event\.eventType\)/);
  assert.match(listing, /data-event-type-cta=\{event\.eventType\}/);
  assert.match(listing, /href=\{\`\$\{eventTypePortalHref\(event\.eventType\) \?\? "\/podujatia"\}#events-list\`\}/);
  assert.match(listing, /variant="tertiary"/);
  assert.match(listing, /event\.eventType === "Iné"[\s\S]*?"ostatné podujatia"/);
  assert.match(listing, /eventTypePresentation\[event\.eventType\]\.label\.toLocaleLowerCase\("sk"\)/);
  assert.match(css, /\.eventTypeGroupFooter/);
  assert.match(css, /\.eventTypeGroupFooter :global\(\[data-public-action\]\)/);
});

test("type CTAs stay separate from the actual event link, filters and pagination", () => {
  const listing = read("components/event-listing-results.tsx");
  const start = listing.indexOf('<div className={`${styles.cardGrid} ${directoryStyles.listRows}`} data-event-list>');
  const end = listing.indexOf("<PublicPagination", start);
  assert.ok(start >= 0 && end > start);
  const section = listing.slice(start, end);
  assert.ok(section.indexOf("<EventCard") < section.indexOf("data-event-type-cta"));
  assert.ok(section.indexOf("data-event-type-cta") < section.indexOf("</Fragment>"));
  assert.match(listing, /<PublicPagination/);
  assert.match(listing, /type="radio"/);
  assert.match(listing, /Zobraziť výsledky/);
});
