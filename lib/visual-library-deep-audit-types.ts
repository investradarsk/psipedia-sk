/** Generated build-time audit; source-file facts, NOT verified DOM placements. */
export type DeepVisualModule = {
  path: string;
  role: "page" | "layout" | "route-shell" | "component" | "app-module" | "lib-jsx" | "other-jsx";
  registered: boolean;
  jsxElements: number;
  routes: string[];
};
export type SourceMatchGroup = {
  id: string;
  kind: "identical-file" | "identical-jsx-shape";
  files: string[];
  count: number;
};
export type ExactCssGroup = {
  id: string;
  propertyCount: number;
  declarations: string[];
  context: string;
  filesCount: number;
  members: Array<{file:string;selector:string;line:number}>;
};
export type VisualDeepAudit = {
  version: number;
  totals: {
    jsxFiles: number;
    componentsIndexed: number;
    otherJsxFiles: number;
    cssFiles: number;
    cssRules: number;
    exactCssGroups: number;
    exactSourceGroups: number;
    matchingJsxStructureGroups: number;
  };
  modules: DeepVisualModule[];
  cssFiles: Array<{path:string;rules:number}>;
  identicalSourceGroups: SourceMatchGroup[];
  similarStructureGroups: SourceMatchGroup[];
  exactCssDeclarationGroups: ExactCssGroup[];
};
