import type { Metadata } from "next";
import { HelpPage, type HelpCategoryCounts } from "@/components/help-page";
import { getPublishedHelpCases } from "@/lib/help-store";
import { getPublicAdoptions } from "@/lib/adoption-store";
import { listPublicDogReports } from "@/lib/lost-found-dog-store";
import { buildPageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata: Metadata = buildPageMetadata({
  title: "Pomoc psom",
  description: "Adopcie, stratené psy, urgentné prípady, útulky a overené zbierky na jednom mieste.",
  path: "/pomoc-psom",
});

export default async function HelpRootPage() {
  const [items, adoptions, lost, found] = await Promise.all([
    getPublishedHelpCases(),
    getPublicAdoptions({ page: 1 }),
    listPublicDogReports("LOST", { page: 1, pageSize: 1 }),
    listPublicDogReports("FOUND", { page: 1, pageSize: 1 }),
  ]);
  const activeGeneric = (category: keyof HelpCategoryCounts) => items.filter((item) => item.category === category && !item.resolved).length;
  const categoryCounts: HelpCategoryCounts = {
    adopcia: adoptions.pagination.total,
    utulky: activeGeneric("utulky"),
    "docasna-opatera": activeGeneric("docasna-opatera"),
    zbierky: activeGeneric("zbierky"),
    "stratene-a-najdene": lost.total + found.total,
    dobrovolnictvo: activeGeneric("dobrovolnictvo"),
  };
  return <HelpPage items={items} categoryCounts={categoryCounts} />;
}
