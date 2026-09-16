import { articleBulkAdapter } from "./article-adapter";
import { directoryBulkAdapter } from "./directory-adapter";
import type { BulkModule } from "./core";

export function getBulkModuleAdapter(module: BulkModule) {
  if (module === "directory") return directoryBulkAdapter;
  if (module === "articles") return articleBulkAdapter;
  return null;
}
