import type { Metadata } from "next";
import Link from "next/link";
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
  return <><HelpPage items={await getPublishedHelpCases()} /><section className="shell" style={{paddingBottom:48}}><h2>Psy na adopciu</h2><p>Samostatný katalóg adopčných profilov s filtrami, stavom adopcie a údajom o poslednom overení.</p><Link href="/pomoc-psom/adopcia">Prejsť na psy na adopciu →</Link></section></>;
}
