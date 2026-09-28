import type { Metadata } from "next";
import { HelpReportGuide } from "@/components/help-report-guide";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Nahlásiť psa v núdzi",
  description: "Bezpečný postup, keď nájdeš strateného, zraneného alebo ohrozeného psa.",
  path: "/pomoc-psom/nahlasit-psa-v-nudzi",
});

export default function ReportDogInNeedPage() {
  return <HelpReportGuide />;
}
