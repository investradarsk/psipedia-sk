import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PortalHub } from "@/components/portal-hub";
import { NewsHub } from "@/components/news-hub";
import { getPublishedArticles } from "@/lib/article-store";
import { getPublishedEvents } from "@/lib/event-store";
import { portalSections } from "@/lib/portal";
import { getManagedPortalSection, listManagedPortalSections } from "@/lib/section-store";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ section: string }> };

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
      description: section.description,
      alternates: { canonical: "/novinky" },
      openGraph: {
        type: "website",
        title: `${section.label} | Psipedia.sk`,
        description: section.description,
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

export default async function PortalSectionPage({ params }: Props) {
  const { section: slug } = await params;
  const [section, allSections, articles, events] = await Promise.all([
    getManagedPortalSection(slug),
    listManagedPortalSections(),
    getPublishedArticles(),
    slug === "podujatia" ? getPublishedEvents() : Promise.resolve(undefined),
  ]);
  if (!section?.visible) notFound();
  if (slug === "novinky") return <NewsHub articles={articles} section={section} />;
  return <PortalHub section={section} allSections={allSections.filter((item) => item.visible)} articles={articles} events={events} />;
}
