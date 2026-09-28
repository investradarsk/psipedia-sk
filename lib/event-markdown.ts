import { createElement as h, type ReactNode } from "react";

// Deliberately small Markdown subset. React escapes every text node; HTML is
// never parsed, decoded, or passed to dangerouslySetInnerHTML.
export function safeEventLink(value: string): string | null {
  if (/[\s\\\u0000-\u001f\u007f]/.test(value)) return null;
  if (/^\/(?!\/)/.test(value) || /^#[a-zA-Z0-9_-]+$/.test(value)) return value;
  try {
    const url = new URL(value);
    return ["https:", "http:", "mailto:"].includes(url.protocol) ? value : null;
  } catch { return null; }
}
function inline(value: string, depth = 0): ReactNode[] {
  if (depth > 5) return [value];
  const pattern = /\*\*([^*\n]+)\*\*|\*([^*\n]+)\*|\[([^\]\n]+)\]\(([^)\n]+)\)/g;
  const nodes: ReactNode[] = [];
  let cursor = 0;
  for (const match of value.matchAll(pattern)) {
    nodes.push(value.slice(cursor, match.index));
    const key = match.index;
    if (match[1]) nodes.push(h("strong", { key }, ...inline(match[1], depth + 1)));
    else if (match[2]) nodes.push(h("em", { key }, match[2]));
    else {
      const href = safeEventLink(match[4]);
      nodes.push(href ? h("a", { key, href, rel: "nofollow noopener noreferrer" }, ...inline(match[3], depth + 1)) : match[0]);
    }
    cursor = match.index! + match[0].length;
  }
  nodes.push(value.slice(cursor));
  return nodes;
}
export function renderEventMarkdown(value: string): ReactNode[] {
  const lines = value.replace(/\r\n?/g, "\n").split("\n");
  const result: ReactNode[] = [];
  const listLine = (line: string) => /^(?:[-*] |\d+\. )/.test(line);
  for (let i = 0; i < lines.length;) {
    const key = i;
    if (!lines[i].trim()) { i++; continue; }
    if (/^#{2,3} /.test(lines[i])) { result.push(h("h3", { key }, ...inline(lines[i++].replace(/^#{2,3} /, "")))); continue; }
    if (listLine(lines[i])) {
      const ordered = /^\d+\. /.test(lines[i]);
      const items: ReactNode[] = [];
      while (i < lines.length && listLine(lines[i]) && ordered === /^\d+\. /.test(lines[i])) {
        items.push(h("li", { key: i }, ...inline(lines[i++].replace(/^(?:[-*] |\d+\. )/, ""))));
      }
      result.push(h(ordered ? "ol" : "ul", { key }, ...items)); continue;
    }
    const paragraph: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^#{2,3} /.test(lines[i]) && !listLine(lines[i])) paragraph.push(lines[i++]);
    result.push(h("p", { key }, ...inline(paragraph.join("\n"))));
  }
  return result;
}
