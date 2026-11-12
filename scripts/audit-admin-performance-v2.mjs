/**
 * Psipedia Admin performance phase 2: reproducible, source-only baseline.
 *
 * Run: npm run audit:admin-performance-v2
 * JSON: npm run audit:admin-performance-v2 -- --json
 *
 * The script performs NO network requests, production queries, writes, or
 * migrations. Source bytes and AST counts are NOT browser bundle sizes, INP,
 * TTFB, D1 query plans, or mobile memory measurements.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import ts from "typescript";

export const ADMIN_AUDIT_TARGETS = Object.freeze([
  "components/admin-article-editor.tsx",
  "components/admin-directory-editor.tsx",
  "components/admin-breed-editor.tsx",
  "components/admin-event-editor.tsx",
  "components/admin-navigation.tsx",
  "components/admin-quick-navigation-dialog.tsx",
  "components/admin-shell.tsx",
  "components/admin-query-provider.tsx",
  "components/admin-record-table.tsx",
  "lib/admin-global-search.ts",
  "lib/admin-attention-queue-store.ts",
  "app/admin/page.tsx",
]);

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function runtimeImport(declaration) {
  const clause = declaration.importClause;
  if (!clause) return true; // side-effect import
  if (clause.isTypeOnly) return false;
  if (clause.name) return true;
  const binding = clause.namedBindings;
  if (!binding) return false;
  if (ts.isNamespaceImport(binding)) return true;
  return binding.elements.some(element => !element.isTypeOnly);
}

export function measureAdminSource(path, source) {
  const tree = ts.createSourceFile(
    path, source, ts.ScriptTarget.Latest, true,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  if (tree.parseDiagnostics.length) {
    throw new Error(path + " has " + tree.parseDiagnostics.length + " TypeScript parse error(s)");
  }

  const metrics = {
    path,
    isClientModule: /^\s*["']use client["']\s*;?/.test(source),
    sourceBytes: Buffer.byteLength(source, "utf8"),
    sourceLines: source.split("\n").length,
    runtimeStaticImports: 0,
    typeOnlyImports: 0,
    useStateCalls: 0,
    fetchCallsites: 0,
    dynamicImportCallsites: 0,
    dynamicWrapperCallsites: 0,
  };
  const visit = node => {
    if (ts.isImportDeclaration(node)) {
      if (runtimeImport(node)) metrics.runtimeStaticImports += 1;
      else metrics.typeOnlyImports += 1;
    }
    if (ts.isCallExpression(node)) {
      const expression = node.expression;
      if (expression.kind === ts.SyntaxKind.ImportKeyword) metrics.dynamicImportCallsites += 1;
      if (ts.isIdentifier(expression)) {
        if (expression.text === "useState") metrics.useStateCalls += 1;
        if (expression.text === "fetch") metrics.fetchCallsites += 1;
        if (expression.text === "dynamic") metrics.dynamicWrapperCallsites += 1;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return metrics;
}

export function auditAdminSources({
  sourceReader = path => readFileSync(join(root, path), "utf8"),
  targets = ADMIN_AUDIT_TARGETS,
} = {}) {
  const files = targets.map(path => measureAdminSource(path, sourceReader(path)));
  const searchSource = sourceReader("lib/admin-global-search.ts");
  const notifications = sourceReader("lib/admin-attention-queue-store.ts");
  const quickSearch = sourceReader("components/admin-quick-navigation-dialog.tsx");
  const shell = sourceReader("components/admin-shell.tsx");
  const adminHome = sourceReader("app/admin/page.tsx");
  return {
    kind: "psipedia-admin-source-audit-not-runtime-metrics",
    targets: files,
    evidence: {
      searchCategoriesDeclared: (searchSource.match(/category:\s*"[^"]+",\s*prefix:/g) ?? []).length,
      containsUnindexedSubstringExpression: searchSource.includes("instr(lower(coalesce("),
      usesD1Batch: searchSource.includes("database.batch"),
      hasSearchAbortController: quickSearch.includes("new AbortController()"),
      hasQuickSearchTtl: quickSearch.includes("SEARCH_CACHE_TTL_MS"),
      attentionSourceSqlBranches: (notifications.match(/SELECT\s+['"]?[A-Z][A-Z_]+['"]?\s+AS\s+sourceType/gi) ?? []).length,
      shellUsesAttentionPromise: shell.includes("attentionSummaryPromise"),
      homeSharesAttentionPromise: adminHome.includes("attentionSummaryPromise={attentionPromise}"),
    },
    limitations: [
      "Source size is not shipped or compressed JavaScript size.",
      "Declared SQL branches are not a D1 cost or execution time.",
      "No authentic user session, Cloudflare analytics, or production D1 was queried.",
      "No iOS Safari, WebKit, user interaction latency, or heap was measured.",
    ],
  };
}

const invokedAsScript = process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedAsScript) {
  const result = auditAdminSources();
  if (process.argv.includes("--json")) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } else {
    process.stdout.write("Psipedia Admin: source-only performance baseline (NOT bundle size)\n\n");
    for (const entry of result.targets) {
      process.stdout.write(
        entry.path + ": " + entry.sourceBytes + " source bytes, " +
        entry.runtimeStaticImports + " runtime imports, " +
        entry.useStateCalls + " useState calls, " +
        entry.dynamicImportCallsites + " lazy imports\n",
      );
    }
    process.stdout.write("\n" + JSON.stringify(result.evidence, null, 2) + "\n");
    process.stdout.write("\nNo live performance claim: measure build chunks, D1 read metrics and device INP separately.\n");
  }
}
