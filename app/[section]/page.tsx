import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EventsPage } from "@/components/events-page";
import { PortalHub } from "@/components/portal-hub";
import { NewsHub } from "@/components/news-hub";
import { getPublishedArticleSummaries } from "@/lib/article-store";
import { getPublishedEvents } from "@/lib/event-store";
import { eventTimeFilterFromParam } from "@/lib/events";
import { portalSections, type ArticlePortalSection } from "@/lib/portal";
import { getManagedPortalSection, listManagedPortalSections } from "@/lib/section-store";

export const dynamic = "force-dynamic";

const NOVINKY_DESCRIPTION = "Výber príbehov, zaujímavostí, výskumu a užitočných tém zo sveta psov.";

type Props = { params: Promise<{ section: string }>; searchParams: Promise<{ termin?: string | string[] }> };

export function generateStaticParams() {
  return portalSections.map((section) => ({ section: section.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { section: slug } = await params;
  const section = await getManagedPortalSection(slug);
  if (!section?.visible) return {};
  if (slug === "novinky" && section) {
    return {
      title: section.label,
      description: NOVINKY_DESCRIPTION,
      alternates: { canonical: "/novinky" },
      openGraph: {
        type: "website",
        title: `${section.label} | Psipedia.sk`,
        description: NOVINKY_DESCRIPTION,
        url: "/novinky",
      },
    };
  }
  return section ? {
    title: section.label,
    description: section.description,
    alternates: { canonical: `/${section.slug}` },
    openGraph: {
      type: "website",
      title: `${section.label} | Psipedia.sk`,
      description: section.description,
      url: `/${section.slug}`,
    },
  } : {};
}

export default async function PortalSectionPage({ params, searchParams }: Props) {
  const { section: slug } = await params;
  const [section, allSections, articles, events] = await Promise.all([
    getManagedPortalSection(slug),
    listManagedPortalSections(),
    slug === "podujatia" ? Promise.resolve([]) : getPublishedArticleSummaries({ portalSection: slug as ArticlePortalSection, limit: 120 }),
    slug === "podujatia" ? getPublishedEvents() : Promise.resolve(undefined),
  ]);
  if (!section?.visible) notFound();
  if (slug === "novinky") return <NewsHub articles={articles} section={section} />;
  if (slug === "podujatia") return <EventsPage events={events ?? []} section={section} initialTime={eventTimeFilterFromParam((await searchParams).termin)} />;
  return <PortalHub section={section} allSections={allSections.filter((item) => item.visible)} articles={articles} events={events} />;
}
