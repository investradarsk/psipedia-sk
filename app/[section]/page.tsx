import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { StructuredData } from "@/components/structured-data";
import { EventsPage as EventsListingPage } from "@/components/events-page";
import { PortalHub } from "@/components/portal-hub";
import { ReviewsHub, normalizeReviewsHubView } from "@/components/reviews-hub";
import { NewsHub } from "@/components/news-hub";
import { getAllPublishedArticleSummaries, getPublishedArticleSummaries } from "@/lib/article-store";
import { getPublishedEvents } from "@/lib/event-store";
import { listPublishedEshops } from "@/lib/eshop-ratings";
import { eventHref, eventTimeFilterFromParam } from "@/lib/events";
import { buildCollectionPageJsonLd } from "@/lib/listing-seo";
import { listLatestPublicProfileReviews, type ProfileReviewReadDatabase } from "@/lib/profile-review-read";
import { portalSections, type ArticlePortalSection } from "@/lib/portal";
import { getManagedPortalSection, listManagedPortalSections } from "@/lib/section-store";
import { buildPageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

const NOVINKY_DESCRIPTION = "Výber príbehov, zaujímavostí, výskumu a užitočných tém zo sveta psov.";
const REVIEWS_DESCRIPTION = "Redakčné testy produktov a reálne skúsenosti používateľov so službami pre psov na jednom mieste.";

type Props = { params: Promise<{ section: string }>; searchParams: Promise<{ termin?: string | string[]; typ?: string | string[] }> };
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

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { section: slug } = await params;
  const section = await getManagedPortalSection(slug);
  if (!section?.visible) return {};
  if (slug === "novinky") {
    return buildPageMetadata({
      title: "Novinky zo sveta psov",
      description: NOVINKY_DESCRIPTION,
      path: "/clanky",
    });
  }
  const description = slug === "recenzie" ? REVIEWS_DESCRIPTION : section.description;
  return buildPageMetadata({
    title: section.label,
    description,
    path: `/${section.slug}`,
  });
}

export default async function PortalSectionPage({ params, searchParams }: Props) {
  const { section: slug } = await params;
  if (slug === "novinky") permanentRedirect("/clanky");
  const [section, allSections, articles, events] = await Promise.all([
    getManagedPortalSection(slug),
    listManagedPortalSections(),
    slug === "podujatia" ? Promise.resolve([]) : getPublishedArticleSummaries({ portalSection: slug as ArticlePortalSection, limit: 120 }),
    slug === "podujatia" ? getPublishedEvents() : Promise.resolve(undefined),
  ]);
  if (!section?.visible) notFound();
  const eventList = events ?? [];
  const rawSearchParams = slug === "podujatia" ? await searchParams : {};
  const hasQuery = Object.values(rawSearchParams).some((value) => Array.isArray(value) ? value.some(Boolean) : Boolean(value));
  const eventSchema = slug !== "podujatia" ? null : hasQuery ? null : buildCollectionPageJsonLd({
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
    const raw = await searchParams;
    return <ReviewsHub section={section} articles={articles} profileReviews={profileReviews} eshops={eshops} view={normalizeReviewsHubView(scalar(raw.typ))} />;
  }
  if (slug === "podujatia") return <EventsPage events={eventList} section={section} schema={eventSchema} initialTime={eventTimeFilterFromParam((await searchParams).termin)} />;
  return <PortalHub section={section} allSections={allSections.filter((item) => item.visible)} articles={articles} events={events} />;
}
