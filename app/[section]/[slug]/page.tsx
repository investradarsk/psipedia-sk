import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ArticleDetail } from "@/components/article-detail";
import { EventDetail } from "@/components/event-detail";
import { EventsPage } from "@/components/events-page";
import { PortalTopic } from "@/components/portal-topic";
import { getPublishedArticle, getPublishedArticles } from "@/lib/article-store";
import { getPublishedEvent, getPublishedEvents } from "@/lib/event-store";
import { eventHref, eventTypeFromPortalSlug } from "@/lib/events";
import { articleHref, getPortalSection, getPortalSubpage, portalSections } from "@/lib/portal";
import { searchResultTitle } from "@/lib/seo";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ section: string; slug: string }> };

export function generateStaticParams() {
  return portalSections.flatMap((section) => section.subpages
    .filter((subpage) => !subpage.href)
    .map((subpage) => ({ section: section.slug, slug: subpage.slug })));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { section, slug } = await params;
  const portalTopic = getPortalSubpage(section, slug);
  if (portalTopic) {
    return {
      title: `${portalTopic.subpage.label} – ${portalTopic.section.label}`,
      description: portalTopic.subpage.description,
      alternates: { canonical: `/${portalTopic.section.slug}/${portalTopic.subpage.slug}` },
      openGraph: {
        type: "website",
        title: `${portalTopic.subpage.label} – ${portalTopic.section.label} | Psipedia.sk`,
        description: portalTopic.subpage.description,
        url: `/${portalTopic.section.slug}/${portalTopic.subpage.slug}`,
      },
    };
  }

  if (!getPortalSection(section)) return {};
  if (section === "podujatia") {
    const event = await getPublishedEvent(slug);
    if (event) {
      return {
        title: searchResultTitle(event.title),
        description: event.excerpt,
        alternates: { canonical: eventHref(event) },
        openGraph: event.imageUrl ? { images: [event.imageUrl] } : undefined,
      };
    }
  }
  const article = await getPublishedArticle(slug);
  if (!article) return {};
  return {
    title: searchResultTitle(article.title),
    description: article.excerpt,
    alternates: { canonical: articleHref(article) },
    openGraph: article.image ? { type: "article", images: [article.image], publishedTime: article.dateIso } : { type: "article" },
  };
}

export default async function PortalContentPage({ params }: Props) {
  const { section, slug } = await params;
  if (!getPortalSection(section)) notFound();
  const portalTopic = getPortalSubpage(section, slug);
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
