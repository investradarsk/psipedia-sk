/** Semantic TypeScript diagnostics only for the Gemini STOP implementation.
 * Uses the repository tsconfig for exact module alias resolution. Unrelated
 * existing type debt cannot turn this isolated feature check into a repo sweep.
 * Global project type checking remains a separate CI responsibility. */
import ts from "typescript";
import path from "node:path";

const root = process.cwd();
const configPath = path.join(root, "tsconfig.gemini-global-stop.json");
const { config, error } = ts.readConfigFile(configPath, ts.sys.readFile);
if (error) {
  process.stderr.write(ts.flattenDiagnosticMessageText(error.messageText, "\n") + "\n");
  process.exitCode = 1;
} else {
  const parsed = ts.parseJsonConfigFileContent(config, ts.sys, root, undefined, configPath);
  const scope = [
    "lib/gemini-global-control.ts",
    "lib/gemini-external-agent.ts",
    "app/api/admin/gemini-automation/control/route.ts",
    "app/api/admin/gemini-automation/route.ts",
    "app/api/admin/gemini-automation/run/route.ts",
    "app/api/internal/gemini-agent/authorize/route.ts",
    "app/admin/automatizacie-gemini/page.tsx",
    "components/admin-gemini-automation-settings.tsx",
  ];
  const rootNames = scope.map(file => path.resolve(root, file));
  const tracked = new Set(rootNames);
  const program = ts.createProgram({ rootNames, options: {
    ...parsed.options, noEmit: true, incremental: false, allowImportingTsExtensions: true,
  }});
  const errors = [...parsed.errors, ...ts.getPreEmitDiagnostics(program)]
    .filter(d => !d.file || tracked.has(path.resolve(d.file.fileName)));
  if (errors.length) {
    const host = {getCanonicalFileName: p => p, getCurrentDirectory:()=>root, getNewLine:()=>ts.sys.newLine};
    process.stderr.write(ts.formatDiagnosticsWithColorAndContext(errors, host));
    process.exitCode = 1;
  } else {
    process.stdout.write("Scoped semantic TypeScript checks passed for " + scope.length
      + " Gemini STOP implementation files.\n");
  }
}
