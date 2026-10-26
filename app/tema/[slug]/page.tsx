import { notFound, permanentRedirect } from "next/navigation";
import { categories } from "@/lib/content";
import { legacyTopicRedirectHref } from "@/lib/article-category-routes";

/** All four legacy /tema/* archives have a single replacement destination. */
export function generateStaticParams() {
  return categories.map((category) => ({ slug: category.slug }));
}

export default async function LegacyTopicPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const destination = legacyTopicRedirectHref(slug);
  if (!destination) notFound();
  permanentRedirect(destination);
}
