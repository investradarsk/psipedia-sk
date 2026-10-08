import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { StructuredData } from "@/components/structured-data";
import { EventsPage as EventsListingPage } from "@/components/events-page";
import { PortalHub } from "@/components/portal-hub";
import { ReviewsHub, normalizeReviewsHubView } from "@/components/reviews-hub";
import { getPublishedArticleSummaries } from "@/lib/article-store";
import { getPublishedEvents, getPublishedEventsInMonth } from "@/lib/event-store";
import { listPublishedEshops } from "@/lib/eshop-ratings";
import { bratislavaDateKey, eventHref, eventMonthFilterFromParam, eventRegionFilterFromParam, eventSearchQueryFromParam, eventTimeFilterFromParam } from "@/lib/events";
import { buildCollectionPageJsonLd, buildListingPageMetadata, coreLandingSeoFallback, resolveListingIndexPolicy } from "@/lib/listing-seo";
import { listLatestPublicProfileReviews, type ProfileReviewReadDatabase } from "@/lib/profile-review-read";
import { portalSections, type ArticlePortalSection } from "@/lib/portal";
import { resolveCalendarMonth } from "@/lib/event-calendar-view";
import { getManagedPortalSection, listManagedPortalSections } from "@/lib/section-store";

export const dynamic = "force-dynamic";

const NOVINKY_DESCRIPTION = "Výber príbehov, zaujímavostí, výskumu a užitočných tém zo sveta psov.";
const REVIEWS_DESCRIPTION = "Redakčné testy produktov a reálne skúsenosti používateľov so službami pre psov na jednom mieste.";

type Props = { params: Promise<{ section: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
type ReviewBindings = { DB?: ProfileReviewReadDatabase };

function publicReviewDatabase() {
  const database = (env as unknown as ReviewBindings).DB;
  return database && typeof database.prepare === "function" ? database : null;
}

function scalar(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
type EventsPageProps = Parameters<typeof EventsListingPage>[0] & { schema: ReturnType<typeof buildCollectionPageJsonLd> | null };

function EventsPage({ schema, ...props }: EventsPageProps) {
  return <>{schema && <StructuredData value={schema} />}<EventsListingPage {...props} /></>;
}

export function generateStaticParams() {
  return portalSections.map((section) => ({ section: section.slug }));
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { section: slug } = await params;
  const section = await getManagedPortalSection(slug);
  if (!section?.visible) return {};
  const rawSearchParams = await searchParams;
  if (slug === "novinky") {
    return buildListingPageMetadata({
      title: "Novinky zo sveta psov",
      description: NOVINKY_DESCRIPTION,
      path: "/clanky",
      searchParams: rawSearchParams,
    });
  }
  if (slug === "podujatia") {
    const landingSeo = coreLandingSeoFallback("events");
    return buildListingPageMetadata({
      title: landingSeo.title,
      description: landingSeo.description,
      path: "/podujatia",
      searchParams: rawSearchParams,
    });
  }
  const description = slug === "recenzie" ? REVIEWS_DESCRIPTION : section.description;
  return buildListingPageMetadata({
    title: section.label,
    description,
    path: `/${section.slug}`,
    searchParams: rawSearchParams,
  });
}

export default async function PortalSectionPage({ params, searchParams }: Props) {
  const { section: slug } = await params;
  if (slug === "novinky") permanentRedirect("/clanky");
  const rawSearchParams = await searchParams;
  const calendarMonth = resolveCalendarMonth(eventMonthFilterFromParam(rawSearchParams.kalendar), eventMonthFilterFromParam(rawSearchParams.mesiac), bratislavaDateKey());
  const [section, allSections, articles, events, monthEvents] = await Promise.all([
    getManagedPortalSection(slug),
    listManagedPortalSections(),
    slug === "podujatia" ? Promise.resolve([]) : getPublishedArticleSummaries({ portalSection: slug as ArticlePortalSection, limit: 120 }),
    slug === "podujatia" ? getPublishedEvents() : Promise.resolve(undefined),
    slug === "podujatia" ? getPublishedEventsInMonth(calendarMonth) : Promise.resolve(undefined),
  ]);
  if (!section?.visible) notFound();
  const eventList = events ?? [];
  const listingPolicy = resolveListingIndexPolicy(`/${section.slug}`, rawSearchParams);
  const eventSchema = slug !== "podujatia" || listingPolicy.kind !== "clean" ? null : buildCollectionPageJsonLd({
    name: section.label,
    description: section.description,
    path: "/podujatia",
    breadcrumbs: [
      { name: "Domov", path: "/" },
      { name: section.label, path: "/podujatia" },
    ],
    items: eventList.map((event) => ({ name: event.title, path: eventHref(event) })),
  });
  if (slug === "recenzie") {
    const database = publicReviewDatabase();
    const [profileReviews, eshops] = await Promise.all([
      database
        ? listLatestPublicProfileReviews(database, 8).catch((error) => {
            console.error("Public reviews hub feed read failed", {
              error: error instanceof Error ? error.message : String(error),
            });
            return [];
          })
        : Promise.resolve([]),
      listPublishedEshops().catch((error) => {
        console.error("Public e-shop review hub read failed", {
          error: error instanceof Error ? error.message : String(error),
        });
        return [];
      }),
    ]);
    return <ReviewsHub section={section} articles={articles} profileReviews={profileReviews} eshops={eshops} view={normalizeReviewsHubView(scalar(rawSearchParams.typ))} />;
  }
  if (slug === "podujatia") return <EventsPage events={eventList} calendarEvents={monthEvents ?? []} initialCalendarMonth={calendarMonth} initialDay={scalar(rawSearchParams.den) ?? ""} section={section} schema={eventSchema} initialTime={eventTimeFilterFromParam(rawSearchParams.termin)} initialQuery={eventSearchQueryFromParam(rawSearchParams.q)} initialRegion={eventRegionFilterFromParam(rawSearchParams.region)} initialMonth={eventMonthFilterFromParam(rawSearchParams.mesiac)} />;
  return <PortalHub section={section} allSections={allSections.filter((item) => item.visible)} articles={articles} events={events} />;
}
