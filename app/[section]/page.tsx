import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PortalHub } from "@/components/portal-hub";
import { NewsHub } from "@/components/news-hub";
import { getPublishedArticles } from "@/lib/article-store";
import { getPublishedEvents } from "@/lib/event-store";
import { getPortalSection, portalSections } from "@/lib/portal";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ section: string }> };

export function generateStaticParams() {
  return portalSections.map((section) => ({ section: section.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { section: slug } = await params;
  const section = getPortalSection(slug);
  if (slug === "novinky" && section) {
    return {
      title: "Novinky zo sveta psov",
      description: section.description,
      alternates: { canonical: "/novinky" },
      openGraph: {
        type: "website",
        title: "Novinky zo sveta psov | Psipedia.sk",
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
  const section = getPortalSection(slug);
  if (!section) notFound();
  const [articles, events] = await Promise.all([
    getPublishedArticles(),
    slug === "podujatia" ? getPublishedEvents() : Promise.resolve(undefined),
  ]);
  if (slug === "novinky") return <NewsHub articles={articles} />;
  return <PortalHub section={section} articles={articles} events={events} />;
}
