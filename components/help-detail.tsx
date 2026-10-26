import type { HelpCase } from "@/lib/help";
import { helpDetailViews } from "@/components/help-details/help-detail-types";

export function HelpDetail({ item }: { item: HelpCase }) {
  if (item.category === "utulky") {
    throw new Error("Organization details are rendered by the canonical /organizacie/[slug] route.");
  }
  if (item.category === "adopcia") {
    throw new Error("Adoption details are rendered by the canonical /pomoc-psom/adopcia/[slug] route.");
  }
  const DetailView = helpDetailViews[item.category];
  return <DetailView item={item} />;
}
