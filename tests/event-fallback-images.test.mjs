import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { hasHomepageRealImage, HOMEPAGE_REAL_IMAGE_SQL } from "../lib/homepage-media.ts";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  getEventFallbackImage,
  getEventFallbackSrcSet,
  getEventOwnImage,
  eventTypePresentation,
} from "../lib/event-type-presentation.ts";
import { EventImage } from "../components/event-image.tsx";

for (const [type, name] of Object.entries({
  Výstava: "vystavy",
  Preteky: "preteky",
  Seminár: "seminare",
  Tréning: "treningy",
  Stretnutie: "stretnutia",
  Iné: "ostatne",
})) {
  test(`${type}: local renderable WebP and deterministic SSR fallback`, () => {
    const path = getEventFallbackImage(type);
    assert.equal(path, `/images/events/defaults/${name}.webp`);
    assert.ok(existsSync("public" + path));
    const bytes = readFileSync("public" + path);
    assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
    assert.equal(bytes.toString("ascii", 8, 12), "WEBP");
    const html = renderToStaticMarkup(
      React.createElement(EventImage, {
        imageUrl: null,
        eventType: type,
        alt: "Event",
        loading: "lazy",
      }),
    );
    assert.ok(html.includes(`src="${path}"`));
    assert.match(html, /data-event-image-source="fallback"/);
    assert.match(html, /alt="Ilustračný obrázok/);
    assert.doesNotMatch(html, /data-smart-image-fit/);
    assert.equal(eventTypePresentation[type].fallbackImage, path);
    assert.equal(
      getEventFallbackSrcSet(type),
      `${path.replace(".webp", "-640.webp")} 640w, ${path.replace(".webp", "-960.webp")} 960w, ${path} 1280w`,
    );
    for (const width of [640, 960]) {
      const file = "public" + path.replace(".webp", `-${width}.webp`);
      assert.ok(existsSync(file));
      assert.equal(readFileSync(file).toString("ascii", 8, 12), "WEBP");
    }
    assert.match(html, /srcSet=/);
    assert.match(html, /sizes=/);
  });
}
test("own photograph takes precedence, retains imageDisplay, removal and type changes derive from current data", () => {
  const render = (imageUrl, eventType = "Výstava") =>
    renderToStaticMarkup(
      React.createElement(EventImage, { imageUrl, eventType, mode: "contain", alt: "Own photo" }),
    );
  const own = render("/images/hero-labrador.webp");
  assert.match(own, /data-event-image-source="real"/);
  assert.match(own, /data-smart-image-fit="contain"/);
  assert.match(own, /alt="Own photo"/);
  assert.doesNotMatch(own, /defaults/);
  assert.match(render(null), /vystavy.webp/);
  assert.match(render(null, "Tréning"), /treningy.webp/);
  assert.match(render("  "), /vystavy.webp/);
  const canonical = render("/media/event-photo.webp");
  assert.match(canonical, /srcSet=/);
  assert.match(canonical, /event-photo.webp\?w=320/);
});
test("external event poster stays the preferred SSR image and is retried before illustration", () => {
  const poster = "https://www.nitradog.sk/wp-content/uploads/2026/09/banner-web-napis.jpg";
  const html = renderToStaticMarkup(
    React.createElement(EventImage, {
      imageUrl: poster,
      eventType: "Výstava",
      context: "detail",
      alt: "Oficiálny plagát",
    }),
  );
  assert.ok(html.includes(`src="${poster}"`));
  assert.match(html, /data-event-image-source="real"/);
  assert.doesNotMatch(html, /images\/events\/defaults/);

  const component = readFileSync("components/event-image.tsx", "utf8");
  assert.match(component, /stage === "primary"[\s\S]*?stage: "original"/);
  assert.match(component, /stage: "fallback"/);
  assert.match(component, /real && stage === "primary" \? responsiveMediaSrcSet/);
  assert.match(component, /referrerPolicy=\{remote && stage === "original" \? "no-referrer"/);
  const calendar = readFileSync("components/event-calendar.tsx", "utf8");
  assert.match(calendar, /<EventImage[\s\S]*?imageUrl=\{event\.imageUrl\}/);
});

test("external event detail can retry a blocked poster using its published event ID", () => {
  const url = "https://www.nitradog.sk/wp-content/uploads/2026/09/banner-web-napis.jpg";
  const html = renderToStaticMarkup(
    React.createElement(EventImage, { imageUrl: url, eventId: 173, eventType: "Výstava", context: "detail", alt: "Plagát" }),
  );
  // The official poster remains the first choice; the proxy is only for a
  // failure reported by the browser, not an unconditional network request.
  assert.match(html, /banner-web-napis\.jpg/);
  assert.match(html, /data-event-image-source="real"/);
  assert.doesNotMatch(html, /\/api\/public\/events\/image\/173/);
  const component = readFileSync("components/event-image.tsx", "utf8");
  assert.match(component, /stage === "original" && proxy/);
  assert.match(component, /stage: "proxy"/);
  assert.match(component, /stage: "fallback"/);
  assert.match(component, /referrerPolicy=\{remote \? "no-referrer"/);
  const detail = readFileSync("components/event-detail.tsx", "utf8");
  assert.match(detail, /eventId=\{event\.id\}/);
  const route = readFileSync("app/api/public/events/image/[id]/route.ts", "utf8");
  assert.match(route, /SELECT image_url FROM managed_events WHERE id = \? AND status = 'published'/);
  assert.match(route, /safeRemoteImageUrl\(row\.image_url\)/);
  assert.match(route, /downloadRemoteImage\(source\.toString\(\)\)/);
  assert.doesNotMatch(route, /request\.url.*searchParams|new URLSearchParams\(.*request/);
});

test("unsafe or invalid photo URLs select the fallback during SSR", () => {
  for (const value of [
    null,
    "",
    "  ",
    "javascript:alert(1)",
    "data:image/png;base64,x",
    "//external.test/x",
    "https://user:secret@example.test/x",
    "relative.jpg",
    "/bad\\path",
    "/bad\npath",
  ])
    assert.equal(getEventOwnImage(value), null);
  assert.equal(getEventOwnImage(" /media/own.webp "), "/media/own.webp");
  assert.equal(getEventOwnImage("https://example.test/a.webp"), "https://example.test/a.webp");
});
test("homepage shows published upcoming events with photographic fallback and preserves photo validation", () => {
  for (const type of Object.keys(eventTypePresentation))
    assert.equal(
      hasHomepageRealImage({ imageUrl: getEventFallbackImage(type), imageKey: null }),
      false,
    );
  const database = new DatabaseSync(":memory:");
  try {
    database.exec("CREATE TABLE events(image_url TEXT,image_key TEXT)");
    const insert = database.prepare("INSERT INTO events VALUES (?,?)");
    for (const type of Object.keys(eventTypePresentation))
      insert.run(getEventFallbackImage(type), null);
    insert.run("/media/event-photo.webp", "event-photo.webp");
    assert.equal(
      database
        .prepare(`SELECT COUNT(*) AS total FROM events WHERE ${HOMEPAGE_REAL_IMAGE_SQL}`)
        .get().total,
      1,
    );
  } finally {
    database.close();
  }
  const store = readFileSync("lib/event-store.ts", "utf8");
  const homepage = readFileSync("app/page.tsx", "utf8");
  assert.match(homepage, /getHomepageUpcomingEventsWithImages\(8\)/);
  const upcoming = store
    .slice(store.indexOf("export async function getHomepageUpcomingEventsWithImages"))
    .split("\nexport async function ")[0];
  assert.match(upcoming, /status = 'published'/);
  assert.match(upcoming, /cancelled = 0/);
  assert.doesNotMatch(upcoming, /HOMEPAGE_REAL_IMAGE_SQL/);
  assert.match(readFileSync("components/event-image.tsx", "utf8"), /getEventFallbackImage/);
  for (const file of [
    "app/page.tsx",
    "lib/event-store.ts",
    "lib/event-schema.ts",
    "app/[section]/[slug]/page.tsx",
  ])
    assert.doesNotMatch(
      readFileSync(file, "utf8"),
      /getEventFallbackImage|images\/events\/defaults/,
    );
});
