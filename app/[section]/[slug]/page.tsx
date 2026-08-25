import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ArticleDetail } from "@/components/article-detail";
import { EventDetail } from "@/components/event-detail";
import { EventsPage } from "@/components/events-page";
import { PortalTopic } from "@/components/portal-topic";
import { getPublishedArticle, getPublishedArticles } from "@/lib/article-store";
import { buildArticleMetadata } from "@/lib/article-seo";
import { getPublishedEvent, getPublishedEvents } from "@/lib/event-store";
import { eventHref, eventTypeFromPortalSlug } from "@/lib/events";
import { articleHref, portalSections } from "@/lib/portal";
import { getManagedPortalSection, getManagedPortalSubpage } from "@/lib/section-store";
import { buildPageMetadata } from "@/lib/seo";
import { StructuredData } from "@/components/structured-data";
import { buildContentMetadata, eventSeoFallback, resolvedCanonical } from "@/lib/content-seo";
import { absoluteUrl, SITE_URL } from "@/lib/seo";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ section: string; slug: string }> };

export function generateStaticParams() {
  return portalSections.flatMap((section) => section.subpages
    .filter((subpage) => !subpage.href)
    .map((subpage) => ({ section: section.slug, slug: subpage.slug })));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { section, slug } = await params;
  const portalTopic = await getManagedPortalSubpage(section, slug);
  if (portalTopic) {
    return buildPageMetadata({
      title: `${portalTopic.subpage.label} – ${portalTopic.section.label}`,
      description: portalTopic.subpage.description,
      path: `/${portalTopic.section.slug}/${portalTopic.subpage.slug}`,
    });
  }

  if (!(await getManagedPortalSection(section))?.visible) return {};
  if (section === "podujatia") {
    const event = await getPublishedEvent(slug);
    if (event) {
      const fallback=eventSeoFallback(event.title,event.eventType,event.city);
      return buildContentMetadata({ seo:event.seo, fallbackTitle:fallback.title,
        fallbackDescription:fallback.description,
        path: eventHref(event),
        image: event.imageUrl || null,
        imageAlt: event.title,
      });
    }
  }
  const article = await getPublishedArticle(slug);
  if (!article) return {};
  return buildArticleMetadata(article);
}

export default async function PortalContentPage({ params }: Props) {
  const { section, slug } = await params;
  if (section === "recenzie" && slug === "vybava") redirect("/recenzie/postroje-a-vodidla");
  if (!(await getManagedPortalSection(section))?.visible) notFound();
  const portalTopic = await getManagedPortalSubpage(section, slug);
  if (section === "podujatia" && (slug === "kalendar" || eventTypeFromPortalSlug(slug))) {
    return <EventsPage events={await getPublishedEvents()} initialType={eventTypeFromPortalSlug(slug) ?? "Všetky"} />;
  }
  const articles = await getPublishedArticles();
  if (portalTopic) return <PortalTopic {...portalTopic} articles={articles} />;

  if (section === "podujatia") {
    const event = await getPublishedEvent(slug);
    if (event) {
      const canonical=resolvedCanonical(event.seo,eventHref(event));
      const location=event.region==="Online"?{"@type":"VirtualLocation",url:event.websiteUrl||canonical}:{"@type":"Place",name:event.venue||event.city,address:{"@type":"PostalAddress",streetAddress:event.address||undefined,addressLocality:event.city,addressRegion:event.region,addressCountry:"SK"}};
      const schema={"@context":"https://schema.org","@graph":[{"@type":"Event","@id":`${canonical}#event`,name:event.title,description:event.description||event.excerpt,startDate:`${event.startDate}${event.startTime?`T${event.startTime}:00`:""}`,endDate:event.endDate?`${event.endDate}${event.endTime?`T${event.endTime}:00`:""}`:undefined,eventStatus:event.cancelled?"https://schema.org/EventCancelled":"https://schema.org/EventScheduled",eventAttendanceMode:event.region==="Online"?"https://schema.org/OnlineEventAttendanceMode":"https://schema.org/OfflineEventAttendanceMode",location,organizer:{"@type":"Organization",name:event.organizer,url:event.websiteUrl||undefined},image:event.imageUrl?[absoluteUrl(event.imageUrl)]:undefined,url:canonical},{"@type":"BreadcrumbList","@id":`${canonical}#breadcrumb`,itemListElement:[{"@type":"ListItem",position:1,name:"Domov",item:SITE_URL},{"@type":"ListItem",position:2,name:"Podujatia",item:`${SITE_URL}/podujatia`},{"@type":"ListItem",position:3,name:event.title,item:canonical}]}]};
      return <><StructuredData value={schema}/><EventDetail event={event} /></>;
    }
  }

  const article = await getPublishedArticle(slug);
  if (!article) notFound();
  const canonical = articleHref(article);
  if (canonical !== `/${section}/${slug}`) redirect(canonical);

  const sameCategory = articles.filter((item) => item.slug !== article.slug && (
    section === "novinky" ? item.newsCategory === article.newsCategory : item.category === article.category
  ));
  const others = articles.filter((item) => item.slug !== article.slug && !sameCategory.some((related) => related.slug === item.slug));
  return <ArticleDetail article={article} related={[...sameCategory, ...others].slice(0, 3)} />;
}
