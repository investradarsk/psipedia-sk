import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StructuredData } from "@/components/structured-data";
import { EventsPage as EventsListingPage } from "@/components/events-page";
import { PortalHub } from "@/components/portal-hub";
import { NewsHub } from "@/components/news-hub";
import { getAllPublishedArticleSummaries, getPublishedArticleSummaries } from "@/lib/article-store";
import { getPublishedEvents } from "@/lib/event-store";
import { eventHref, eventTimeFilterFromParam } from "@/lib/events";
import { buildCollectionPageJsonLd } from "@/lib/listing-seo";
import { portalSections, type ArticlePortalSection } from "@/lib/portal";
import { getManagedPortalSection, listManagedPortalSections } from "@/lib/section-store";
import { buildPageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

const NOVINKY_DESCRIPTION = "Výber príbehov, zaujímavostí, výskumu a užitočných tém zo sveta psov.";

type Props = { params: Promise<{ section: string }>; searchParams: Promise<{ termin?: string | string[] }> };
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
  const description = slug === "novinky" ? NOVINKY_DESCRIPTION : section.description;
  return buildPageMetadata({
    title: section.label,
    description,
    path: `/${section.slug}`,
  });
}

export default async function PortalSectionPage({ params, searchParams }: Props) {
  const { section: slug } = await params;
  const [section, allSections, articles, events] = await Promise.all([
    getManagedPortalSection(slug),
    listManagedPortalSections(),
    slug === "podujatia" ? Promise.resolve([]) : slug === "novinky" ? getAllPublishedArticleSummaries({ portalSection: "novinky" }) : getPublishedArticleSummaries({ portalSection: slug as ArticlePortalSection, limit: 120 }),
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
  if (slug === "novinky") return <NewsHub articles={articles} section={section} />;
  if (slug === "podujatia") return <EventsPage events={eventList} section={section} schema={eventSchema} initialTime={eventTimeFilterFromParam((await searchParams).termin)} />;
  return <PortalHub section={section} allSections={allSections.filter((item) => item.visible)} articles={articles} events={events} />;
}
