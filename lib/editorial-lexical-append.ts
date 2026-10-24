/**
 * Add new content written in Lexical without interpreting or rewriting existing
 * persisted Markdown. New content is escaped as plain Markdown paragraphs.
 */
export function appendLexicalPlainTextToMarkdown(existing: string, fresh: string): string {
  const text = fresh.replace(/\r\n?/g, "\n").trim();
  if (!text) return existing;
  const escaped = text
    .split("\n")
    .map(line => line.replace(/([\\`*_{}\[\]()#+.!=|>~-])/g, "\\$1"))
    .join("\n");
  return existing ? existing.replace(/\s*$/, "") + "\n\n" + escaped : escaped;
}
