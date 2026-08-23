import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HelpDetail } from "@/components/help-detail";
import { getPublishedHelpCase } from "@/lib/help-store";
import { helpCaseHref } from "@/lib/help";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ category: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { category, slug } = await params;
  const item = await getPublishedHelpCase(category, slug);
  return item ? { title: item.title, description: item.excerpt, alternates: { canonical: helpCaseHref(item) }, openGraph: item.imageUrl ? { images: [item.imageUrl] } : undefined } : {};
}

export default async function HelpCasePage({ params }: Props) {
  const { category, slug } = await params;
  const item = await getPublishedHelpCase(category, slug);
  if (!item) notFound();
  return <HelpDetail item={item} />;
}
