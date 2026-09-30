import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NewsHub } from "@/components/news-hub";
import { getAllPublishedArticleSummaries } from "@/lib/article-store";
import { getManagedPortalSection } from "@/lib/section-store";
import { buildPageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

const NEWS_DESCRIPTION = "Kompletný archív publikovaných správ, príbehov, výskumu a užitočných tém zo sveta psov.";

export const metadata: Metadata = buildPageMetadata({
  title: "Novinky zo sveta psov",
  description: NEWS_DESCRIPTION,
  path: "/clanky",
});

export default async function ArticlesPage() {
  const [section, articles] = await Promise.all([
    getManagedPortalSection("novinky"),
    getAllPublishedArticleSummaries({ portalSection: "novinky" }),
  ]);

  if (!section?.visible) notFound();

  return <NewsHub articles={articles} section={section} landingPath="/clanky" />;
}
