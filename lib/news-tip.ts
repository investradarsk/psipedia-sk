import { getNewsCategory, isNewsCategory, newsCategories, type NewsCategorySlug } from "@/lib/news";

export type NewsTipTopic = NewsCategorySlug | "iny";
export type NewsTipStatus = "new" | "reviewing" | "used" | "dismissed";

export const newsTipTopicOptions = [
  ...newsCategories.map((category) => ({ slug: category.slug, label: category.label, icon: category.icon })),
  { slug: "iny", label: "Iný tip", icon: "💡" },
] as const;

export const newsTipStatusOptions: { value: NewsTipStatus; label: string }[] = [
  { value: "new", label: "Nový" },
  { value: "reviewing", label: "Overujem" },
  { value: "used", label: "Spracovaný" },
  { value: "dismissed", label: "Odložený" },
];

export type NewsTip = {
  id: number;
  topic: NewsTipTopic;
  title: string;
  summary: string;
  sourceUrl: string | null;
  location: string;
  eventDate: string | null;
  contactName: string;
  contactEmail: string | null;
  status: NewsTipStatus;
  internalNote: string;
  consent: boolean;
  createdAt: string;
  updatedAt: string;
};

export function isNewsTipTopic(value: string): value is NewsTipTopic {
  return value === "iny" || isNewsCategory(value);
}

export function isNewsTipStatus(value: string): value is NewsTipStatus {
  return newsTipStatusOptions.some((item) => item.value === value);
}

export function newsTipTopicLabel(topic: NewsTipTopic) {
  return topic === "iny" ? "Iný tip" : getNewsCategory(topic)?.label ?? "Iný tip";
}

export function newsTipTopicIcon(topic: NewsTipTopic) {
  return topic === "iny" ? "💡" : getNewsCategory(topic)?.icon ?? "💡";
}
