import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HelpDetail } from "@/components/help-detail";
import { getPublishedHelpCase } from "@/lib/help-store";
import { getHelpCategory, helpCaseHref } from "@/lib/help";
import { StructuredData } from "@/components/structured-data";
import { buildContentMetadata, helpSeoFallback, resolvedCanonical } from "@/lib/content-seo";
import { SITE_URL } from "@/lib/seo";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ category: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { category, slug } = await params;
  const item = await getPublishedHelpCase(category, slug);
  const fallback = item ? helpSeoFallback(item.title, getHelpCategory(item.category)?.singular ?? "Pomoc psom", item.city) : null;
  return item && fallback ? buildContentMetadata({ seo:item.seo, fallbackTitle:fallback.title,
    fallbackDescription:fallback.description,
    path: helpCaseHref(item),
    image: item.imageUrl || null,
    imageAlt: item.title,
    type: "article",
    publishedTime: item.publishedAt || item.createdAt,
    modifiedTime: item.updatedAt,
    section: "Pomoc psom",
  }) : {};
}

export default async function HelpCasePage({ params }: Props) {
  const { category, slug } = await params;
  const item = await getPublishedHelpCase(category, slug);
  if (!item) notFound();
  const canonical=resolvedCanonical(item.seo,helpCaseHref(item));
  const schema={"@context":"https://schema.org","@graph":[{"@type":"WebPage","@id":canonical,url:canonical,name:item.title,description:item.description||item.excerpt,dateModified:item.updatedAt},{"@type":"BreadcrumbList","@id":`${canonical}#breadcrumb`,itemListElement:[{"@type":"ListItem",position:1,name:"Domov",item:SITE_URL},{"@type":"ListItem",position:2,name:"Pomoc psom",item:`${SITE_URL}/pomoc-psom`},{"@type":"ListItem",position:3,name:getHelpCategory(item.category)?.label,item:`${SITE_URL}/pomoc-psom/${item.category}`},{"@type":"ListItem",position:4,name:item.title,item:canonical}]}]};
  return <><StructuredData value={schema}/><HelpDetail item={item} /></>;
}
