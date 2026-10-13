import type { Metadata } from "next";
import { StructuredData } from "@/components/structured-data";
import { HelpOverview, type HelpOverviewItem, type HelpOverviewSection } from "@/components/help-overview";
import {
  getHelpLandingSnapshot,
  type HelpLandingAdoptionItem,
  type HelpLandingGenericItem,
  type HelpLandingReportItem,
} from "@/lib/help-landing-store";
import {
  getHelpCategory,
  helpCategories,
  helpCaseHref,
  helpCategoryHref,
  type HelpCategorySlug,
} from "@/lib/help";
import {
  dogReportHref,
  dogReportTitle,
  dogReportTypeShortLabel,
} from "@/lib/lost-found-dogs";
import { buildCollectionPageJsonLd, coreLandingSeoFallback } from "@/lib/listing-seo";
import { buildPageMetadata } from "@/lib/seo";

const helpRootDescription = "Adopcie, stratené psy, urgentné prípady, útulky, zbierky a ďalšie možnosti pomoci psom na jednom mieste.";
const helpLandingSeo = coreLandingSeoFallback("help");

export const dynamic = "force-dynamic";
export const metadata: Metadata = buildPageMetadata({
  title: helpLandingSeo.title,
  description: helpLandingSeo.description,
  path: "/pomoc-psom",
});

function categoryDestination(category: HelpCategorySlug) {
  if (category === "adopcia") return "/pomoc-psom/adopcia";
  if (category === "stratene-a-najdene") return "/pomoc-psom/stratene-a-najdene";
  return helpCategoryHref({ slug: category as Exclude<HelpCategorySlug, "urgentne-pripady"> });
}

function placeMeta(...parts: Array<string | null | undefined>) {
  return parts.map((part) => part?.trim()).filter(Boolean).join(" · ");
}

function genericPreview(item: HelpLandingGenericItem): HelpOverviewItem {
  const category = getHelpCategory(item.category);
  return {
    id: `help:${item.category}:${item.id}`,
    href: helpCaseHref(item),
    title: item.title,
    imageUrl: item.imageUrl,
    thumbnailImageDisplay: item.thumbnailImageDisplay,
    eyebrow: category?.singular ?? "Pomoc psom",
    meta: placeMeta(item.organization, item.city, item.region),
    excerpt: item.excerpt,
    badge: item.urgent ? "Urgentné" : null,
    urgent: item.urgent,
  };
}

function adoptionPreview(dog: HelpLandingAdoptionItem): HelpOverviewItem {
  return {
    id: `adoption:${dog.id}`,
    href: `/pomoc-psom/adopcia/${dog.slug}`,
    title: dog.name,
    imageUrl: dog.mainImage,
    thumbnailImageDisplay: dog.thumbnailImageDisplay,
    eyebrow: "Pes na adopciu",
    meta: placeMeta(dog.organizationName, dog.city, dog.region),
    excerpt: dog.shortDescription,
    badge: dog.status === "RESERVED" ? "Rezervovaný" : null,
  };
}

function reportPreview(report: HelpLandingReportItem): HelpOverviewItem {
  return {
    id: `report:${report.type}:${report.id}`,
    href: dogReportHref(report),
    title: dogReportTitle(report),
    imageUrl: report.mainImage,
    thumbnailImageDisplay: report.thumbnailImageDisplay,
    eyebrow: dogReportTypeShortLabel(report.type),
    meta: placeMeta(report.city, report.region, report.breed),
    excerpt: report.description,
    badge: dogReportTypeShortLabel(report.type),
    urgent: report.type === "LOST",
  };
}

export default async function HelpRootPage() {
  const { generic, organizations, adoptions, reports } = await getHelpLandingSnapshot();

  // Original overview combines six per type before sorting by event date.
  // Keep LOST before FOUND on equal dates to preserve the stable tie order.
  const lostFoundPreview = [
    ...reports.items.filter((report) => report.type === "LOST"),
    ...reports.items.filter((report) => report.type === "FOUND"),
  ]
    .sort((left, right) => right.eventDate.localeCompare(left.eventDate))
    .slice(0, 6)
    .map(reportPreview);

  const genericPreviewFor = (category: HelpCategorySlug) =>
    generic.items.filter((item) => item.category === category).map(genericPreview);

  const previewByCategory: Partial<Record<HelpCategorySlug, HelpOverviewItem[]>> = {
    adopcia: adoptions.items.map(adoptionPreview),
    utulky: organizations.items.map(genericPreview),
    "docasna-opatera": genericPreviewFor("docasna-opatera"),
    zbierky: genericPreviewFor("zbierky"),
    "stratene-a-najdene": lostFoundPreview,
    dobrovolnictvo: genericPreviewFor("dobrovolnictvo"),
  };

  const categoryCounts: Partial<Record<HelpCategorySlug, number>> = {
    adopcia: adoptions.count,
    utulky: organizations.count,
    "docasna-opatera": generic.counts["docasna-opatera"],
    zbierky: generic.counts.zbierky,
    "stratene-a-najdene": reports.counts.LOST + reports.counts.FOUND,
    dobrovolnictvo: generic.counts.dobrovolnictvo,
  };

  const sections: HelpOverviewSection[] = helpCategories.map((category) => ({
    slug: category.slug,
    label: category.label,
    description: category.description,
    href: categoryDestination(category.slug),
    count: categoryCounts[category.slug] ?? 0,
    items: previewByCategory[category.slug] ?? [],
  }));

  const totalActive = sections.reduce((sum, section) => sum + section.count, 0);
  const schema = buildCollectionPageJsonLd({
    name: "Pomoc psom",
    description: helpRootDescription,
    path: "/pomoc-psom",
    breadcrumbs: [
      { name: "Domov", path: "/" },
      { name: "Pomoc psom", path: "/pomoc-psom" },
    ],
    items: sections.map((section) => ({ name: section.label, path: section.href })),
  });

  return <><StructuredData value={schema} /><HelpOverview sections={sections} totalActive={totalActive} /></>;
}
