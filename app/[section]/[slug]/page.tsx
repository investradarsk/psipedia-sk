import type { Metadata } from "next";
import { notFound, permanentRedirect, redirect } from "next/navigation";
import { ArticleDetail } from "@/components/article-detail";
import { NewsHub } from "@/components/news-hub";
import { EventDetail } from "@/components/event-detail";
import { EventsPage } from "@/components/events-page";
import { PortalTopic } from "@/components/portal-topic";
import { getAllPublishedArticleSummaries, getPublishedArticle, getPublishedArticleAuthorProfile, getPublishedArticleSummaries } from "@/lib/article-store";
import { getArticleMagazineData } from "@/lib/article-magazine";
import { getArticleDiscoveryData } from "@/lib/article-discovery";
import { buildArticleMetadata } from "@/lib/article-seo";
import { sanitizePublicArticleContent } from "@/lib/article-content-remediation";
import { getPublishedEvent, getPublishedEvents, getUpcomingEvents } from "@/lib/event-store";
import { buildPublicEventPresentation, eventHref, eventMonthFilterFromParam, eventRegionFilterFromParam, eventSearchQueryFromParam, eventTimeFilterFromParam, eventTypeFromPortalSlug, eventTypeListingSeo, selectRelatedEvents } from "@/lib/events";
import { buildEventJsonLd } from "@/lib/event-schema";
import { articleHref, portalSections, type ArticlePortalSection } from "@/lib/portal";
import { getNewsCategory } from "@/lib/news";
import { getPublishedReviewSummaries, portalSubpageHasEditorialValue } from "@/lib/reviews";
import { getManagedPortalSection, getManagedPortalSubpage } from "@/lib/section-store";
import { buildListingPageMetadata, buildCollectionPageJsonLd, resolveListingIndexPolicy } from "@/lib/listing-seo";
import { StructuredData } from "@/components/structured-data";
import { buildContentMetadata, eventSeoFallback, resolvedCanonical } from "@/lib/content-seo";

import { legacyArticleRedirectPath } from "@/lib/legacy-public-redirects";
import { getPublicMapItemsForEntity } from "@/lib/map-query";
import { getPublicMapRuntime } from "@/lib/public-map-runtime";
import { listRelatedBreedsForArticle } from "@/lib/content-relations";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ section: string; slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

function scalar(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function generateStaticParams() {
  return portalSections.flatMap((section) => section.subpages
    .filter((subpage) => !subpage.href)
    .map((subpage) => ({ section: section.slug, slug: subpage.slug })));
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { section, slug } = await params;
  const rawSearchParams = await searchParams;
  if (section === "podujatia" && slug === "kalendar") {
    return {
      title: "Podujatia",
      description: "Kalendár výstav, pretekov, seminárov, tréningov a stretnutí.",
      alternates: { canonical: "/podujatia" },
      robots: { index: false, follow: true },
    };
  }
  const eventType = section === "podujatia" ? eventTypeFromPortalSlug(slug) : null;
  if (eventType) {
    const copy = eventTypeListingSeo(eventType);
    return buildListingPageMetadata({
      title: copy.title,
      description: copy.description,
      path: `/podujatia/${slug}`,
      searchParams: rawSearchParams,
    });
  }
  const portalTopic = await getManagedPortalSubpage(section, slug);
  if (portalTopic) {
    const metadata = buildListingPageMetadata({
      title: portalTopic.subpage.seoTitle || `${portalTopic.subpage.label} – ${portalTopic.section.label}`,
      description: portalTopic.subpage.metaDescription || portalTopic.subpage.description,
      path: `/${portalTopic.section.slug}/${portalTopic.subpage.slug}`,
      searchParams: rawSearchParams,
    });
    if (section === "recenzie" && !portalSubpageHasEditorialValue(portalTopic.subpage)) {
      const reviews = await getPublishedReviewSummaries(slug, 1);
      if (!reviews.length) {
        return { ...metadata, robots: { index: false, follow: true } };
      }
    }
    return metadata;
  }

  if (!(await getManagedPortalSection(section))?.visible) return {};
  if (section === "podujatia") {
    const storedEvent = await getPublishedEvent(slug);
    if (storedEvent) {
      const event = buildPublicEventPresentation(storedEvent);
      const fallback = eventSeoFallback(event.title, event.eventType, event.city);
      return buildContentMetadata({ seo: event.seo, fallbackTitle: fallback.title,
        fallbackDescription: fallback.description,
        path: eventHref(event),
        image: event.imageUrl || null,
        imageAlt: event.title,
      });
    }
  }
  const storedArticle = await getPublishedArticle(slug);
  if (!storedArticle) return {};
  const article = sanitizePublicArticleContent(storedArticle);
  return buildArticleMetadata(article);
}

export default async function PortalContentPage({ params, searchParams }: Props) {
  const { section, slug } = await params;
  const legacyRedirect = legacyArticleRedirectPath(slug);
  if (legacyRedirect) permanentRedirect(legacyRedirect);
  if (section === "recenzie" && slug === "vybava") redirect("/recenzie/postroje-a-vodidla");
  const eventType = section === "podujatia" ? eventTypeFromPortalSlug(slug) : null;
  if (eventType) {
    const rawSearchParams = await searchParams;
    const [managedSection, events] = await Promise.all([
      getManagedPortalSection(section),
      getPublishedEvents(),
    ]);
    if (!managedSection?.visible) notFound();
    const path = `/podujatia/${slug}`;
    const policy = resolveListingIndexPolicy(path, rawSearchParams);
    const copy = eventTypeListingSeo(eventType);
    const schema = policy.kind === "clean" ? buildCollectionPageJsonLd({
      name: copy.title,
      description: copy.description,
      path,
      breadcrumbs: [
        { name: "Domov", path: "/" },
        { name: "Podujatia", path: "/podujatia" },
        { name: copy.title, path },
      ],
      items: events
        .filter((event) => event.eventType === eventType)
        .map((event) => ({ name: event.title, path: eventHref(event) })),
    }) : null;
    return <>{schema && <StructuredData value={schema} />}<EventsPage events={events} initialType={eventType} initialTime={eventTimeFilterFromParam(rawSearchParams.termin)} initialQuery={eventSearchQueryFromParam(rawSearchParams.q)} initialRegion={eventRegionFilterFromParam(rawSearchParams.region)} initialMonth={eventMonthFilterFromParam(rawSearchParams.mesiac)} /></>;
  }
  const managedSection = await getManagedPortalSection(section);
  if (!managedSection?.visible) notFound();
  if (section === "podujatia" && slug === "kalendar") {
    const rawSearchParams = await searchParams;
    return <EventsPage events={await getPublishedEvents()} initialTime={eventTimeFilterFromParam(rawSearchParams.termin)} initialQuery={eventSearchQueryFromParam(rawSearchParams.q)} initialRegion={eventRegionFilterFromParam(rawSearchParams.region)} initialMonth={eventMonthFilterFromParam(rawSearchParams.mesiac)} />;
  }
  const portalTopic = await getManagedPortalSubpage(section, slug);
  if (portalTopic && section === "novinky") {
    const newsCategory = getNewsCategory(slug);
    if (newsCategory) {
      return <NewsHub articles={await getAllPublishedArticleSummaries({ portalSection: "novinky" })} section={portalTopic.section} activeCategory={newsCategory.slug} landingPath="/clanky" />;
    }
  }
  if (portalTopic && section === "recenzie") {
    return <PortalTopic {...portalTopic} articles={await getPublishedReviewSummaries(slug, 120)} />;
  }
  if (portalTopic) return <PortalTopic {...portalTopic} articles={await getPublishedArticleSummaries({ portalSection: portalTopic.section.slug as ArticlePortalSection, limit: 120 })} />;

  if (section === "podujatia") {
    const storedEvent = await getPublishedEvent(slug);
    if (storedEvent) {
      const event = buildPublicEventPresentation(storedEvent);
      const canonical = resolvedCanonical(event.seo, eventHref(event));
      const schema = buildEventJsonLd(event, canonical);
      const [related, publicMap] = await Promise.all([
        getUpcomingEvents(8).then((events) => selectRelatedEvents(event, events)),
        getPublicMapItemsForEntity({ entityType: "MANAGED_EVENT", entityId: event.id })
          .catch((error) => {
            console.error("Public event map read failed", {
              eventId: event.id,
              error: error instanceof Error ? error.message : String(error),
            });
            return { items: [] };
          }),
      ]);
      const publicMapPresentation = { ...publicMap, ...getPublicMapRuntime() };
      return <><StructuredData value={schema} /><EventDetail event={event} related={related} publicMap={publicMapPresentation} /></>;
    }
  }

  const storedArticle = await getPublishedArticle(slug);
  if (!storedArticle) notFound();
  const article = sanitizePublicArticleContent(storedArticle);
  const canonical = articleHref(article);
  if (canonical !== `/${section}/${slug}`) redirect(canonical);

  const [magazine, discovery, authorProfile, relatedBreeds] = await Promise.all([
    getArticleMagazineData(article),
    getArticleDiscoveryData(storedArticle),
    getPublishedArticleAuthorProfile(article),
    listRelatedBreedsForArticle(article.slug).catch((error) => {
      console.error("Public article breed relations read failed", {
        articleSlug: article.slug,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }),
  ]);
  return <ArticleDetail article={article} magazine={magazine} discovery={discovery} authorProfile={authorProfile} relatedBreeds={relatedBreeds} portalSection={section === "recenzie" ? managedSection : undefined} />;
}
