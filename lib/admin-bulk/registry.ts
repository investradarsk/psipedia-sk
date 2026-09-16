import { articleBulkAdapter } from "./article-adapter";
import { directoryBulkAdapter } from "./directory-adapter";
import type {
  BulkAction,
  BulkEligibility,
  BulkModule,
  BulkResolvedRecord,
} from "./core";
import type { BulkDatabase } from "./snapshot-store";

type BulkModuleAdapter = {
  module: BulkModule;
  allowedActions: readonly BulkAction[];
  normalizeFilter: (raw: unknown) => unknown;
  filterFingerprint: (filter: unknown) => string;
  resolveExplicit: (database: BulkDatabase, ids: readonly number[]) => Promise<BulkResolvedRecord[]>;
  resolveAllMatching: (database: BulkDatabase, filter: unknown) => Promise<BulkResolvedRecord[]>;
  resolveSnapshot: (database: BulkDatabase, ids: readonly string[]) => Promise<BulkResolvedRecord[]>;
  evaluate: (action: BulkAction, record: BulkResolvedRecord) => BulkEligibility;
};

const directoryRegistryAdapter: BulkModuleAdapter = {
  module: directoryBulkAdapter.module,
  allowedActions: directoryBulkAdapter.allowedActions,
  normalizeFilter: directoryBulkAdapter.normalizeFilter,
  filterFingerprint: (filter) => directoryBulkAdapter.filterFingerprint(
    directoryBulkAdapter.normalizeFilter(filter),
  ),
  resolveExplicit: directoryBulkAdapter.resolveExplicit,
  resolveAllMatching: (database, filter) => directoryBulkAdapter.resolveAllMatching(
    database,
    directoryBulkAdapter.normalizeFilter(filter),
  ),
  resolveSnapshot: directoryBulkAdapter.resolveSnapshot,
  evaluate: directoryBulkAdapter.evaluate,
};

const articleRegistryAdapter: BulkModuleAdapter = {
  module: articleBulkAdapter.module,
  allowedActions: articleBulkAdapter.allowedActions,
  normalizeFilter: articleBulkAdapter.normalizeFilter,
  filterFingerprint: (filter) => articleBulkAdapter.filterFingerprint(
    articleBulkAdapter.normalizeFilter(filter),
  ),
  resolveExplicit: articleBulkAdapter.resolveExplicit,
  resolveAllMatching: async (database, filter) => {
    articleBulkAdapter.normalizeFilter(filter);
    return articleBulkAdapter.resolveAllMatching(database, filter);
  },
  resolveSnapshot: articleBulkAdapter.resolveSnapshot,
  evaluate: articleBulkAdapter.evaluate,
};

const adapters: Record<BulkModule, BulkModuleAdapter> = {
  directory: directoryRegistryAdapter,
  articles: articleRegistryAdapter,
};

export function getBulkModuleAdapter(module: BulkModule): BulkModuleAdapter {
  return adapters[module];
}
