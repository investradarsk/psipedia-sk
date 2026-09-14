import { renderEventMarkdown } from "@/lib/event-markdown";

export function EventMarkdown({ value }: { value: string }) {
  return <div className="event-markdown">{renderEventMarkdown(value)}</div>;
}
