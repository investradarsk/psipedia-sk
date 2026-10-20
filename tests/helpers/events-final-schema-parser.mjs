/**
 * Split migration SQL for the local-only public-events E2E fixture.
 * Remove full-line comments before splitting: historical migrations include
 * semicolons inside comments (e.g. 0119 Gemini queue), which otherwise hide
 * the CREATE TABLE statement immediately after the comment.
 *
 * Only the calling fixture chooses which schema DDL statements to execute.
 * This helper never opens a database or executes SQL.
 */
export function splitLocalSchemaStatements(source) {
  return source
    .replace(/^[ \t]*--[^\r\n]*/gm, "")
    .split(";")
    .map(statement => statement.trim())
    .filter(Boolean);
}
