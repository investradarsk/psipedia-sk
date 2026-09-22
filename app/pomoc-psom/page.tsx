import type { Metadata } from "next";
import { HelpOverview, type HelpOverviewItem, type HelpOverviewSection } from "@/components/help-overview";
import { getPublishedHelpCases } from "@/lib/help-store";
import { getPublicAdoptions } from "@/lib/adoption-store";
import { listPublicDogReports } from "@/lib/lost-found-dog-store";
import {
  getHelpCategory,
  helpCategories,
  helpCaseHref,
  helpCategoryHref,
  type HelpCase,
  type HelpCategorySlug,
} from "@/lib/help";
import {
  dogReportHref,
  dogReportTitle,
  dogReportTypeShortLabel,
  type PublicDogReport,
} from "@/lib/lost-found-dogs";
import type { AdoptionDog } from "@/lib/adoption";
import { buildPageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata: Metadata = buildPageMetadata({
  title: "Pomoc psom",
  description: "Adopcie, stratené psy, urgentné prípady, útulky a overené zbierky na jednom mieste.",
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

function genericPreview(item: HelpCase): HelpOverviewItem {
  const category = getHelpCategory(item.category);
  return {
    id: `help:${item.category}:${item.id}`,
    href: helpCaseHref(item),
    title: item.title,
    imageUrl: item.imageUrl,
    eyebrow: category?.singular ?? "Pomoc psom",
    meta: placeMeta(item.organization, item.city, item.region),
    excerpt: item.excerpt,
    badge: item.urgent ? "Urgentné" : item.verified ? "Overené" : null,
    urgent: item.urgent,
  };
}

function adoptionPreview(dog: AdoptionDog): HelpOverviewItem {
  return {
    id: `adoption:${dog.id}`,
    href: `/pomoc-psom/adopcia/${dog.slug}`,
    title: dog.name,
    imageUrl: dog.mainImage,
    eyebrow: "Pes na adopciu",
    meta: placeMeta(dog.organizationName, dog.city, dog.region),
    excerpt: dog.shortDescription,
    badge: dog.status === "RESERVED" ? "Rezervovaný" : null,
  };
}

function reportPreview(report: PublicDogReport): HelpOverviewItem {
  return {
    id: `report:${report.type}:${report.id}`,
    href: dogReportHref(report),
    title: dogReportTitle(report),
    imageUrl: report.mainImage,
    eyebrow: dogReportTypeShortLabel(report.type),
    meta: placeMeta(report.city, report.region, report.breed),
    excerpt: report.description,
    badge: dogReportTypeShortLabel(report.type),
    urgent: report.type === "LOST",
  };
}

export default async function HelpRootPage() {
  const [items, adoptions, lost, found] = await Promise.all([
    getPublishedHelpCases(),
    getPublicAdoptions({ page: 1 }),
    listPublicDogReports("LOST", { page: 1, pageSize: 6 }),
    listPublicDogReports("FOUND", { page: 1, pageSize: 6 }),
  ]);

  const activeGeneric = (category: HelpCategorySlug) =>
    items.filter((item) => item.category === category && !item.resolved);

  const lostFoundPreview = [...lost.items, ...found.items]
    .sort((left, right) => right.eventDate.localeCompare(left.eventDate))
    .slice(0, 6)
    .map(reportPreview);

  const previewByCategory: Partial<Record<HelpCategorySlug, HelpOverviewItem[]>> = {
    adopcia: adoptions.items.slice(0, 6).map(adoptionPreview),
    utulky: activeGeneric("utulky").slice(0, 6).map(genericPreview),
    "docasna-opatera": activeGeneric("docasna-opatera").slice(0, 6).map(genericPreview),
    zbierky: activeGeneric("zbierky").slice(0, 6).map(genericPreview),
    "stratene-a-najdene": lostFoundPreview,
    dobrovolnictvo: activeGeneric("dobrovolnictvo").slice(0, 6).map(genericPreview),
  };

  const categoryCounts: Partial<Record<HelpCategorySlug, number>> = {
    adopcia: adoptions.pagination.total,
    utulky: activeGeneric("utulky").length,
    "docasna-opatera": activeGeneric("docasna-opatera").length,
    zbierky: activeGeneric("zbierky").length,
    "stratene-a-najdene": lost.total + found.total,
    dobrovolnictvo: activeGeneric("dobrovolnictvo").length,
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

  return <HelpOverview sections={sections} totalActive={totalActive} />;
}
