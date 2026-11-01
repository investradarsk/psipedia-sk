import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const SOURCE_ROOTS = ["app", "components", "lib", "hooks"];
const EXTENSIONS = [".tsx", ".ts", ".jsx", ".js", ".mts", ".mjs"];
const OMIT = new Set(["node_modules", ".next", ".git", "dist", "generated", "__tests__"]);

function walk(directory, result) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || OMIT.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(absolute, result);
    else if (entry.isFile() && EXTENSIONS.some((ext) => absolute.endsWith(ext)) &&
      !/(\.d\.ts|\.test\.[cm]?[jt]sx?|\.spec\.[cm]?[jt]sx?)$/.test(absolute)) result.push(absolute);
  }
}

function relative(root, absolute) {
  return path.relative(root, absolute).split(path.sep).join("/");
}

function resolveImport(root, from, specifier, paths) {
  let target;
  if (specifier.startsWith("@/")) target = path.resolve(root, specifier.slice(2));
  else if (specifier.startsWith(".")) target = path.resolve(path.dirname(from), specifier);
  else return null;
  for (const candidate of [target, ...EXTENSIONS.map((ext) => target + ext),
    ...EXTENSIONS.map((ext) => path.join(target, "index" + ext))]) {
    const file = relative(root, candidate);
    if (paths.has(file)) return file;
  }
  return null;
}

function publicRoute(file) {
  const parts = file.replace(/^app\//, "").replace(/(^|\/)page\.[jt]sx?$/, "").split("/");
  const useful = parts.filter((part) => part && !part.startsWith("(") && !part.startsWith("@"));
  return "/" + useful.join("/");
}

function componentName(file) {
  return path.basename(file).replace(/\.[jt]sx?$/, "");
}

// Heuristic display groups: related purpose, never proof of visual duplication.
const VISUAL_FAMILIES = [
  { id: "hero", label: "Hero a hlavičky", match: /hero|masthead|section-header|page-header|heading/i },
  { id: "banner", label: "Bannery", match: /banner|promo|callout|content-hub-cta/i },
  { id: "cta", label: "Tlačidlá a akcie", match: /action|button|cta|favorite|bookmark|share/i },
  { id: "filter", label: "Vyhľadávanie a filtre", match: /search|filter|form-control|input|select|query/i },
  { id: "card", label: "Karty a zoznamy", match: /card|tile|list-item|list-row|preview/i },
  { id: "category", label: "Podkategórie a navigácia", match: /categor|subcategory|nav|tabs|breadcrumb/i },
];
const FRIENDLY_NAMES = {
  "unified-section-hero": "Spoločný hero",
  "section-hero": "Starší hero",
  "public-magazine-banner": "Fotografický a promo banner",
  "public-banner-frame": "Spoločný základ bannerov",
  "public-context-banner": "Informačný banner",
  "public-help-banner": "Bannery Pomoc psom",
  "public-article-callout": "Výzva v článku",
  "content-hub-cta": "Odporúčací banner",
  "public-subcategory-navigator": "Navigácia podkategórií",
  "portal-section-tabs": "Prepínač kategórií",
  "article-card": "Karta článku",
  "article-list-item": "Malá karta článku",
  "public-form-controls": "Spoločné formulárové polia",
  "home-portal-search": "Vyhľadávanie na homepage",
  "section-hero-search": "Vyhľadávanie v sekciách",
};
const RELATED = [
  { id: "hero", title: "Hlavičky stránok", description: "Overiť zhodu hlavných hero; detaily môžu mať iné rozloženie.", names: ["unified-section-hero", "section-hero", "public-visual-system"] },
  { id: "banner", title: "Bannery a promo bloky", description: "Overiť spoločný základ a zámerné varianty fotografií či upozornení.", names: ["public-banner-frame", "public-magazine-banner", "public-context-banner", "public-help-banner", "public-photo-callout", "public-article-callout", "content-hub-cta"] },
  { id: "cta", title: "Výzvy na akciu", description: "Overiť vizuálnu jednotnosť CTA pri zachovaní funkcie.", names: ["public-visual-system", "content-hub-cta", "public-article-callout", "public-magazine-banner"] },
  { id: "filter", title: "Vyhľadávanie a filtre", description: "Overiť dizajn, zachovať rozdielne parametre vyhľadávania.", names: ["public-form-controls", "home-portal-search", "section-hero-search", "directory-filter-form", "article-browser"] },
  { id: "card", title: "Karty a výpisy", description: "Overiť rozmery a typografiu; obsah kariet môže byť iný.", names: ["article-card", "article-list-item", "public-visual-system", "home-editorial", "event-card"] },
  { id: "category", title: "Podkategórie", description: "Overiť desktopové varianty bez úpravy mobilu.", names: ["public-subcategory-navigator", "portal-section-tabs", "portal-mobile-category-select", "public-help-category-nav", "directory-category-navigation"] },
];
export function componentFamily(file) {
  const name = componentName(file);
  return VISUAL_FAMILIES.find(f => f.match.test(name))?.id ?? "other";
}
function relatedGroupsFor(components) {
  const byName = new Map();
  for (const c of components) {
    if (!byName.has(c.name)) byName.set(c.name, []);
    byName.get(c.name).push(c.path);
  }
  return RELATED.map(g => ({
    id: g.id, title: g.title, description: g.description,
    paths: g.names.flatMap(name => byName.get(name) || []),
  })).filter(g => g.paths.length > 1);
}

function isComponent(file) {
  return file.endsWith(".tsx") || file.endsWith(".jsx")
    ? file.startsWith("components/") || /^app\/.*\/(?:_?components)\/.+\.[jt]sx?$/.test(file)
    : false;
}

export function buildRegistry(root) {
  const absoluteRoot = path.resolve(root);
  const absoluteFiles = [];
  for (const folder of SOURCE_ROOTS) walk(path.join(absoluteRoot, folder), absoluteFiles);
  const allPaths = new Set(absoluteFiles.map((file) => relative(absoluteRoot, file)));
  const imports = new Map();
  const importers = new Map();

  for (const absolute of absoluteFiles) {
    const file = relative(absoluteRoot, absolute);
    const source = fs.readFileSync(absolute, "utf8");
    const scriptKind = absolute.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, scriptKind);
    const dependencies = new Set();
    for (const statement of tree.statements) {
      const moduleSpecifier = (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement))
        ? statement.moduleSpecifier : undefined;
      if (!moduleSpecifier || !ts.isStringLiteral(moduleSpecifier)) continue;
      const resolved = resolveImport(absoluteRoot, absolute, moduleSpecifier.text, allPaths);
      if (resolved) dependencies.add(resolved);
    }
    imports.set(file, [...dependencies].sort());
    for (const dependency of dependencies) {
      if (!importers.has(dependency)) importers.set(dependency, new Set());
      importers.get(dependency).add(file);
    }
  }

  const routes = [...allPaths].filter((file) => /^app\/.*\/page\.[jt]sx?$/.test(file) ||
    /^app\/page\.[jt]sx?$/.test(file)).sort();
  const usedBy = new Map();
  for (const routeFile of routes) {
    const visited = new Set();
    const remaining = [routeFile];
    while (remaining.length) {
      const next = remaining.pop();
      if (visited.has(next)) continue;
      visited.add(next);
      for (const dependency of imports.get(next) || []) remaining.push(dependency);
    }
    for (const file of visited) {
      if (!usedBy.has(file)) usedBy.set(file, new Set());
      usedBy.get(file).add(publicRoute(routeFile));
    }
  }

  const components = [...allPaths].filter(isComponent).sort().map((file) => {
    const pages = [...(usedBy.get(file) || [])].sort();
    const consumers = [...(importers.get(file) || [])].sort();
    return {
      name: componentName(file),
      label: FRIENDLY_NAMES[componentName(file)] ?? componentName(file).replace(/-/g, " "),
      family: componentFamily(file),
      path: file,
      routes: pages,
      consumers,
      routeCount: pages.length,
      shared: pages.length >= 2,
      unreferenced: consumers.length === 0,
      area: pages.some((page) => page.startsWith("/admin"))
        ? (pages.some((page) => !page.startsWith("/admin")) ? "mixed" : "admin") : "public",
    };
  });

  const sameName = new Map();
  for (const item of components) {
    const key = item.name.toLowerCase();
    if (!sameName.has(key)) sameName.set(key, []);
    sameName.get(key).push(item.path);
  }
  return {
    version: 2,
    generatedAt: new Date().toISOString(),
    totals: {
      components: components.length,
      pages: routes.length,
      shared: components.filter((item) => item.shared).length,
      unreferenced: components.filter((item) => item.unreferenced).length,
    },
    sameNameCandidates: [...sameName.entries()].filter(([, paths]) => paths.length > 1)
      .map(([name, paths]) => ({ name, paths })).sort((a, b) => a.name.localeCompare(b.name)),
    families: VISUAL_FAMILIES.map(({ id, label }) => ({ id, label })),
    relatedGroups: relatedGroupsFor(components),
    components,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.cwd();
  const output = path.join(root, "lib/generated/component-registry.json");
  const data = buildRegistry(root);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(data, null, 2) + "\n");
  console.log("Component registry: " + data.totals.components + " components, " +
    data.totals.pages + " routes, " + data.totals.shared + " shared.");
}
