import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("S-22 event types are inside the calendar card, with the approved two-column mobile legend", () => {
  const calendar = read("components/event-calendar.tsx");
  const styles = read("components/events-public.module.css");
  const legend = calendar.indexOf("<nav className={styles.calendarLegend}");
  const end = calendar.indexOf("</section>", legend);
  const layoutEnd = calendar.indexOf("{afterCalendar}", legend);
  assert.ok(legend > calendar.indexOf('className={styles.monthCalendar}'));
  assert.ok(end > legend && layoutEnd > end);
  assert.match(styles, /\.calendarLayout \.calendarLegend \{[\s\S]*?grid-template-columns: repeat\(3/);
  assert.match(styles, /@media \(max-width: 520px\)[\s\S]*?\.calendarLayout \.calendarLegend \{ grid-template-columns: repeat\(2/);
  assert.match(calendar, /data-events-calendar-layout/);
});

test("S-23 related events use the exact canonical EventCard grid variant as listing", () => {
  const listing = read("components/event-listing-results.tsx");
  const detail = read("components/event-detail.tsx");
  assert.match(listing, /<EventCard key=\{event\.id\} event=\{event\} today=\{today\} variant="grid"/);
  assert.match(detail, /<EventCard key=\{item\.id\} event=\{item\} variant="grid"/);
  assert.match(detail, /styles\.relatedList\} \$\{styles\.cardGrid/);
  assert.match(detail, /data-event-facts/);
  assert.doesNotMatch(detail, /<DetailFactsCard/);
  assert.match(detail, /<EventsBackLink fallbackHref=/);
  assert.match(detail, /<EventMarkdown value=\{event\.description\}/);
  assert.match(detail, /<EventMarkdown value=\{event\.practicalInfo\}/);
});

test("S-24 Help root renders five previews then ONE common action after cards", () => {
  const overview = read("components/help-overview.tsx");
  const root = read("app/pomoc-psom/page.tsx");
  const footer = overview.indexOf("overviewSectionFooter");
  const items = overview.indexOf("section.items.slice(0, 5)");
  assert.ok(items > 0 && footer > items);
  assert.doesNotMatch(overview.slice(overview.indexOf("id={`help-overview-"), items), /action=\{/);
  assert.match(overview, /section\.items\.length > 0 && \(/);
  assert.match(root, /\.slice\(0, 5\)/);
  assert.match(overview, /<PublicHelpCategoryNav/);
  assert.match(overview, /<PublicHelpPhotoBanner/);
});

test("S-24 Help banners and listing cards have one reusable visual surface", () => {
  const helpBanners = read("components/public-visual-system/public-help-banner.tsx");
  const photo = read("components/public-visual-system/public-photo-callout.tsx");
  const category = read("components/public-visual-system/public-help-category-nav.tsx");
  assert.match(helpBanners, /PublicPhotoCallout/);
  assert.match(photo, /data-public-photo-callout/);
  assert.match(category, /data-public-category-navigation/);
  for (const file of [
    "components/help-overview.tsx",
    "components/help-card.tsx",
    "components/adoption-catalog.tsx",
    "components/lost-found-dogs-page.tsx",
  ]) assert.match(read(file), /<PublicHelpProfileCard/);
});

test("S-25 adoption keeps specialized filters and verified dates without a redundant back arrow", () => {
  const catalog = read("components/adoption-catalog.tsx");
  const detail = read("components/adoption-detail.tsx");
  const lost = read("components/lost-found-dogs-page.tsx");
  assert.match(catalog, /<PublicFilterDisclosure/);
  assert.match(lost, /<PublicFilterDisclosure/);
  for (const name of ["plemeno", "vek", "pohlavie", "velkost", "kraj", "stav"]) {
    assert.ok(catalog.includes('name="' + name + '"'), name);
  }
  assert.match(detail, /verifiedAt && <p className=\{styles\.detailVerification\}/);
  assert.match(detail, /stale && <div className=\{styles\.staleNotice\}/);
  assert.doesNotMatch(detail, /Späť na psy na adopciu|verificationCard/);
  assert.match(detail, /Kontaktovať organizáciu/);
  assert.match(detail, /<PublicPhotoGallery/);
});
