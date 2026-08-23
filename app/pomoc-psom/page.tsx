import type { Metadata } from "next";
import { HelpPage } from "@/components/help-page";
import { getPublishedHelpCases } from "@/lib/help-store";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Pomoc psom",
  description: "Adopcie, stratené psy, urgentné prípady, útulky a overené zbierky na jednom mieste.",
  alternates: { canonical: "/pomoc-psom" },
};

export default async function HelpRootPage() {
  return <HelpPage items={await getPublishedHelpCases()} />;
}
