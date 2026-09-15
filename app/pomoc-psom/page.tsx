import type { Metadata } from "next";
import { HelpPage } from "@/components/help-page";
import { getPublishedHelpCases } from "@/lib/help-store";
import { getPublicAdoptions } from "@/lib/adoption-store";
import { buildPageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata: Metadata = buildPageMetadata({
  title: "Pomoc psom",
  description: "Adopcie, stratené psy, urgentné prípady, útulky a overené zbierky na jednom mieste.",
  path: "/pomoc-psom",
});

export default async function HelpRootPage() {
  const [items, adoptions] = await Promise.all([getPublishedHelpCases(), getPublicAdoptions({ page: 1 })]);
  return <HelpPage items={items} adoptionCount={adoptions.pagination.total} />;
}
