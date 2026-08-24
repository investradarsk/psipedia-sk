import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ArticleDetail } from "@/components/article-detail";
import { EventDetail } from "@/components/event-detail";
import { EventsPage } from "@/components/events-page";
import { PortalTopic } from "@/components/portal-topic";
import { getPublishedArticle, getPublishedArticles } from "@/lib/article-store";
import { getPublishedEvent, getPublishedEvents } from "@/lib/event-store";
import { eventHref, eventTypeFromPortalSlug } from "@/lib/events";
import { articleHref, portalSections } from "@/lib/portal";
import { getManagedPortalSection, getManagedPortalSubpage } from "@/lib/section-store";
import { buildPageMetadata, searchResultTitle } from "@/lib/seo";

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
      return buildPageMetadata({
        title: searchResultTitle(event.title),
        description: event.excerpt,
        path: eventHref(event),
        image: event.imageUrl || null,
        imageAlt: event.title,
      });
    }
  }
  const article = await getPublishedArticle(slug);
  if (!article) return {};
  return buildPageMetadata({
    title: searchResultTitle(article.title),
    description: article.excerpt,
    path: articleHref(article),
    image: article.image || null,
    imageAlt: article.title,
    type: "article",
    publishedTime: article.dateIso,
    modifiedTime: article.updatedDateIso,
    authors: [article.author],
    section: section === "novinky" ? article.newsCategory : article.category,
  });
}

export default async function PortalContentPage({ params }: Props) {
  const { section, slug } = await params;
  if (!(await getManagedPortalSection(section))?.visible) notFound();
  const portalTopic = await getManagedPortalSubpage(section, slug);
  if (section === "podujatia" && (slug === "kalendar" || eventTypeFromPortalSlug(slug))) {
    return <EventsPage events={await getPublishedEvents()} initialType={eventTypeFromPortalSlug(slug) ?? "Všetky"} />;
  }
  const articles = await getPublishedArticles();
  if (portalTopic) return <PortalTopic {...portalTopic} articles={articles} />;

  if (section === "podujatia") {
    const event = await getPublishedEvent(slug);
    if (event) return <EventDetail event={event} />;
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
