import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HelpDetail } from "@/components/help-detail";
import { getPublishedHelpCase } from "@/lib/help-store";
import { helpCaseHref } from "@/lib/help";
import { buildPageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ category: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { category, slug } = await params;
  const item = await getPublishedHelpCase(category, slug);
  return item ? buildPageMetadata({
    title: item.title,
    description: item.excerpt,
    path: helpCaseHref(item),
    image: item.imageUrl || null,
    imageAlt: item.title,
    type: "article",
    publishedTime: item.publishedAt || item.createdAt,
    modifiedTime: item.updatedAt,
    authors: ["Redakcia Psipedia"],
    section: "Pomoc psom",
  }) : {};
}

export default async function HelpCasePage({ params }: Props) {
  const { category, slug } = await params;
  const item = await getPublishedHelpCase(category, slug);
  if (!item) notFound();
  return <HelpDetail item={item} />;
}
