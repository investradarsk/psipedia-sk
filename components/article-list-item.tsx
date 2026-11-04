import type { ArticleListingCard } from "@/lib/content";
export { articleTopicLabel } from "@/lib/article-card-presentation";
import { ArticleCard } from "./article-card";

/** Backwards-compatible adapter; archive, sections and homepage use the same row renderer. */
export function ArticleListItem(props: {
  article: ArticleListingCard;
  topicLabel?: string;
  className?: string;
  listItem?: boolean;
  anchorId?: string;
}) {
  return <ArticleCard {...props} variant="row" />;
}
