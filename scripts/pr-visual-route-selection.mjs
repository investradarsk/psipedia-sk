import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

// Keep the visual PR job bounded: at most four representative, read-only routes.
export const MAX_VISUAL_ROUTES = 4;
export const GLOBAL_ROUTES = Object.freeze(["/", "/adresar", "/podujatia", "/pomoc-psom"]);

const routeRules = [
  [/^app\/admin\/|^components\/admin[-/]|^app\/admin-workspace\.css$/, "/admin"],
  [/^app\/podujatia\/|^components\/(?:event|calendar)|^lib\/event-calendar/, "/podujatia"],
  [/^app\/adresar\/|^components\/directory[-/]|^components\/service[-/]/, "/adresar"],
  [/^app\/pomoc-psom\/|^components\/help[-/]/, "/pomoc-psom"],
  [/^app\/plemena\/|^components\/breed[-/]/, "/plemena"],
  [/^app\/(?:clanky|novinky)\/|^components\/(?:article|editorial)[-/]/, "/clanky"],
  [/^app\/steniatka\/|^components\/puppy[-/]/, "/steniatka"],
  [/^app\/starostlivost\/|^components\/health[-/]/, "/starostlivost"],
  [/^app\/aktivity\/|^components\/training[-/]/, "/aktivity"],
  [/^app\/mapa\/|^components\/map[-/]/, "/mapa"],
  [/^app\/recenzie\/|^components\/review[-/]/, "/recenzie"],
  [/^app\/page\.(tsx|jsx)$|^app\/home.*\.css$|^components\/home[-/]/, "/"],
];

export function parseExplicitVisualRoutes(body) {
  const text = String(body ?? "");
  const routeLines = [...text.matchAll(/^VISUAL_(?:REVIEW|ACCEPTANCE)_ROUTES:[ \t]*([^\r\n]*)/gm)];
  if (!routeLines.length) return null;
  const routes = routeLines.flatMap(match => match[1].split(",").map(route => route.trim()));
  if (routes.length < 1 || routes.length > MAX_VISUAL_ROUTES) throw new Error("Choose 1–4 visual preview routes.");
  if (new Set(routes).size !== routes.length) throw new Error("Duplicate visual routes.");
  for (const route of routes) {
    if (!/^\/[A-Za-z0-9/_-]*$/.test(route) || route.includes("//") || route.includes("..") || route.length > 160) {
      throw new Error("Unsupported or unsafe visual preview route: " + route);
    }
  }
  return routes;
}

export function selectVisualReviewRoutes(changedFiles, body = "") {
  const explicit = parseExplicitVisualRoutes(body);
  if (explicit) return { routes: explicit, reason: "explicit PR route selection" };
  if (!Array.isArray(changedFiles) || changedFiles.some(file => typeof file !== "string")) {
    throw new Error("Expected changed repository paths.");
  }

  // A shared design component can change every public page.
  const globalChange = changedFiles.some(file =>
    /^(?:app\/(?:layout\.tsx|globals\.css|design-system\.css)|styles\/|components\/public-visual-system\/|components\/page-system\.)/.test(file));
  const selected = new Set(globalChange ? GLOBAL_ROUTES : []);

  for (const file of changedFiles) {
    for (const [pattern, route] of routeRules) {
      if (pattern.test(file)) {
        selected.add(route);
        break;
      }
    }
    // Don't leave an unfamiliar visual screen silently unreviewed.
    if (/^app\/.*\.(tsx|jsx|css)$/.test(file) || /^components\/.*\.(tsx|jsx|css)$/.test(file)) {
      if (![...routeRules].some(([pattern]) => pattern.test(file)) && !globalChange) selected.add(file.startsWith("app/admin/") || file.startsWith("components/admin") ? "/admin" : "/");
    }
  }

  // This workflow also watches scripts/tests/docs; don't launch costly browser
  // previews for documentation-only or nonvisual changes.
  const routes = [...selected].slice(0, MAX_VISUAL_ROUTES);
  return { routes, reason: globalChange ? "shared visual design" : "changed UI files" };
}

function changedPathsFromGit(baseSha) {
  if (!/^[a-f0-9]{40}$/i.test(baseSha ?? "")) throw new Error("Missing or invalid PR base commit SHA.");
  const ancestor = execFileSync("git", ["merge-base", "HEAD", baseSha], { encoding: "utf8" }).trim();
  const output = execFileSync("git", ["diff", "--name-only", "-z", ancestor, "HEAD"], { encoding: "utf8" });
  return output.split("\0").filter(Boolean);
}

export function formatRouteSelectionOutputs(selection) {
  return {
    enabled: selection.routes.length > 0,
    routes: selection.routes.join(","),
    reason: selection.reason,
  };
}

function run() {
  const changed = changedPathsFromGit(process.env.PR_BASE_SHA);
  const selection = selectVisualReviewRoutes(changed, process.env.PR_BODY);
  const outputs = formatRouteSelectionOutputs(selection);
  const summary = [
    "### PR Visual Evidence – automatic route selection",
    "",
    "Changed files: " + changed.length + ".",
    "Selection: " + outputs.reason + ".",
    "Routes: " + (outputs.routes || "none (nonvisual PR)") + ".",
    "Comparisons use only isolated, local revisions; no production access.",
    "",
  ].join("\n");
  console.log(summary);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, "enabled=" + outputs.enabled + "\n");
  if (process.env.GITHUB_ENV) appendFileSync(process.env.GITHUB_ENV, "VISUAL_SELECTED_ROUTES=" + outputs.routes + "\n");
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) run();
