import type { HelpCase } from "@/lib/help";
import { helpDetailViews } from "@/components/help-details/help-detail-types";

export function HelpDetail({ item }: { item: HelpCase }) {
  const DetailView = helpDetailViews[item.category];
  return <DetailView item={item} />;
}
