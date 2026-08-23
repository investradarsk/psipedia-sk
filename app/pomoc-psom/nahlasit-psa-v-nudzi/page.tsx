import type { Metadata } from "next";
import { HelpReportGuide } from "@/components/help-report-guide";

export const metadata: Metadata = {
  title: "Nahlásiť psa v núdzi",
  description: "Bezpečný postup, keď nájdeš strateného, zraneného alebo ohrozeného psa.",
  alternates: { canonical: "/pomoc-psom/nahlasit-psa-v-nudzi" },
};

export default function ReportDogInNeedPage() {
  return <HelpReportGuide />;
}
