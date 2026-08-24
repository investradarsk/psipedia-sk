import type { Metadata } from "next";
import { HelpPage } from "@/components/help-page";
import { getPublishedHelpCases } from "@/lib/help-store";
import { buildPageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata: Metadata = buildPageMetadata({
  title: "Pomoc psom",
  description: "Adopcie, stratené psy, urgentné prípady, útulky a overené zbierky na jednom mieste.",
  path: "/pomoc-psom",
});

export default async function HelpRootPage() {
  return <HelpPage items={await getPublishedHelpCases()} />;
}
